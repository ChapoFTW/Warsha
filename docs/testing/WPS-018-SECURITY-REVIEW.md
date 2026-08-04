# WPS-018 Security Review — Production Readiness, Reliability & Launch Operations

| Field | Value |
| --- | --- |
| Specification | WPS-018 v1.0 |
| Scope | `202608030001_wps018_production_readiness.sql`, `src/launch/*`, the three audit scripts, the bundle scanner, and both CI workflows |
| Method | Executed against a clean local reset; every claim below was run, not reasoned about |
| Verdict | **Local implementation accepted. Private beta and production both blocked.** |
| Certification | **None claimed. No penetration testing performed.** |

Threat analysis: `docs/security/WPS-018-FINAL-THREAT-MODEL.md`. This document
records what was executed and what it found.

## Executed checks

| Check | Result |
| --- | --- |
| Clean `supabase db reset` through `202608030001` | Applied without error |
| Full pgTAP, 21 files | **1,831 assertions, `Result: PASS`** |
| WPS-018 pgTAP suite | 136 assertions pass |
| WPS-017 pgTAP suite after the session-security change | 308 assertions pass |
| The other 19 pre-existing suites | All pass, unchanged |
| WPS-018 client suite | **454 checks pass** |
| All 18 regression suites | 0 failures |
| TypeScript, ESLint, mojibake, `git diff --check` | Clean |
| `audit:secrets` | Clean — 436 tracked files, 38 commits |
| `audit:migrations` | Clean — 33 migrations |
| `audit:environment` | Clean — 0 open notes |
| `audit:bundle` | Clean — 46 artefacts across three exports |
| Expo Doctor | 18/18 |
| Android, iOS, web exports | All succeed |
| Migration ledger | Everything through `202608020005` local **and** remote; `202608030001` local only |
| Non-mutating dry run | `202608030001` is the single pending migration; **no hosted mutation** |

## Findings

### F1 — The CI bundle scan would have failed every build *(defect found and fixed)*

**Observed.** The bundle scan committed with WPS-018 searched for the literal
strings `sb_secret_` and `service_role`. The web bundle contains
`e.startsWith("sb_secret_")` — that is `@supabase/supabase-js`'s **own guard**
which refuses a secret key on the client. The scan would have flagged it on
every run.

**Why it matters.** A scanner that always fails is worse than no scanner: people
learn to ignore it, and the one time it is right nobody looks.

**Second-order finding.** A naive fix — matching the prefix plus any 16
characters — still fails on Hermes bytecode, because Hermes packs string
literals contiguously with no separator. The real bundle contains the guard
prefix `sb_secret_` immediately followed by
`allocateCallbackButtonInCustomViewebsocket`, which is two unrelated literals
abutting. (The two halves are written separately here on purpose: as one string
it is a credential shape, and `audit:secrets` correctly flags it.)

**Fixed.** Replaced with `scripts/audit-bundle.mjs`, which matches credential
**values**: the prefix plus at least twenty characters that include a digit, a
service-role JWT only inside a three-segment token, and the standard private-key
and cloud-provider key shapes. Verified in both directions — clean on all 46 real
artefacts, and it catches a planted Supabase secret key and a planted
service-role JWT.

**Residual, stated plainly.** The Hermes discriminator is a heuristic. It is
deliberately **not** the primary control, and the script says so. The primary
control is that no secret is available to a build at all: the validation
workflow references no secret, and `audit:environment` fails the build if a
secret hides behind an `EXPO_PUBLIC_` name.

### F2 — Client-attested re-authentication removed (WPS-017 F2 closed)

**Before.** `staff_reauthenticate` recorded that the client said it had
re-authenticated. A compromised session that could drive the client could
produce that attestation.

**Now.** Freshness is computed from the `amr` claim — the authentication methods
and their timestamps — which GoTrue signs and PostgREST verifies before it
reaches SQL. A token with no verifiable authentication record has **no**
freshness and is refused.

