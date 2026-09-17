# Warsha product-truth register

What is true about Warsha now, as distinct from what was decided, specified,
coded or assumed. One place to look before claiming a feature works, and one
place to record when that stops being true.

Opened 2026-09-17. It supersedes `docs/launch/READINESS-GAP-REGISTER.md`
(2026-08-03) as the statement of **current** truth; that file stays as history,
and several of its rows are superseded below.

## How to read a row

| State | Meaning |
| --- | --- |
| **VERIFIED CURRENT** | Proven true now, by the evidence named, in the environment named. |
| **CODED — NOT CERTIFIED** | Implemented and covered by automated tests; not proven on a device, in Development or in Production. |
| **OPEN** | Known to be missing or wrong, with no owner decision blocking the fix. |
| **BLOCKED** | Cannot proceed without something outside engineering: a credential, an account, a purchase, a person. |
| **DEFERRED BY PRODUCT DECISION** | Deliberately not done, on the owner's decision. |
| **SUPERSEDED** | An earlier decision or record replaced by a later one, named. |
| **CONFLICT** | Two authoritative statements disagree and the owner has to choose. |

**Dev** and **Prod** say what is known about that environment and how:
*deployed* (migration or release recorded), *not deployed*, or *not verified*.
Nothing in those columns is inferred from repository history. Production has
been read only through its recorded releases in
`docs/operations/production-release-history.md`; no Production query was run
while compiling this register, because no authorised Production read access
exists in this environment.

Production migration head, as last recorded: `202609090002` (push configuration
authority, applied under a migration-specific backup exception). Everything from
`202609160001` onward is **not deployed** anywhere but local.

Severity: **P0** users are harmed or the core loop fails · **P1** a promised
behaviour is missing or wrong · **P2** degraded or inconsistent · **P3** backlog.

---

## 1. Marketplace

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MKT-01 | **A request reaches the Professionals who cover it** (P0) | CODED — NOT CERTIFIED | Owner, 2026-09-16: service area = eligibility; Emergency adds the radius; distance ranks privately | `202609160001`; `marketplace-matching-anchor.test.sql` matrix A–P through real writers; fails B, C, D, E, G, P against the old wave function | not deployed | not deployed. At the recorded head every request is matched against an empty anchor table: expected to invite nobody. **Not verified by query.** | Deploy through the governed path | **Yes** — the migration changes data (backfill, deletes derived anchors), so it needs a restore point or an explicit migration-specific exception (OD-001) |
| MKT-02 | Eligibility by district; an area without a district covers the governorate | CODED — NOT CERTIFIED | Professional copy: "the district you cover inside it" | same as MKT-01 | not deployed | not deployed | Production aggregate: service areas whose district is not a CAPMAS name no request can match | No |
| MKT-03 | Work location is not the default address; existing Customers can complete the step | CODED — NOT CERTIFIED | Owner, 2026-09-16 | `confirm_my_work_location`; native + web callers; wps023 and web-app-surfaces source checks; pgTAP case L | not deployed | not deployed | Render the step on a device in Supabase mode | No |
| MKT-04 | Matching anchor privacy: no coordinate, distance, band or distance order reaches a client; export, anonymization, inventory | CODED — NOT CERTIFIED | Owner, 2026-09-16 | pgTAP H, I, O; discovery and quote sorts retired; `docs/decisions/provider-distance-is-never-known.md` | not deployed | not deployed | — | No |
| MKT-05 | **Timed marketplace work runs** — later waves, request expiry, confirmation timeout (P0) | CODED — NOT CERTIFIED | WES-008: "request background jobs independent of a client"; `202608250004` set `scheduler_enabled` | `202609170001` (pg_cron drain every minute); `marketplace-job-drain.test.sql`; local `cron.job_run_details` shows successful runs | not deployed | not deployed. Nothing drains the queue at the recorded head: requests reach one wave only, never expire, and an unconfirmed selection waits indefinitely. **Not verified by query.** | Deploy; decide whether terminal failures in the operational log need an alert | Deploy needs restore point / exception |
| MKT-06 | Two-minute quote window, **closing early when everyone invited has answered** | CODED — NOT CERTIFIED | WPS-008 §quotes (locked 2026-07-31) | `202609170002`; `marketplace-quote-window.test.sql` (fails without the trigger); Mock parity; native notice copy and help article updated in EN/AR/FR | not deployed | not deployed; early close never existed before | Render the waiting notice (unreachable in Mock by design; needs Supabase mode with two Professionals) | No |
| MKT-07 | Web shows no explanation while quote selection is closed | OPEN (P2) | Parity rule | `web/app/app/requests/page.tsx` hides the choose button with no text; native shows a notice | — | — | Add the notice on web, EN/AR/FR, rendered | No |
| MKT-08 | Emergency surcharge preview is the maximum across the whole category nationally, not the Customer's area | OPEN (P2) | WPS-008 surcharge approval | `preview_emergency_request` has no area filter | — | — | Scope the preview to Professionals who could be dispatched | No |
| MKT-09 | A Professional can declare only one district | DEFERRED BY PRODUCT DECISION until decided (P3) | Worker editors take `areas[0]` | District eligibility may be narrower than Professionals intend | — | — | — | **Yes** — multiple districts or governorate-wide coverage |
| MKT-10 | Comeback and Rescue under service-area eligibility | CONFLICT (P2) | Comeback targets the original Professional; Rescue copies `schedule_kind` | A Professional who changed area is no longer eligible for a comeback to the same Customer | — | — | — | **Yes** — should a comeback bypass area eligibility |
| MKT-11 | Address book does not mark the work location, so deleting it is unexplained | OPEN (P2) | — | Deleting the anchored address reopens the work-location step (tested) without warning in the address book | — | — | Label the work location and warn before deleting | No |
| MKT-12 | Planned requests in Production created before MKT-01/05 deploy | OPEN | — | Any such request invited nobody and never expired | — | not verified | After deploy, count open requests past `expires_at`; the drain will expire them | No |

