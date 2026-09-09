# Push activation preflight

Written before anything is switched on, because the question "could enabling
this release a backlog of real notifications to real people?" deserves an
answer with evidence rather than an assurance.

**Short answer: no, and structurally so.** Not "we checked and the queue looked
empty" — the queue *cannot* contain anything, and the reason is in the schema.

Audited 2026-09-09 against the migrations at `b794b76`.

## What each of the three switches actually controls

`private.notification_configuration` is a single row. Three columns matter.

### `push_provider` — `'disabled'` or `'expo'`

The master gate. Every other switch is read together with it, so
`push_provider = 'disabled'` disables everything regardless of the other two,
and the table's `notification_configuration_coherent_check` makes the incoherent
combination unstorable.

Read by: `register_my_push_device`, `enqueue_push_delivery`,
`warsha_push_claim_batch`, `warsha_push_configuration`, `get_my_push_state`.

### `token_registration_enabled` — may a device be recorded at all

Read by exactly one thing that writes: `public.register_my_push_device`. While
false it returns `{"status":"unavailable"}` and writes a `push_disabled`
operational event. It does not raise, and it does not store anything.

**This switch cannot cause a single notification to be sent.** It controls
whether the audience list may be populated, not whether anything is dispatched.

### `push_delivery_enabled` — may a notification be queued for sending

Read by `private.enqueue_push_delivery`, and by `warsha_push_claim_batch` which
refuses to hand work to the dispatcher while it is false.

## Why there is no backlog — the two-writer proof

The whole risk reduces to two private tables, and each has **exactly one
writer** in the entire migration set. That is not a stylistic observation; it is
what makes the rest of this provable.

| Table | Writers | Gate |
| --- | --- | --- |
| `private.notification_device_tokens` | 1 — `register_my_push_device` | refuses while `token_registration_enabled` is false |
| `private.notification_delivery_attempts` | 1 — `enqueue_push_delivery` | early-returns while `push_delivery_enabled` is false |

Both switches have been false since WPS-014 created the row, and — as
established when the configuration authority was built — **no statement existed
anywhere in the database that could change them** until `202609090002`. That
migration has not been executed against anything.

Therefore, in Production, today:

- **zero device tokens exist.** Registration has never once succeeded.
- **zero delivery attempts are queued.** The only writer has taken its
  early-return branch every single time.

## Why enabling cannot release history

`enqueue_push_delivery` is an **`after insert` trigger on
`public.notifications`**. It reads the configuration at the moment a
notification row is inserted and decides then.

It is forward-only. It never scans `public.notifications`, has no backfill, and
is not attached to `update`. A notification inserted last month while delivery
was off recorded a `push_disabled` event and queued nothing — and turning
delivery on tomorrow does not revisit it. There is no code path that could.

So the feared scenario — a switch flips and a month of accumulated notifications
fan out — has no mechanism. The backlog does not exist, and even if rows were
somehow present, nothing sweeps them.

## The three gates a real notification would still have to pass

Even with the provider on and delivery on, a queued attempt requires **all** of:

1. a **new** notification inserted after the change, and
2. `notification_preferences.push_enabled = true` for that user — WPS-014
   changed this column's default to **false**, so it is opt-in, and
3. a row in `notification_device_tokens` for that user that is not revoked.

Condition 3 is the decisive one. The audience of any dispatch is exactly the set
of registered devices, and that set is currently empty.

## The synthetic/manual split, which is real rather than invented

The instruction was to prefer a configuration where synthetic dispatch is usable
while bulk delivery stays off — and not to invent such a split if the
architecture does not provide one.

It provides one, by construction rather than by a flag:

- **The device-token table is the audience list.** After Phase A, it will
  contain exactly one row: the synthetic QA device. Nothing else can be
  reached, because nothing else is registered.
- **Dispatch is entirely manual.** There is no `pg_cron` schedule, no scheduled
  Edge Function invocation, and no workflow that invokes `push-dispatch`. The
  dispatcher runs when it is explicitly invoked and not otherwise.
- **`notification_configuration.scheduler_enabled` is inert.** Nothing anywhere
  reads it. It participates only in the coherence constraint. (The
  `scheduler_enabled` columns that *are* read belong to different tables —
  marketplace intelligence and payment configuration.)

So "keep bulk/scheduled delivery disabled" needs no new mechanism: there is no
bulk or scheduled delivery to disable.

## Minimum configuration for the E2E proof

**Phase A — everything up to and including token association:**

| Switch | Value | Why |
| --- | --- | --- |
| `push_provider` | `expo` | required before either other switch is legal |
| `token_registration_enabled` | `true` | the device cannot obtain and register a token otherwise |
| `push_delivery_enabled` | **`false`** | nothing is sent; proof steps 1–3 need no delivery |

This configuration **cannot send a notification to anybody**. It is the correct
place to stop and verify before going further.

