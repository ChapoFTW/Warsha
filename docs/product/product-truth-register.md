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
| MKT-07 | Web explains the wait before a quote can be chosen | VERIFIED CURRENT (web, local render) | Owner, 2026-09-17: about two minutes, may close earlier; EN/AR/FR; a11y and RTL | `src/marketplace-intelligence/quote-window.ts` is the one rule native and web use; web shows it as a polite status and wakes itself when the wait ends; realtime brings an early close. Rendered locally in Chromium, EN/AR/FR at 1280px and 320px: shown, `dir=rtl` in Arabic, no page errors. Native uses the same rule and wording; **not reachable in the Mock build** (Mock answers a request at once, which closes the wait early), so native rendering waits for Development. Not certified against Development | not deployed (client) | not deployed | Render native; Development certification | No |
| MKT-08 | Urgent-service surcharge preview is priced for the Customer's area | CODED — NOT CERTIFIED | Owner, 2026-09-17: area-derived, same rules as the request, truthful when unavailable | `202609170008`: `emergency_provider_surcharges` applies the urgent wave's tests and acceptance's surcharge choice; preview needs a confirmed address, refuses where nobody covers it; approval bound to the address. `emergency-surcharge-area.test.sql` (12); 7 fail against the national maximum. **Rendered, Android mock build (EN):** Zamalek shows `150.00 EGP` with the ceiling explanation; an uncovered address says nobody urgent covers it. Mock's fixed 250 EGP replaced by a per-district fixture. Web has no urgent flow | not deployed | not deployed | Deploy; Development certification | No |
| MKT-09 | A Professional can declare only one district | DEFERRED BY PRODUCT DECISION until decided (P3) | Worker editors take `areas[0]` | District eligibility may be narrower than Professionals intend | — | — | — | **Yes** — multiple districts or governorate-wide coverage |
| MKT-10 | Comeback and Rescue under service-area eligibility | CONFLICT (P2) | Comeback targets the original Professional; Rescue copies `schedule_kind` | A Professional who changed area is no longer eligible for a comeback to the same Customer | — | — | — | **Yes** — should a comeback bypass area eligibility |
| MKT-11 | Address book does not mark the work location, so deleting it is unexplained | OPEN (P2) | — | Deleting the anchored address reopens the work-location step (tested) without warning in the address book | — | — | Label the work location and warn before deleting | No |
| MKT-12 | Planned requests in Production created before MKT-01/05 deploy | OPEN | — | Any such request invited nobody and never expired | — | not verified | After deploy, count open requests past `expires_at`; the drain will expire them | No |