## 2. Trust, safety, reviews

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TRS-01 | **A hidden, removed, suspended or banned Professional stays discoverable and invitable** (P0) | CODED — NOT CERTIFIED | WPS-016 `trust_state_allows` | `202609170003`; `trust-marketplace-visibility.test.sql` through the staff RPC; 7 assertions fail against the old gate | not deployed | not deployed. `trust_state_allows` has no callers at the recorded head. **Not verified by query.** | Deploy | Deploy needs restore point / exception |
| TRS-02 | Communication, review, payment and withdrawal restrictions are recorded and enforced nowhere | OPEN (P1) | WPS-016 | `trust_state_allows` capabilities other than `marketplace` have no callers | — | not verified | Wire each capability into its write paths | **Yes** — what a restricted person still sees (read-only history, existing bookings) |
| TRS-03 | Ratings and reviews end to end | CODED — NOT CERTIFIED | WPS-011 | Native `submit_booking_review_v2`; **web has no review submission**; `new_review_ui` staged off in Production | — | not verified | Web parity, then device certification. Do not market reviews until certified | No |
| TRS-04 | Criminal-record requirement | **CONFLICT** | Historical owner decision: *do not require until legal consultation*. Current code and `docs/decisions/worker-criminal-record-model.md` (Model A, LOCKED) require upload: `criminal_record_uploaded` is an activation gate and a provisional gate | No later authoritative reversal found in the repository or in this programme's recorded owner messages. Not inferred | required | `worker_vetting`, `provisional_worker_activation` enabled 2026-09-06, so required | Do not change until decided | **Yes** — require, optional, or off until legal review. Legal review is not performed (G23) and must not be represented as done |
| TRS-05 | Criminal-record attestation is never ticked with synthetic data | VERIFIED CURRENT (process) | Owner, 2026-09-11 | Boundary kept in every QA pass | — | — | Screen certification around the declaration, without ticking it | No |
| TRS-06 | Staff enforcement notifications on expiry | OPEN (P3) | — | A restriction lapsing by time changes no row; the discoverability notification waits for the next change | — | — | Schedule expiry handling if timely notice matters | No |

## 3. Accounts, identity, privacy

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ACC-01 | Duplicate registration is not presented as a new account | CODED — NOT CERTIFIED | — | `signup-duplicate-account.test.mts` against provider response shapes; not proven against a live mailbox | — | not verified | Certify with a deliverable QA mailbox | No |
| ACC-02 | Account erasure | VERIFIED CURRENT (mechanism) | WPS-022 | Erasure is `privacy_anonymize_account` (UPDATE); `account_deletion` enabled in Production 2026-09-06 | deployed | deployed | — | No |
| ACC-03 | **Hard deletion** is blocked by the immutable `legal_acceptances` trigger | CONFLICT (P2) | Standing rule: do not destroy immutable legal evidence for convenience | FK cascades, trigger refuses (`production-release-history.md`) | — | — | Make the FK non-cascading so evidence survives a hard delete, if hard delete is wanted at all | **Yes** — whether hard delete exists; compliance review |
| ACC-04 | Matching anchor in export and anonymization | CODED — NOT CERTIFIED | — | MKT-04 | not deployed | not deployed | — | No |

