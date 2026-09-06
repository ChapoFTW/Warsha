# Production release history

What actually went live, when, and from which commit. One entry per Production
release, newest first. This is the record a rollback starts from, so it names the
previous artefact as well as the new one.

Git has one branch. `origin/main` is the source authority; Production state is
recorded here by SHA rather than by a branch.

---

## 2026-09-06 — Warsha stops requiring a second human

**RELEASE_SHA**: recorded below once CI is green.

The owner decided that ONE AUTHORIZED OPERATOR MAY OPERATE WARSHA. Migration
`202609060010` makes the authority model say that instead of working around it.

This SUPERSEDES every "requires a second approver" statement in the entries
below. Those entries describe what was true when they were written and are left
standing for that reason; they are not current operating guidance.

| | old policy | new policy |
|---|---|---|
| who decides how many humans | `required_approval_count(environment, action)` | `staff_capabilities.approval_policy`, per capability |
| the axis | which project the backend points at | what the action is |
| production | 2 distinct staff identities | 1 authorized operator |
| development | 1 | 1 |
| capabilities marked dual control | 11 | 0 |
| dual control available at all | yes | yes — unchanged, simply unused |

Eleven capabilities were marked `dual_control` and only six of them had a
runtime gate, so five claimed to need a second approver that no code ever asked
for. `approval_policy` is now the single authority and `dual_control` survives
as a GENERATED column derived from it, which is why the two can no longer
disagree.

Removed: a human-count dependency. NOT removed: capability, AAL2,
re-authentication, staff revocation, environment binding, reasons, audit rows,
provider readiness gates, kill switches, RLS, tenant isolation or rate limits.

A single-operator authorization is recorded as exactly that — governance mode
`single_operator`, one required approval, `approved_by` left NULL, audit action
`single_operator_authorisation_consumed`. Nothing pretends a second approval
occurred, and a table constraint prevents one being added later.

Bootstrap now creates the FIRST staff identity only. Everybody after that
arrives through `public.staff_grant_role`, which one operator can use and which
records who did it — a better trail than a bootstrap grant, not a worse one.

## 2026-09-06 — staff authority narrowed, and staff MFA enrolment shipped

Two releases on one day, recorded separately because they rolled back
separately.

### Database — `202609060009`

**RELEASE_SHA**: `dfb981c`, CI green. Applied to Development first, then
Production after CI. Production migration head `202609060009`, verified: the new
role carries exactly its three capabilities, there is exactly one
`staff_grant_role` function, the bootstrap guard is present, and the role
catalogue is 10.

Adds `subprocessor_approver` — `manage_subprocessors`,
`review_legal_governance`, `view_operations_home` — so seconding a provider
activation no longer requires a role that also reads criminal records. Bounds
`private.bootstrap_staff_role` to the initial two-identity quorum, after which
it refuses and names `public.staff_grant_role`.

Production had 1 staff identity when this applied, so bootstrap has exactly one
use left. That use is the second approver.

The break-glass boundary is unchanged and now documented: a database owner can
still insert a grant directly, and such a grant reads as one with `granted_by`
null.

**Known gap, pinned by a test rather than closed.** `manage_staff_roles` is
`dual_control` in the capability catalogue and `staff_grant_role` does not
consume a second identity — the no-self-grant rule stands in for one. Closing it
needs an approval queue the admin surface does not have, and needs two
`manage_staff_roles` holders where Production has one. See the migration header.

### Web — staff MFA enrolment

**RELEASE_SHA**: `e9f8023`, CI green (run on `main`).

| | |
|---|---|
| Staged deployment | `warsha-cvovdsuk4-warsha-development.vercel.app` |
| Promoted deployment | `dpl_9JrqXkHoWf3D2bd9NfqDZXykH2Sz` |
| Previous live (rollback target) | `dpl_9awEYdoozcqsbGXNsY2ivK4qsDWu`, built 2026-09-06 06:28 |

Staged with `--skip-domain`, verified, then `vercel promote`. Automatic Git
deployment stays disabled in `web/vercel.json`.