**Phase B — dispatch and receipt (steps 4–10):** requires
`push_delivery_enabled = true`. At that point the blast radius is exactly the
registered device set, which is the one synthetic QA device. That is the
smallest truthful test path the architecture allows.

## Observed, not only argued — live Production, 2026-09-09

Everything above is derived from the schema. This is what the Production backend
actually answered, via `scripts/push-e2e/preflight.mjs`, using only the
synthetic QA account and RPCs that account is entitled to call. No service key,
no staff session, no RLS bypass.

```
project https://ekgwzljpcxpxnklzxuvj.supabase.co
environment            : production
launch phase           : pre_beta
active kill switches   : none
read-only maintenance  : false
push provider          : disabled
registration available : false
delivery available     : false
devices for QA account : 0
Phase A precondition   : HOLDS
```

Two things worth drawing out. The environment binding is **confirmed from the
backend** rather than assumed from a familiar project URL — which matters,
because the activation call has to state the environment it believes it is
configuring and the database refuses a mismatch. And the launch phase is
`pre_beta`, which is a second independent reason the fan-out risk is small: the
platform has not launched.

## A non-staff Production session is refused — proved, not assumed

Run against live Production with the synthetic QA professional account:

```
staff_reauthenticate         -> HTTP 403: Staff access required
get_my_push_state            -> HTTP 200 (an account may always ask about itself)
```

An ordinary authenticated Production account holds no staff capability and
cannot reach the staff gate at all. This is the cross-account half of the
security requirement, and it is now evidence rather than an expectation.

## The step that was missing from the plan

`staff_set_push_configuration` currently answers **HTTP 404 — not found in the
schema cache** on Production. The migration that creates it exists in this
repository and has been applied and tested against a local database; it has
never been deployed to Production.

So the activation sequence has three parts, not two, and the first is a database
deployment:

1. **Deploy `202609090002` to Production.** `.github/workflows/deploy-database.yml`,
   `workflow_dispatch` only, targeting the `production` GitHub Environment — which
   carries required reviewers and holds the credentials. It refuses unless the
   confirmation input matches the environment name, refuses any ref that is not a
   protected branch, and refuses a real apply unless `PRE_MIGRATION_BACKUP_REF`
   is set for that environment. A dry run should be taken first; the workflow
   runs `supabase migration list --linked` and `db push --dry-run` before it
   changes anything.
2. **Establish a Production staff session** — the owner boundary.
3. **Apply the configuration** — `scripts/push-e2e/activate.mjs`, which is the
   agent's part.

### Two things found while preparing that deployment

**The migration is additive and reversible.** `202609090002` contains six
statements: two `create or replace function`, two `revoke`, one `grant`, one
`comment`. No `alter table`, no `drop`, no `insert`, `update` or `delete` — the
grep returns zero for all of them. Both function names are new (Production
answers 404 for `staff_set_push_configuration`), so nothing is being replaced.
It cannot alter or destroy a single row, and its rollback is two `drop function`
statements. That is worth stating precisely, because the backup gate below
exists for migrations that *can* destroy data, and this is not one.

**The Production environment has no protection rules.** The workflow header says
schema deployment is "environment-approved" and "never touches production
without a recorded approval", and the deploy step comments that the GitHub
environment supplies "for production, the required reviewers". Queried directly:

```
GET /repos/ChapoFTW/Warsha/environments/Production
protection_rules: []
deployment_branch_policy: null
```

**There are no required reviewers and no branch policy on that environment.** The
only guards actually in force are the two inside the workflow file — the
confirmation input must equal the environment name, and the ref must be a
protected branch. Those are real, but they are not the human approval the
comments describe.

This does not make the deployment unsafe; it makes the *documentation* wrong
about why it is safe. It is recorded here rather than quietly fixed, because
adding reviewers to a Production environment is an owner's decision about their
own release process, not a tidy-up an agent should perform unasked.

None of step 1 can be performed from here: the workflow is dispatch-only, the
credentials live in a GitHub Environment, and production carries a reviewer
gate. That is the correct design and is not something to work around.

## One consequence that must be stated before execution, not after

`public.verify_platform_release()` contains a check named
`push_delivery_enabled`, expecting **0** and described as *"Push delivery, token
registration, and the scheduler are all disabled"*.

**Enabling registration will make that check report a failure.** That is
expected and is not a defect. It is a pre-launch posture assertion: it encodes
"Warsha has not turned push on yet", which stops being true the moment we
deliberately turn it on.

It is deliberately **not** being edited now. Weakening an assertion because it
is about to fail is exactly the wrong move, and the check is genuinely useful
until the intended steady state is decided. The honest sequence is: complete the
proof, decide what the permanent Production posture should be, and only then
update the check to assert *that* posture — with the change reviewed on its own
merits rather than smuggled in as activation cleanup.

The deploy workflow's post-migration step is advisory text instructing a human
to run the verification and record it; it does not execute or gate
automatically. So this does not block a deployment, but it will be visible to
whoever reads the verification next, and they deserve to find this note.
