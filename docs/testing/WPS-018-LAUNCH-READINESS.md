# WPS-018 Launch Readiness Assessment

| Field | Value |
| --- | --- |
| Specification | WPS-018 v1.0 |
| Assessed | 2026-08-04 |
| Private beta | **NO-GO** |
| Production | **NO-GO** |

## Summary

Warsha's engineering is in good shape. Its **operational** and **legal** readiness
is not, and no amount of additional code will change that.

| Dimension | State |
| --- | --- |
| Code correctness | Strong — 21 pgTAP suites, 1,831 assertions, 18 regression suites |
| Enforced security posture | Strong — guarantees are database constraints, not conventions |
| Deployment safety | Good — audited, gated, verified, forward-only |
| **Operational readiness** | **Absent** — nothing monitored, nothing restored, nobody rostered |
| **Manual validation** | **Absent** — 0 of 486 cases executed |
| **Legal readiness** | **Absent** — nothing reviewed by a professional |
| **Commercial readiness** | **Absent** — no entity, no payment provider, no licensing |

## What WPS-018 closed

Eighteen gaps, listed in `docs/launch/READINESS-GAP-REGISTER.md`. The four that
mattered most:

1. **Client-attested re-authentication is gone.** Freshness now comes from the
   `amr` claim that GoTrue signs and PostgREST verifies. A client can no longer
   assert anything about its own authentication.
2. **MFA is enforceable with a real provider.** Supabase TOTP is selectable and
   `aal2` is enforced per caller, so production has a path to open rather than a
   permanent closure.
3. **Twenty-two legacy staff RPCs are capability-gated.** A Verification Reviewer
   can no longer reach a dispute, a refund, or a moderation action. The original
   function bodies were moved, not rewritten, so no domain behaviour drifted.
4. **Dual control, session revocation, and access review exist**, and production
   cannot disable any of them — those are CHECK constraints.

## What blocks a private beta

Eight items, none of them code.

| # | Blocker | Why it blocks | Owner |
| --- | --- | --- | --- |
| G19 | **0 of 486 manual cases executed** | Nobody has confirmed the product works for a person | Owner |
| G20 | **No hosted staging project** | The environment model is enforced in code with nowhere to enforce it. Two WPS-018 manual cases are structurally blocked by this. | Operations Manager |
| G21 | **No SMS provider** | Closed as an auth blocker: workers now use phone plus password through the trusted identity broker; no SMS is required. | Operations Manager |
| G22 | **No verified backup, no restore ever performed** | Recoverability is unproven and RTO is unknown. Storage objects are not covered at all. | Security Administrator |
| G23 | **No legal review** | Terms, privacy policy, refund and dispute policy all unreviewed | Owner |
| G24 | **No company structure or tax position** | Warsha cannot lawfully take money or issue receipts | Owner |
| G25 | **Nobody rostered; nothing detects anything** | An incident would be found by a participant complaining | Operations Manager |
| G26 | **Zero device testing** | The product has never run on a real phone on a real network | Owner |

## What additionally blocks production

| # | Blocker | Owner |
| --- | --- | --- |
| G27 | Payment provider undecided (DEFERRED) | Owner |
| G28 | Payout/disbursement licensing unresolved | Owner |
| G29 | No webhook endpoint deployed | Financial Operations |
| G30 | No load test executed; no p95 exists | Operations Manager |
| G31 | 2 high and 14 moderate transitive advisories, accepted not resolved | Operations Manager |
| G32 | No store listing assets or copy | Owner |
| G33 | No verified domain — no universal links, no policy URLs | Operations Manager |
| G34 | Push provider undecided | Operations Manager |
| G35 | No web host decided; no CSP or headers | Operations Manager |

## Legal and policy inventory

Every item below requires **an external qualified professional**. Nothing in this
repository constitutes legal or accounting advice, and **no legal approval is
claimed anywhere**.

| Item | Required professional | State |
| --- | --- | --- |
| Egyptian company structure | Corporate lawyer | Not started |
| Marketplace terms of service | Commercial lawyer | Not started |
| Privacy policy | Data protection lawyer | Not started |
| Worker terms and independent-contractor status | Employment lawyer | Not started |
| Customer terms | Commercial lawyer | Not started |
| Payment terms and receipts | Lawyer and accountant | Not started |
| Refund policy | Consumer protection lawyer | Not started |
| Dispute resolution policy | Commercial lawyer | Not started |
| Data retention schedule | Data protection lawyer | Not started |
| Identity verification and document handling | Data protection lawyer | Not started |
| Certificate handling | Commercial lawyer | Not started |
| Consumer protection compliance | Consumer protection lawyer | Not started |
| Tax treatment and withholding | Accountant | Not started |
| Invoicing and receipts | Accountant | Not started |
| Payment provider agreement | Commercial lawyer | Blocked on G27 |
| Worker classification | Employment lawyer | Not started |
| Intellectual property and brand | IP lawyer | Not started |
| Copyright complaint process | IP lawyer | Not started |

Warsha's **product** position on worker classification is already firm and
constitutional: workers are independent, Warsha does not employ them, and no
product language implies employment. That is a design constraint that has been
honoured; it is **not** a legal opinion, and a lawyer must still confirm the
position holds under Egyptian law.

## What is genuinely ready

Recording this plainly, because the blockers above are not a verdict on the work:

- The forward-only migration chain applies from empty and is audited for
  ordering, naming, destructive statements, pinned `search_path`, and the exact
  grammar defect that once broke a hosted push.
- Every public table has RLS; no private table is exposed to any client role; no
  private table is broadcast over Realtime; every `SECURITY DEFINER` function
  pins a search path. All asserted, not assumed.
- Production cannot be selected without MFA, cannot accept the pre-WPS-017 staff
  gate, and cannot disable dual control.
- Nineteen rate-limited surfaces, each naming where its limit actually lives,
  with exactly one honestly recorded as an open gap.
- Structured logging with redaction enforced at write time.
- A post-deployment verification gate that fails honestly rather than reporting
  a green light.
- Three audit scripts, each of which found real defects on its first run.
- CI that runs every gate with no secret available to it.

## Recommended order

1. Create the staging project (G20) — it unblocks G22, G30, and two manual cases.
2. Keep Supabase Phone Auth disabled unless a separately approved optional verification use case receives an SMS provider; worker registration and sign-in do not need one (G21 closed for auth).
3. Perform a restore drill (G22) — the only way RTO stops being a guess.
4. Roster humans (G25).
5. Execute the 234-case beta subset (G19), on real devices (G26).
6. Legal and company structure (G23, G24) in parallel throughout.

Steps 1–4 are days of work. Step 5 is weeks. Steps 6 are the long pole and should
start immediately, not after the engineering.

## Verdict

**Private beta: NO-GO.** Eight blockers, none of them code.
**Production: NO-GO.** Seventeen blockers.

The engineering is ahead of the operation. That is a good problem, but it is not
readiness, and this document exists so nobody mistakes one for the other.