Adds `/admin/security`, the first first-party way for a staff member to enrol a
TOTP factor. Before this, `mfa.enroll` was called nowhere in the codebase: the
console could challenge a factor and could not create one, so the only route to
`aal2` was an administrator driving the API on somebody else's behalf.

Verified after promotion, on all four domains at `e9f8023`: `/api/health`
reporting the commit, `/api/ready` reporting `database: ok` and `auth: ok`, EN,
AR (with `dir="rtl"`) and FR rendering, no Development project reference and no
privileged credential in the served HTML. On the console host,
`admin.usewarsha.com/security` returns 200 while `/nope` still returns 404 — the
control that distinguishes "the route shipped" from "everything answers 200" —
and `/staff` still works.

Note for the next person: the admin surface is served ONLY on the `admin.` host,
because `web/middleware.ts` rewrites by hostname. A preview deployment URL
cannot answer for it — `/admin/*` there redirects to `/` like any non-admin
host — so console routes are verified after promotion, not before.

### Rollback for these two

1. `vercel promote dpl_9awEYdoozcqsbGXNsY2ivK4qsDWu` returns the web to the
   06:28 build, which has no `/admin/security`.
2. The database migration is forward-only. `202609060009` adds a role and
   narrows a function; nothing depends on it that a rollback of the web would
   strand.

---

## 2026-09-06 — first full Production release

**RELEASE_SHA**: `11753aae81fdbca3fcb1200f6d200d39278a9bfd`
CI green (run 34005643593, all four jobs). Working tree clean, local `main` equal
to `origin/main` at release time.

### Web

| | |
|---|---|
| Vercel project | `warsha-web` (root directory `web`) |
| Staged deployment | `dpl_HMTSjkFtMXuBXSFzFRVSe68REv93` |
| Promoted deployment | `dpl_HMTSjkFtMXuBXSFzFRVSe68REv93` |
| Previous live (rollback target) | `dpl_6vWpNE2Ckwa8nqNi2fFQxqhHVUfH`, built 2026-08-29 |
| Live domains | usewarsha.com, www.usewarsha.com, app.usewarsha.com, admin.usewarsha.com |

All four domains verified after promotion: HTTP 200, `/api/health` reporting
`commit: 11753aa`, `/api/ready` reporting `database: ok` and `auth: ok`, the hero
motion attribute present on the public domains, and no Development project
reference in any served bundle. EN, AR and FR all render, with `dir="rtl"` on AR.

Automatic Git deployment stays disabled in `web/vercel.json`. This release was an
explicit `vercel deploy --prod` followed by `vercel promote`, which is the model
`scripts/release-boundary.test.mts` exists to protect.

**Environment correction made during this release.** Vercel Production was
pointing `NEXT_PUBLIC_SUPABASE_URL` at the DEVELOPMENT project, so the first
staged build talked to Development. Both variables were repointed at
`ekgwzljpcxpxnklzxuvj`. Two traps worth knowing for next time:

- values written through a PowerShell pipeline acquire a UTF-8 BOM, which makes
  the URL invalid and shows up as `/api/ready` reporting both dependencies
  unreachable while `/api/health` stays green. Write them with `printf '%s'`.
- `NEXT_PUBLIC_*` values are inlined at build time, and Vercel reuses the build
  cache. After changing one, deploy with `--force` or the old value survives in
  an identically-hashed chunk.

### Database

Production migration ledger: **99 → 109**, latest `202609060007`, exact parity
with the repository. Ten forward migrations applied in order, no seeds:

```
202609050001 202609050002 202609050003 202609060001 202609060002
202609060003 202609060004 202609060005 202609060006 202609060007
```

No Development data was copied. `db push` reported `"seeds":[]`.

Security invariants re-verified on Production after the migrations, all passing:
0 public tables without RLS, 0 anon write grants, 0 PUBLIC table grants, 0 public
storage buckets, 0 private-schema exposure to client roles, 0 realtime tables
without RLS, 0 realtime tables with REPLICA IDENTITY FULL, exactly one
`submit_my_criminal_record` overload, 44 rate-limit policies, the signed-URL
bounds constraint present, the staff gate carrying revocation and MFA checks, and
the discoverability trigger delete-safe.

