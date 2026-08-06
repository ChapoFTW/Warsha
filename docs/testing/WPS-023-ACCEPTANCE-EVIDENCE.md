# WPS-023 — Acceptance evidence

Authority: WPS-023. All figures below were **executed from the completed tree**
after the session interruption, not carried over from before it.

---

## Automated gates

| Gate | Result |
| --- | --- |
| Clean local reset (38 migrations) | **PASS** |
| `supabase test db` | **26 files / 2,707 assertions / `Result: PASS`** |
| WPS-023 pgTAP suite | **160 assertions** |
| Pre-existing pgTAP suites | **25 files, no assertion edited** |
| `npm run test:wps023` | **525 checks** |
| Custom regression suites | **22 of 23 pass** |
| `npm run typecheck` | PASS |
| `npm run lint` | **0 errors, 0 warnings** |
| `npm run check:mojibake` | "No likely mojibake found." |
| `git diff --check` / `--cached --check` | clean |
| `audit:secrets` | clean — 552 tracked files, 45 commits |
| `audit:migrations` | clean — 38 migrations, forward-only |
| `audit:environment` | clean — 5 variables, 33 routes, 6 assets, **0 open notes** |
| `audit:appearance` | clean — 236 files, 73 roles in both themes |
| `audit:bundle` | clean — 70 artefacts across 3 exports |
| `npx expo-doctor` | **18/18** |
| Cache-cleared Android / iOS / Web exports | **PASS** |
| `supabase migration list --linked` | `202608080001` local-only |
| `supabase db push --linked --dry-run` | exactly one pending, `dryRun: true`, no mutation |

### The one regression failure

`npm run test:wps018` fails on *"over-the-air updates are not enabled"*.

**Proven pre-existing.** `git stash push -u` produced the identical failure on a
clean tree, and the stash restored intact. The `"updates"` block in `app.json`
predates WPS-023, which modified neither that file nor that assertion.

---

## What the pgTAP suite establishes

**Signed-out reachability** — `anon` cannot reach any of the fifteen WPS-022
functions that were reachable before this migration, including
`staff_create_legal_hold`; `authenticated` retains all fifteen; the nine WPS-020
sanctioned reads are preserved; and **no function outside that allowlist is
anon-executable**, asserted as a property so a future slip fails the test.

**Role forging** — selecting Worker grants no capability. A client cannot write
its own `worker_state`, forge lifecycle history, call the state machine, or read
the activation gates.

**State machine** — a worker cannot transition themselves to `approved` or
`active`; an upload activates nobody; a certificate cannot be approved without a
review; the system may only record account creation; re-issuing the current
state is a no-op rather than a duplicate history row; the writer takes a row
lock.

**Activation gating** — approval is not activation; activation is refused while
any gate is unsatisfied even for a reviewer holding `activate_worker`; an
approved-but-unactivated worker has no capability, is refused at every worker
operation, and is not publicly discoverable.

**Isolation** — one worker sees no other worker's extraction candidates,
lifecycle history, onboarding row or certificate; a customer sees no
certificate; one account cannot confirm another account's address.

**Document handling** — a path naming another account is refused; unsupported
MIME refused; oversized refused; future issue date refused; the full National ID
is never stored; candidates are masked to the last four; confidence never leaves
the server.

**Decisions** — a rejection without recorded evidence is refused; a certificate
outcome without evidence is refused; every certificate access is logged with its
capability; a non-staff account cannot reach the queue, a decision, or a
document; **an appeal cannot be decided by the original reviewer**.

**Leakage** — the private evidence never appears in worker-visible history; the
certificate table has no offence column at all; no notification carries an
offence, identifier or filename; no WPS-023 table is published to Realtime; no
sensitive vetting record is export-included.

**Posture** — the vetting policy is not legally approved; no retention rule is
enabled or approved; every WPS-023 surface ships disabled; no account was
silently activated by the migration.

---

## Manual acceptance

**Not claimed.** 108 cases, 0 executed. See
[WPS-023-MANUAL-RESULTS](./WPS-023-MANUAL-RESULTS.md).

No physical device was used. No physical-device acceptance is claimed for any
part of WPS-023.

---

## Deferred deliverables

Six, each disabled or reported honestly rather than half-built, and none claimed
as working in any user-facing string. Full detail in WES-023 §9.

1. No live camera framing overlay — `expo-camera` would need a new dev-client
   build and device acceptance.
2. No map or geocoding provider — device location and address search report as
   unavailable; manual pin is the working path.
3. No extraction provider — manual entry only, and the copy says so.
4. No staff decision UI — the queue is read-only; the decision RPCs are
   implemented, granted, capability-checked and tested.
5. No certificate binary upload wired to storage — metadata and path are
   recorded; the object upload is not yet performed by the client.
6. Quality heuristics are dimension-only — `sharpness` and `brightestFraction`
   are accepted but nothing computes them.

---

## Corrections made during implementation

Recorded because each one is a place the specification and the existing
codebase disagreed, and the resolution mattered.

| # | Finding | Resolution |
| --- | --- | --- |
| 1 | Fifteen `public` functions anon-executable via a residual `PUBLIC` grant | Fixed in §0; privilege asserted, not behaviour |
| 2 | `is_provider_publicly_discoverable` gate broke 52 assertions in 9 suites | Predicate restored unchanged; gate moved to `require_active_worker` |
| 3 | Two `staff_queues` rows broke the WPS-017 count of 18 | No queue row added; own capability-checked RPC instead |
| 4 | Three `observability_retention_policy` rows broke a WPS-018 invariant | Registered in `data_inventory` instead — the right register |
| 5 | Five registry inserts written against assumed column names | Corrected against the live schema |
| 6 | `storage_bucket_lifecycle` FK required rules first | Insert order corrected |
| 7 | History ordering fell back to a random uuid within a transaction | `clock_timestamp()` instead of `now()` |
| 8 | `app/admin/vetting.tsx` bypassed the WPS-017 guarded admin shell | Rewritten onto `AdminShell` + `useAdmin`; caught by `audit:environment` |
| 9 | A seeded policy `notes` string satisfied the check for the absence it described | Replaced with checks for the machinery an automatic rule would need |
| 10 | Four structural checks satisfied by their own explanatory comments | Routed through `codeOf()` |
| 11 | An offence-word check tripped on legitimate staff-facing copy | Narrowed to offence-shaped **data binding** |

---

## Deployment

Pending hosted chain — **one** migration:

```
202608080001_wps023_authentication_role_onboarding_worker_vetting.sql
```

Local and hosted are otherwise in sync at 37 applied migrations.

Documented, **not executed**:

```
npx.cmd supabase db push --linked
```

Applying it changes no user-visible behaviour until somebody deliberately
enables a flag: all four WPS-023 feature flags ship
`enabled = false, audience = 'none'`.