## 4. Communication and notifications

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| COM-01 | Chat is booking- or request-linked only; no global or pre-quote chat | CODED — NOT CERTIFIED | `202609050003` | Request thread opens only after a quote is submitted and becomes the booking thread; no other entry point in `app/` | — | deployed (in 2026-09-06 batch) | Device certification | No |
| COM-02 | Push notifications | BLOCKED | OD-002 | Provider `disabled`, zero devices, no FCM credential; configuration authority deployed | — | deployed, disabled | Credential and staff identity | **Yes** — OD-002 |
| COM-03 | Push is never dispatched on a schedule | VERIFIED CURRENT (source) | — | `push-delivery.test.mts`: the only cron schedule is the marketplace drain | — | — | — | No |

## 5. Money

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PAY-01 | Cash only | DEFERRED BY PRODUCT DECISION | Owner; `payment-provider-selection.md` DEFERRED | `online_payments`, `payouts` flags off in Production | off | off | Do not reactivate payment work | No |
| PAY-02 | Earnings screens are truthful about cash-only | OPEN — not re-audited (P2) | Owner | `worker/earnings`, `provider-earnings` UNTESTED in `mobile-feature-certification.md` | — | — | Audit copy and figures on a device | No |

## 6. Release, platforms, operations

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REL-01 | Build identity and fingerprint runtime version | CODED — NOT CERTIFIED on EAS | `b2b0683` | Local APK embeds the same fingerprint the CLI computes (`3b2008dd…` at `0cc91f9`) | — | no production binary exists | First EAS build | No |
| REL-02 | Minimum-supported-version gate | OPEN (release architecture backlog) | Owner, 2026-09-16: may stay open, must not strand users | `release-management-runbook.md` | — | — | Design when a first binary ships | No |
| REL-03 | Production restore capability | DEFERRED BY PRODUCT DECISION | OD-001 | Free plan, no PITR, no backups | — | none | — | **Yes** — OD-001, and it now gates MKT-01, MKT-05, TRS-01 |
| REL-04 | iOS | BLOCKED | Apple Developer enrolment | No iOS build ever | — | — | — | **Yes** — enrolment under the legal entity |
| REL-05 | Web production deploy | BLOCKED as last recorded | — | Vercel CLI token expired 2026-09-06; later web releases on 2026-09-11 are recorded, so re-check before relying on this | — | not verified | Confirm current web deployment | No |
| REL-06 | Security governance: single authorised operator | VERIFIED CURRENT | `202609060010` | `governanceMode single_operator`, `requiredApprovals 1` recorded at activation | deployed | deployed | Do not resurrect dual control | No |
| REL-07 | `READINESS-GAP-REGISTER.md` G07 "dual control on irreversible actions" | SUPERSEDED | by REL-06 | — | — | — | — | No |
| REL-08 | Terminal marketplace job failures | CODED — NOT CERTIFIED | MKT-05 | Written to the operational log as `marketplace.job_terminal_failure` | not deployed | not deployed | Decide whether that log alerts anyone | No |

## 7. Location

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LOC-01 | Live arrival tracking | OPEN — nothing built | `docs/architecture/live-arrival-tracking.md` | Audit complete, no implementation | — | — | Separate programme; must not reuse the matching anchor | No |
| LOC-02 | Location failure matrix (permission, services off, no provider, no result) | CODED — PARTIAL certification | — | Earlier queue items B, E, F, G–J not yet rendered | — | — | Finish rendered matrix | No |
| LOC-03 | A request can be created from an address with coordinates but no confirmed pin | OPEN (P2) | Location integrity | `create_marketplace_request` checks latitude/longitude, not `pin_confirmed_at` | — | not verified | Require a confirmed pin | No |