Anonymous hostile probe against Production: 15 sensitive tables all answered 401,
zero rows leaked; every sensitive storage bucket listed 0 objects; a direct
object download was refused.

### Edge Functions

All six deployed from RELEASE_SHA to `ekgwzljpcxpxnklzxuvj`, each one version
bumped and ACTIVE: `worker-auth` v3, `location-proxy` v3, `privacy-export` v3,
`push-dispatch` v4, `vision-extract` v3, `warsha-automation` v3. `verify_jwt`
matches `config.toml` — false for `worker-auth` and `warsha-automation`, true for
the rest.

### Auth

`password_min_length` was 6 on Production against Warsha's own policy of 8 and
was PATCHed to 8 through the Management API, one field, nothing else touched.
`password_required_characters` was deliberately left unset: Warsha's rule is "any
non-alphanumeric", which GoTrue's explicit character-set model cannot express
without rejecting passwords the app accepts.

Verified and unchanged: site URL `https://app.usewarsha.com`, the redirect
allowlist, SMTP configured, email confirmation required, TOTP enrol and verify
enabled, `mfa_allow_low_aal` false, refresh-token rotation on, anonymous sign-up
off.

### 2026-09-06, later — operations bootstrap and a corrected Maps diagnosis

The first Production administrator now exists. `siefabdelghfar@gmail.com` holds
`security_administrator` (granted `2026-09-06 04:14:34+00`, 18 capabilities),
email is confirmed, and a TOTP factor is enrolled and verified, so an AAL2
session is obtainable. MFA enforcement was proven at the same time: AAL2 read
200, the same identity at AAL1 403 "Multi-factor authentication is required",
anonymous 401.

`202609060008` then created the 23 missing `production` feature-flag rows, all
disabled.

**Correction to that migration's own commentary.** It states "The block was never
dual control. It was an empty table." The empty table was *a* block, and a real
one, but it was not the only one and not the last one. Read in order, Maps
activation in Production requires:

| gate | state |
|---|---|
| provider status is activatable | `configured_not_enabled` — ok |
| `production` in `environments` | present — ok |
| server credential declared | `GOOGLE_MAPS_SERVER_KEY`, present in Edge secrets — ok |
| feature-flag row exists for the environment | created by `202609060008` — ok |
| that flag is **disabled** | disabled — ok, and it must stay that way |
| kill switch exists and is inactive | `location_provider`, inactive — ok |
| subprocessor `approved_not_integrated` | `google_maps_platform` — ok |
| processing activity registered | `bookings_execution` — ok |
| `private.consume_dual_control` succeeds | **REFUSED** |

Every technical gate passes. The last one does not.
`staff_activate_external_provider` gates on `manage_subprocessors`, whose
`dual_control` is true, and `private.required_approval_count('production')`
returns 2. With one staff identity `consume_dual_control` raises "This action
requires a second approver" — and in Production it does not even leave a pending
request behind, because the two-identity branch raises before creating one. A
request row has to be created deliberately by `staff_request_dual_control` and
then approved by a *different* staff user.

So **Maps activation is blocked on a second Production staff identity**, not on
MFA, not on a credential, and not on the flag table. No amount of
re-authentication by the existing administrator will complete it. This is the
control working as designed; the fix is a second administrator, not a change to
the gate.

Note the ordering trap: activation refuses to run while `location_provider` is
enabled ("Disable the provider feature flag before activation"). The flag must
stay OFF until the provider is active, then be opened. Turning it on early would
lock Maps out of activation.

`manage_feature_flags`, by contrast, has `dual_control` false, so a single
administrator at AAL2 with reauthentication inside the 900-second window can
govern flags on their own.

### Verifications completed after release

- **CI** — `Validate` is green on `6cf7560`, the tip of `origin/main`
  (2026-09-06T04:52:53Z), as it is on every commit back through `6771182`.