**Verified.** A 4,000-second-old session is refused, a token carrying only `sub`
is refused, and a fresh session succeeds. The WPS-017 suite was updated to
present the same claims a real access token carries, so it now tests the real
mechanism rather than a stub.

### F3 — MFA is enforceable, with a real provider (WPS-017 F2 closed)

Supabase's own TOTP factor is now selectable, and `aal2` is enforced per caller
when the environment requires MFA. Production has a path to open rather than a
permanent closure, and the constraint that production requires MFA remains.

**Verified.** With MFA required, an `aal1` session is refused on every capability
and an `aal2` session works.

### F4 — Cross-domain reach closed (WPS-017 F3 closed)

Twenty-two pre-WPS-017 staff RPCs were reachable by anyone satisfying
`private.is_staff()`. Each now requires its specific domain capability.

**Verified in both directions.** A Verification Reviewer still satisfies the
legacy gate, still approves a verification, and is now refused on dispute
assignment, review moderation, refunds, and the payment operations summary. A
customer is still refused everywhere.

**Method note.** Each function was **renamed into `private` unchanged** and
re-published behind the gate. `ALTER FUNCTION … RENAME` preserves the owner, the
`SECURITY DEFINER` marking, and the pinned `search_path`. No domain body was
rewritten, which is why all nineteen pre-existing pgTAP suites pass without a
single assertion changing.

### F5 — Legacy grace is a deliberate, constrained compromise

A pre-WPS-017 `user_roles` account keeps historic access **outside production
only**. That is what let every existing suite pass unchanged. Production forbids
it by CHECK constraint.

**Residual.** Until no legacy account remains, a legacy account in staging has
broad access. Tracked as G36; the grace path is removed once the access review
reports zero legacy accounts.

### F6 — A rate-limit rejection cannot be durably recorded

A rejected call must roll back with the transaction it aborts, so the rejection
row rolls back too. The first implementation wrote one anyway — dead code that
silently vanished.

**Fixed.** The limiter now records **saturation**: the accepted call that fills a
subject's bucket. That commits, and it is the early-warning signal operations
actually needs. The limitation is stated in the migration, the specification, and
the gap register rather than hidden.

## Verified security properties

- Server-derived identity everywhere; no authorization decision reads client input.
- Deny by default: unknown capability, unready platform, revoked session,
  unsatisfied MFA, and stale freshness all raise.
- **Production is safe by constraint, not convention**: it cannot be selected
  without MFA, cannot accept the legacy staff gate, and cannot disable dual
  control.
- No self-approval: a role cannot be granted to oneself, a configuration version
  cannot be approved by its author, a dual-control request cannot be approved by
  its requester, and access cannot be self-reviewed. All enforced in SQL.
- Immutable history: environment changes, dual-control records, access reviews,
  and every WPS-017 audit table raise on update and delete for the owner too.
- Limiter subjects are stored only as a SHA-256 hash; asserted that no raw
  account identifier reaches the counter table.
- Redaction at write time: eight forbidden payload shapes rejected, plus email
  addresses, Egyptian phone numbers, JWT-shaped values, over-long values, and
  nested objects. The event still records; the payload is replaced.
- Every `SECURITY DEFINER` function in the entire database pins a search path.
- No private table is exposed to any client role or broadcast over Realtime.
- Nothing was enabled: push delivery, token registration, schedulers, gateway,
  payout modes, and the marketplace all remain off, asserted negatively.

## Deployment verdict

| Environment | Verdict |
| --- | --- |
| Local | **Accepted.** Every gate passes. |
| Staging | **Accepted once a staging project exists.** It does not (G20). |
| Production | **Blocked.** Not by this code — by no verified backup (G22), nothing monitored (G25), and 0 of 486 manual cases executed (G19). |

The enforced security posture is strong. The operational security posture is
absent. This review does not conflate the two.