## 8. Experience, language, accessibility

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 | Visual north star (role picker's artistic language; dark mode a designed sibling) | CODED — NOT CERTIFIED (standard recorded) | Owner | `docs/ux/visual-north-star.md` | — | — | Progressive application; one batched design review | No |
| UX-02 | Result card footer collided ("Usually replies in 20 minutes" over the price) | VERIFIED CURRENT (Android, EN, 411dp, light, Mock) | — | Before: label x 391–624 over price x 608–835. After, same card: label y 1866–1908, price wrapped to y 1929–1982, no overlap; `wps020` asserts both rows wrap | — | — | AR/FR, 320dp and 1.3× not rendered for this fix | No |
| UX-03 | Home search placeholder clipping at 1.3× FR 320dp; small search, filter and "View all" targets | OPEN (P2) | — | Recorded in `visual-north-star.md` known gaps | — | — | Fix with render proof | No |
| UX-04 | Mobile feature certification | OPEN | — | Most Professional, settings, legal, help and support routes UNTESTED in `mobile-feature-certification.md` | — | — | Continue the matrix, Arabic first on Professional screens | No |
| UX-05 | iOS VoiceOver | UNVERIFIED | Owner: platform claims stay narrow | Android TalkBack evidence only | — | — | Needs an iOS build | Blocked by REL-04 |
| UX-06 | Low-literacy Professional UX | OPEN — not audited as its own pass | Owner | — | — | — | Dedicated pass | No |

## 9. Deferred and absent, stated plainly

| ID | Item | State | Authority |
| --- | --- | --- | --- |
| DEF-01 | Payments and payouts | DEFERRED BY PRODUCT DECISION | PAY-01 |
| DEF-02 | Legal review of every document | BLOCKED — not performed; never to be represented as done | G23 |
| DEF-03 | Skill Certificate workflow | DEFERRED BY PRODUCT DECISION | Owner |
| DEF-04 | HEIC/HEIF | DEFERRED BY PRODUCT DECISION | Owner; several WPS documents still list HEIC as accepted — those statements describe intent, not current certified support |
| DEF-05 | Backups and PITR | DEFERRED BY PRODUCT DECISION | OD-001 |
| DEF-06 | OCR in Production | BLOCKED — no Vision credential | Release history 2026-09-06 |

## 10. Findings not yet reconciled

The master reconciliation named these from earlier audits. The audits that
raised them are not in this repository, so each is listed with what was checked
now rather than with a guessed state.

| ID | Finding | What was checked | State |
| --- | --- | --- | --- |
| OLD-01 | Provider feed bypassing the sanitized trust authority | Traced: every provider feed uses the discoverability gate, which ignored trust state | Became TRS-01 |
| OLD-02 | Scheduled expiry worker | Traced: no process drains `marketplace_jobs` | Became MKT-05 |
| OLD-03 | HEIC/HEIF | — | DEF-04 |
| OLD-04 | Professional cold-starts on Customer Home | Not re-traced | OPEN — needs a device trace of `AuthGate` and `defaultModeFor` |
| OLD-05 | Duplicate verification journeys | Native: `provider-verification` is only a redirect to `/worker/verification`, kept for old links, and every native entry point uses `/worker/verification`. Web not checked | Native: one journey (source). Web: OPEN |
| OLD-06 | Gates with no action | Not re-traced | OPEN |
| OLD-07 | Android earnings crash | Earnings routes UNTESTED | OPEN — reproduce on device |
| OLD-08 | Job progression controls disappearing | Not re-traced | OPEN — device trace of `provider-job/[id]` |
| OLD-09 | Staff review UI | Not re-traced | OPEN |

## 11. Test and fixture honesty

| ID | Item | State | Evidence |
| --- | --- | --- | --- |
| FIX-01 | Matching proven only with hand-inserted anchors | SUPERSEDED by `marketplace-matching-anchor.test.sql` | MKT-01 |
| FIX-02 | "Trusted worker leases due jobs" leased by hand | SUPERSEDED by `marketplace-job-drain.test.sql` | MKT-05 |
| FIX-03 | `marketplace-intelligence.test.sql` still seeds anchors with source `operations`, a state nothing writes | OPEN (P3) | Convert to the work-location writer |
| FIX-04 | Seed and suites wrote service-area coordinates "so distance is testable" | SUPERSEDED — removed, and the column now refuses values | `202609160001` §9 |
| FIX-05 | Provider approval, verification and staff grants are inserted as fixtures | Accepted | These are staff state the suites are not about; each suite says so |

---

## Keeping this true

A row changes when its evidence changes, in the same commit. Deploying a
migration moves its **Prod** cell only when the release is recorded in
`docs/operations/production-release-history.md`. A device run moves
**CODED — NOT CERTIFIED** to **VERIFIED CURRENT** only with the rendered
evidence named in the row.