- **Android Production APK** — build `0120f1b0-7965-459b-a828-1cf39eee4b02`,
  profile `production-apk`, channel `production`, runtime 1.0.0, version code 2,
  from commit `8e52424`. The artefact was downloaded (136,778,756 bytes) and its
  `assets/index.android.bundle` audited against the live key material of both
  projects:

  | key | in bundle |
  |---|---|
  | Production publishable | **yes — correct, this is the one that ships** |
  | Production `service_role` (legacy) | no |
  | Production secret (`sb_secret_`) | no |
  | Development publishable / anon / service_role / secret | no |

  The Production project ref appears once; the Development ref does not appear at
  all. No `AIza` Google key, no service-account private key, no
  `GOOGLE_MAPS_SERVER_KEY`, no PAT.

  Two substring hits were false positives from Metro's string pool, where
  adjacent unrelated literals concatenate. `EXPO_TOKEN` has no assigned value and
  sits inside `MILLISECONDS_REGEX` + `PO_TOKEN` + `FCM_SERVER_CREDENTIAL`.
  `sb_secret_` is followed by 26 characters containing 0 digits and readable
  English, and matches no real key — a real secret key was tested for by exact
  value and is absent.

  Not yet verified: that the app launches and renders its icons on a device. That
  needs an emulator or handset.

### Rollback

Preferred order, least destructive first:

1. `vercel promote dpl_6vWpNE2Ckwa8nqNi2fFQxqhHVUfH` — returns the web to the
   2026-08-29 build. Note that build targets the DEVELOPMENT backend, which is
   why it is a rollback of last resort rather than a comfortable one.
2. Kill switches and feature flags for a specific capability.
3. Edge Function redeploy from a previous SHA.
4. Database migrations are forward-only. Do not reverse them; write a forward
   migration that corrects the behaviour instead.

### Not activated, and why

Nothing here is disabled out of caution. Each item below has a specific,
non-legal blocker, recorded truthfully:

- **Feature flags, Maps, OCR activation** — every governed activation runs
  through `private.require_staff_capability`, which requires a staff capability
  holder AND an AAL2 session. Production has 0 active staff grants and
  `mfa_required = true`. Activating would mean inventing a staff privilege or
  fabricating MFA state. Blocked on a human enrolling TOTP and the documented
  first-administrator bootstrap.
  **SUPERSEDED** later the same day — see "operations bootstrap and a corrected
  Maps diagnosis" above. The administrator and the AAL2 session now exist.
- **Production feature-flag rows** — the flag table holds only `local`,
  `development` and `staging` rows. No `production` rows exist. Creating them
  belongs to the governed path above.
  **SUPERSEDED** by `202609060008`: 23 `production` rows now exist, all disabled.
- **Google Maps** — credential `GOOGLE_MAPS_SERVER_KEY` IS present in Production
  Edge secrets and the provider row reads `configured_not_enabled`. Technically
  ready; blocked only by the governed-activation boundary.
  **STILL BLOCKED, and now precisely:** every technical gate passes; the
  remaining one is dual control, which needs a *second* Production staff
  identity. See the corrected diagnosis above.
- **OCR / Google Cloud Vision** — provider row reads
  `implemented_awaiting_credential`. `GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT` does
  not exist in Production secrets. A genuinely missing credential, not a review
  item.
- **Mobile** — no production binary has ever been built for either platform. EAS
  shows only `preview` and `development` Android builds and no iOS build at all,
  and `eas.json` has an empty `submit.production`. An OTA would reach zero
  devices. Requires a first native build plus Google Play and Apple account
  actions.
- **Push notifications** — depends on the native binary above.
- **Payments and payouts** — no payment provider is configured. Cash-only remains
  correct.
- **`warsha-automation` on Production** — the function is deployed but
  `WARSHA_DEVELOPMENT_AUTOMATION_TOKEN` does not exist in Production secrets, so
  it refuses every caller. That is the intended posture: it is a Development
  governance path.

### Known defect, reported not fixed

`public.legal_acceptances` carries `ON DELETE CASCADE` from `profiles` and a
`BEFORE DELETE` trigger that raises "Acceptance history cannot be changed"
unconditionally. The foreign key says these rows go when the account goes; the
trigger says they may never go. The trigger wins and the whole account delete
fails. Whether consent evidence should survive account deletion is a
compliance decision, so it is recorded here rather than resolved.