## 2. Trust, safety, reviews

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TRS-01 | **A hidden, removed, suspended or banned Professional stays discoverable and invitable** (P0) | CODED — NOT CERTIFIED | WPS-016 `trust_state_allows` | `202609170003`; `trust-marketplace-visibility.test.sql` through the staff RPC; 7 assertions fail against the old gate | not deployed | not deployed. `trust_state_allows` has no callers at the recorded head. **Not verified by query.** | Deploy | Deploy needs restore point / exception |
| TRS-02 | Account restrictions restrict what their names say: hidden, suspended, removed/banned, communication, review | CODED — NOT CERTIFIED | Owner canonical behaviour, 2026-09-17; WES-016 amendment | `202609170006`: `account_restriction`/`account_may` and row triggers on requests, quotes, revisions, bookings, request conversations, messages, reviews, replies and votes whenever an end user acts; leaving a job always allowed; refusals `WR001`/`WR002`; `get_customer_quotes` and booking contact follow it. `account-restrictions.test.sql` (88) through the real RPCs and the staff RPC; 27 assertions fail with the triggers removed. A real defect found on the way: cancelling as a removed Customer was refused through the booking conversation's system note | not deployed | not deployed. **Not verified by query** | Clients: tell the person why an action was refused, show status and appeal (TRS-07); deploy | No |
| TRS-07 | A restricted person can see their status and appeal, and is told why an action was refused | CODED — web VERIFIED locally; native rendering pending | Owner: removed/banned keep status, reason, support and appeal | Shared reader `src/account-standing/account-restriction.ts` (WR001/WR002, status parser). **Web:** status and appeal on the Customer Account page and Professional profile; restriction messages on request create/select, quote actions, job actions and request chat. Rendered locally EN/AR/FR at 1280/320 after a synthetic staff account suspended a synthetic Customer through `staff_record_enforcement_action`: reason and end date shown, Send disabled until a statement, appeal sent and shown, request refused with the restriction message, RTL in Arabic, no overflow, no page errors. **Native:** Account status screen from the Customer profile and Professional settings; restriction explained at request create, quote choice, quote and urgent acceptance, job progress, booking chat, direct booking, request chat and reviews. Mock enforces nothing and shows good standing; restricted native states need Development | not deployed | not deployed | Native render (good standing); certify restricted states on Development; deploy | No |
| TRS-08 | Payment and withdrawal holds | RESOLVED IN SOURCE | Owner: cash-only, no fake payout behaviour | New holds refused (`55000`); status, staff overview and console no longer mention holds; historical rows kept | not deployed | not deployed | Deploy with TRS-02 | No |
| TRS-03 | Ratings and reviews end to end | CODED — NOT CERTIFIED | WPS-011 | Native `submit_booking_review_v2`; **web has no review submission**; `new_review_ui` staged off in Production | — | not verified | Web parity, then device certification. Do not market reviews until certified | No |
| TRS-04 | Criminal-record certificate is not collected until legal consultation | CODED — NOT CERTIFIED | Owner, 2026-09-17: do not require, do not present as mandatory, keep the capability dormant | `202609170004` policy row (off): gates, provisional activation, submission, storage upload and staff review follow it; `worker-criminal-record-not-collected.test.sql` (23) and the vetting suite turning the policy on to prove the dormant path (215). Native journey omits the step (`wps025`). Legal documents republished as 1.1 (`202609170005`, `legal-compliance-governance.test.sql`); **no legal review took place**. Onboarding without the step **not rendered** | not deployed | not deployed. Production still requires a certificate at the recorded head. Certificates already held stay private and untouched. **Not verified by query** | Deploy with the batch; render the four-step journey | No |
| TRS-05 | Criminal-record attestation is never ticked with synthetic data | VERIFIED CURRENT (process) | Owner, 2026-09-11 | Boundary kept in every QA pass. While TRS-04 is off the declaration is unreachable | — | — | None while collection is off | No |
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
| PAY-03 | The native request form offers "Online" and "Cash or online" payment although Warsha is cash-only | OPEN (P2) | Owner: cash-only, no implied payment processing | `app/marketplace-request/new.tsx` renders `either`, `cash`, `online` chips and sends the choice as `paymentCompatibility`, which also narrows matching (`provider_cash_restricted`). Web sends `either` without asking | — | — | Decide the honest request field for a cash-only product (probably none), then align native, web and the matcher | No |

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
| LOC-03 | A request needs a location its owner confirmed | CODED — NOT CERTIFIED | Owner, 2026-09-17 | `202609170007`: only `confirm_my_service_address` sets `pin_confirmed_at`/`pin_source` (an end user's direct write cannot; moving coordinates or clearing withdraws it); `create_marketplace_request` requires it. The same forgery could make a Professional's work anchor `verified` — closed. `request-location-confirmation.test.sql` (15); mutation: forged confirmation, moved pin and forged anchor all pass without the guard. Nothing backfilled. **Rendered, Android mock build, EN and AR:** unconfirmed addresses marked; the in-form card confirms in place (Confirm and Send disabled until a pin, then enabled); a Customer who has just onboarded sees their address confirmed (a stale-list defect found by rendering and fixed). **Web rendered locally, EN/AR/FR, 1280/320:** badge, re-pin on edit, only confirmed addresses offered, server refusal 55000 | not deployed | not deployed. Production addresses with coordinates but no confirmation will need confirming. **Not verified by query** | Deploy; Development certification | No |

## 8. Experience, language, accessibility

| ID | Item | State | Decision & authority | Evidence | Dev | Prod | Next action | Owner decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 | Visual north star (role picker's artistic language; dark mode a designed sibling) | CODED — NOT CERTIFIED (standard recorded) | Owner | `docs/ux/visual-north-star.md` | — | — | Progressive application; one batched design review | No |
| UX-02 | Result card footer collided ("Usually replies in 20 minutes" over the price) | VERIFIED CURRENT (Android, EN, 411dp, light, Mock) | — | Before: label x 391–624 over price x 608–835. After, same card: label y 1866–1908, price wrapped to y 1929–1982, no overlap; `wps020` asserts both rows wrap | — | — | AR/FR, 320dp and 1.3× not rendered for this fix | No |
| UX-03 | Home search placeholder clipping at 1.3× FR 320dp; small search, filter and "View all" targets | OPEN (P2) | — | Recorded in `visual-north-star.md` known gaps | — | — | Fix with render proof | No |
| UX-04 | Mobile feature certification | OPEN | — | Most Professional, settings, legal, help and support routes UNTESTED in `mobile-feature-certification.md` | — | — | Continue the matrix, Arabic first on Professional screens | No |
| UX-05 | iOS VoiceOver | UNVERIFIED | Owner: platform claims stay narrow | Android TalkBack evidence only | — | — | Needs an iOS build | Blocked by REL-04 |
| UX-06 | Low-literacy Professional UX | OPEN — not audited as its own pass | Owner | — | — | — | Dedicated pass | No |
| UX-07 | Web request detail could not be opened | VERIFIED CURRENT (web, local render) | Defect found while rendering MKT-07 | The request list and the open detail both subscribed to the same realtime spec; `supabase.channel(topic)` returns the already-subscribed channel and adding bindings threw, so the detail showed "That could not be loaded". Every subscription now opens its own topic (`realtimeSubscriptionTopic`, native and web; `realtime-coverage` asserts it). Rendered: the detail opens with no page errors. Native had the same shared-channel pattern (a second subscriber would lose events when the first unmounted); fixed in source, not observed on a device | fixed locally, not deployed | not deployed | Deploy web | No |
| UX-08 | Signed-in web pages scrolled sideways in Arabic at 320px | VERIFIED CURRENT (web, local render) | 320px, no horizontal page scroll | The shell grid had no column sizing; header, page and footer were 329px. `grid-template-columns: minmax(0, 1fr)`; re-rendered AR/EN/FR at 320px with `scrollWidth` 320 and no element past the edge | fixed locally, not deployed | not deployed | Deploy web | No |
| UX-09 | Screens that add `direction: 'rtl'` put Arabic text on the left | OPEN (P3) — request form fixed | RTL authority: `src/i18n/direction.ts` (explicit per-component mirroring, neutral root) | Rendered in Arabic: the request form's labels, and a new card, sat at the left edge. The screen's `direction: 'rtl'` container was a second mirror, and inside it `AppText`'s right alignment swapped. The request form now reverses its rows itself (`rtl-layout-baseline`). `app/worker/verification.tsx` and `app/provider-earnings.tsx` still carry the container | request form: rendering pending | — | Remove the container from the other two with render proof | No |
| UX-10 | Native start-up can crash with "Attempted to navigate before mounting the Root Layout" | OPEN (P2) | Low-end devices | Seen once on a starved emulator cold start: `AuthGate` navigated before the root layout mounted and the app showed its error screen; a clean relaunch worked. Not reproduced on demand | — | — | Guard the navigation until the navigator is ready; reproduce with a slowed start | No |

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
| OLD-04 | Professional cold-starts on Customer Home | Source: `AuthGate` renders a neutral gate and gives the router no destination until auth, onboarding and provider state have settled for the same account (`routeAfterHydration`, `accountHydrationReady`); a settled Professional resolves to `/worker` | CODED — NOT CERTIFIED: not reproduced or disproved on a device with a Supabase Professional account |
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
| FIX-03 | `marketplace-intelligence.test.sql` seeded anchors with source `operations`, a state nothing writes | SUPERSEDED — its anchors now come from `confirm_my_work_location` | 97 assertions unchanged and passing |
| FIX-04 | Seed and suites wrote service-area coordinates "so distance is testable" | SUPERSEDED — removed, and the column now refuses values | `202609160001` §9 |
| FIX-05 | Provider approval, verification and staff grants are inserted as fixtures | Accepted | These are staff state the suites are not about; each suite says so |

---

## Keeping this true

A row changes when its evidence changes, in the same commit. Deploying a
migration moves its **Prod** cell only when the release is recorded in
`docs/operations/production-release-history.md`. A device run moves
**CODED — NOT CERTIFIED** to **VERIFIED CURRENT** only with the rendered
evidence named in the row.
