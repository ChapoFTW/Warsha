# WPS-008 — Marketplace Intelligence

## 1. Document metadata

| Field | Value |
| --- | --- |
| Title | WPS-008 — Marketplace Intelligence |
| Version | 1.2 |
| Status | **LOCKED FOR IMPLEMENTATION** |
| Depends on | WPS-001 through WPS-007 |
| Primary market | Egyptian consumers and independent workers |
| Business support | **FUTURE / additive** |

This is a product specification. It defines required behavior and outcomes, not database tables, application components, or implementation libraries.

Authority order:

1. Warsha Constitution
2. WPS-008
3. WES-008

The Constitution overrides this document. This document overrides WES-008.

### Table of contents

1. [Document metadata](#1-document-metadata)
2. [Purpose](#2-purpose)
3. [Mission alignment](#3-mission-alignment)
4. [Scope](#4-scope)
5. [Out of scope](#5-out-of-scope)
6. [Terminology](#6-terminology)
7. [Marketplace philosophy](#7-marketplace-philosophy)
8. [Marketplace flows](#8-marketplace-flows)
9. [Service categories](#9-service-categories)
10. [Worker eligibility](#10-worker-eligibility)
11. [Geographic matching](#11-geographic-matching)
12. [Availability and inferred capacity](#12-availability-and-inferred-capacity)
13. [Historical pricing intelligence](#13-historical-pricing-intelligence)
14. [Marketplace behavioral intelligence](#14-marketplace-behavioral-intelligence)
15. [Invitation ranking](#15-invitation-ranking)
16. [Fair opportunity distribution](#16-fair-opportunity-distribution)
17. [Progressive quote collection](#17-progressive-quote-collection)
18. [Quote submission](#18-quote-submission)
19. [Quote comparison and sorting](#19-quote-comparison-and-sorting)
20. [Quote selection and confirmation](#20-quote-selection-and-confirmation)
21. [Request lifecycle](#21-request-lifecycle)
22. [Request editing](#22-request-editing)
23. [Scheduling](#23-scheduling)
24. [Emergency flow](#24-emergency-flow)
25. [Cancellations and Rescue Mode](#25-cancellations-and-rescue-mode)
26. [No-shows and Running Late](#26-no-shows-and-running-late)
27. [Warranties and comeback requests](#27-warranties-and-comeback-requests)
28. [Reputation inputs](#28-reputation-inputs)
29. [Customer preference learning](#29-customer-preference-learning)
30. [Notifications and realtime outcomes](#30-notifications-and-realtime-outcomes)
31. [Analytics](#31-analytics)
32. [Anti-abuse principles](#32-anti-abuse-principles)
33. [Deferred decisions](#33-deferred-decisions)
34. [Acceptance criteria](#34-acceptance-criteria)
35. [Changelog](#35-changelog)

## 2. Purpose

WPS-008 defines how Warsha identifies eligible workers, collects useful quotes, ranks marketplace opportunities, protects fair access, learns from completed work, and converts a customer request into a confirmed booking.

The system must continue to operate authoritatively when the mobile app is closed or backgrounded. It must produce understandable customer and worker outcomes without exposing private marketplace intelligence.

## 3. Mission alignment

WPS-008 advances “Warsha finishes your work safely, for the fairest price” by:

- using verified, eligible workers;
- respecting distance, availability, payment, and trust restrictions;
- creating transparent competition without broadcasting work to everyone;
- allowing customers to compare price with quality, reliability, ETA, warranty, and experience;
- preserving explicit agreement and price approval;
- protecting new-worker opportunity without sacrificing customer outcomes;
- learning from actual completed work; and
- supporting recovery when matching, confirmation, attendance, or completion goes wrong.

“Safely” includes transaction safety, rip-off protection, identity, pricing integrity, privacy, evidence, and accountability. It is not limited to physical safety.

## 4. Scope

**LOCKED:** WPS-008 covers:

- Browse Workers, Get Quotes, and Emergency marketplace flows;
- the ten launch service categories;
- worker hard eligibility;
- geographic eligibility and progressive search expansion;
- simple worker availability and inferred capacity;
- historical pricing and behavioral intelligence;
- invitation ranking and opportunity fairness;
- progressive invitation waves;
- quote submission, comparison, selection, and confirmation;
- request creation, editing, cancellation, expiry, replacement, and background continuity;
- ASAP, Today, Scheduled, and Flexible timing;
- Rescue Mode;
- Running Late and no-show evidence;
- warranty/comeback routing preparation;
- reputation inputs;
- customer preference-learning preparation;
- notifications and live outcome refresh;
- restricted analytics;
- abuse-signal preparation;
- English, Egyptian Arabic, and RTL behavior; and
- isolated Mock and Supabase data modes.

## 5. Out of scope

The following do not shape the MVP:

- employer, payroll, career-management, academy, or worker-training features;
- large-company dispatch, multi-worker team capacity, or enterprise workflows;
- public worker pricing tiers;
- public customer preference labels;
- artificial-intelligence claims for rule-based matching;
- recurring scheduling;
- unlimited worker-created warranty periods;
- automatic no-show financial penalties;
- live phone-number exposure;
- fully deployed masked calling or relay infrastructure;
- service-level emergency eligibility;
- production live-location tracking;
- automated suspension based on a single signal; and
- business/team capacity.

Items explicitly planned for later are labeled **FUTURE** or **DEFERRED** in this document.

## 6. Terminology

| Term | Product meaning |
| --- | --- |
| Worker | An independent craftsman or service provider. Preferred product-facing term. |
| Provider | Established internal term that may remain until safely migrated. |
| Marketplace request | A customer’s pre-booking request for a specific worker, competing quotes, emergency help, rescue, or warranty comeback. |
| Eligible worker | A worker who passes every applicable hard filter. |
| Invitation | A private opportunity sent to one eligible worker. |
| Quote | A worker’s time-limited proposed agreement for a non-emergency request. |
| Best Value | Default ordering balancing price, quality, reliability, ETA, distance, completeness, warranty, and previous relationship. |
| Selection | The customer’s commitment to one quote, pending the selected worker’s confirmation. |
| Confirmation | The selected worker’s explicit acceptance within the confirmation window. |
| Inferred capacity | Estimated workload based on accepted work, duration, travel, buffer, and overlap rather than worker-maintained shifts. |
| Rescue Mode | Replacement matching that preserves request data after a selected worker cancels. |
| Opportunity utilization | How responsibly a worker uses invitations, quotes, selections, and completed work, considered with cancellations and no-shows. |

## 7. Marketplace philosophy

### 7.1 Customer outcome first

Customer safety and a useful outcome are the first priority. Fairness applies only among eligible workers who meet quality and trust floors.

### 7.2 Best Value, not one extreme

No single factor—price, rating, distance, speed, or experience—defines the best result. Customers may deliberately choose lower-priced or higher-priced quotes.

### 7.3 Eligibility before intelligence

Hard filters are absolute. Ranking, fairness, a repeat relationship, or new-worker exposure cannot restore an ineligible worker.

### 7.4 Useful choice, not a broadcast

Warsha invites a controlled set of eligible workers and expands progressively when needed. It does not send every request to every worker.

### 7.5 Infer instead of configure

Warsha learns capacity, pricing, reliability, customer preferences, and opportunity distribution from relevant marketplace behavior. Workers retain one simple availability control.

### 7.6 Transparent agreements

The selected quote and later approved revisions define the agreement. Late quotes do not replace a selection, and unapproved price changes do not become final prices.

## 8. Marketplace flows

### 8.1 Browse Workers

**LOCKED:**

1. The customer browses worker profiles.
2. The customer selects a specific worker.
3. The primary MVP action is **Request a Quote**.
4. The selected worker receives the request directly and submits a quote or declines.
5. The customer accepts the quote.
6. The selected worker confirms.
7. The confirmed agreement converts into the existing booking lifecycle.
8. A displayed historical or starting price is not represented as a guaranteed quote.

The selected worker must still pass all applicable eligibility rules.

Fixed-price direct booking is **FUTURE / outside MVP** unless an existing safe compatibility path must remain during migration. A compatibility path is not the primary Browse Workers behavior and does not bypass eligibility, agreement, or WPS-007 price controls.

### 8.2 Get Quotes

**LOCKED:**

1. The customer describes the job.
2. Warsha identifies and privately invites selected eligible workers.
3. Invited workers submit quotes.
4. The customer compares available quotes.
5. The customer selects one quote.
6. The selected worker confirms within the confirmation window.
7. The confirmed agreement becomes a booking.

### 8.3 Emergency

**LOCKED:**

- Emergency is a separate flow without quote competition.
- Only workers opted into emergencies for an eligible category are considered.
- Estimated arrival is prioritized.
- The first suitable worker whose acceptance succeeds gets the job.
- Search radius expands progressively.
- The applicable emergency surcharge is shown before request creation and requires explicit customer approval.
- Only after approval is the Emergency request created; no hidden or retroactive surcharge is permitted.
- Emergency misuse is tracked internally.

**FUTURE:** Live rescue-style tracking is intended after acceptance.

**DEFERRED:** Emergency eligibility by individual service. MVP eligibility is category-level.

## 9. Service categories

The launch category set is fixed.

### 9.1 Core

- Plumbing
- Electrical
- Carpentry
- AC Repair
- Cleaning

### 9.2 Additional

- Painting
- Appliance Repair
- Satellite & TV Installation
- Moving Help
- General Maintenance

No additional launch category may be inferred or added through WPS-008 implementation without a product-specification change.

## 10. Worker eligibility

A worker must pass every applicable hard filter:

1. Offers the requested service or category.
2. The customer is within the worker’s service radius.
3. Worker status is Available.
4. Worker account is active.
5. Identity verification is approved.
6. Worker is not suspended, blocked, or otherwise ineligible.
7. The worker satisfies payment-method restrictions.
8. Cash-debt rules permit cash work when cash is required.
9. Emergency opt-in exists for emergency work.
10. Any legally required category credential is valid.
11. The requested schedule does not create a prohibited conflict.

Distance is evaluated immediately after service compatibility. A ranking score, fairness adjustment, customer preference, or repeat relationship cannot override a failed filter.

Eligibility is reevaluated before invitation, quote submission, selection, confirmation, emergency acceptance, and Rescue Mode reassignment where the relevant facts may have changed.

## 11. Geographic matching

Workers define:

- a base location; and
- a maximum service radius.

Warsha also has a configurable marketplace maximum radius.

**LOCKED:**

- A worker is never invited beyond that worker’s own radius.
- Marketplace expansion never exceeds the marketplace maximum.
- Search may expand in progressive waves when all invited workers decline or useful responses do not arrive.
- Exact customer address is not exposed before it is necessary for the agreement.
- Matching uses a trusted location snapshot rather than an unverified display label.

The customer receives a clear outcome when expansion cannot find an eligible worker.

## 12. Availability and inferred capacity

Worker-facing availability is only:

- Available
- Unavailable

Workers must not be required to configure weekly schedules, working-hour calendars, lunch breaks, vacation planners, or complex shifts.

Warsha infers effective capacity from:

- accepted and confirmed bookings;
- scheduled booking times or windows;
- estimated job duration;
- estimated travel time;
- the fixed 30-minute post-completion buffer;
- overlapping commitments; and
- total estimated workload in the relevant rolling 24-hour period.

### 12.1 Locked travel-time policy

The configured routing provider, such as Google Maps or an approved equivalent, is the authoritative travel-time source.

When the routing provider is unavailable, Warsha uses a deterministic fallback:

1. calculate straight-line distance between the relevant trusted booking locations;
2. multiply that distance by the configured road factor; and
3. divide the adjusted distance by the configured average urban speed to estimate travel time.

The road factor and average urban speed are controlled configuration values. A client cannot supply or override them.

### 12.2 Locked duration and buffer policy

Every launch service category has a configured default estimated duration. A more accurate approved service-, request-, or quote-level estimate takes precedence. When no more accurate estimate exists, Warsha uses the category default.

Every confirmed booking includes a fixed 30-minute buffer after its estimated completion time. Workers do not configure this buffer.

### 12.3 Locked missing-information and overlap policy

- Missing duration uses the configured category default.
- Missing routing-provider travel time uses the deterministic straight-line-distance fallback.
- If a relevant booking location is missing and an overlap cannot be safely ruled out, Warsha treats the proposed commitment as conflicting.
- Workers do not receive invitations for requests that overlap an existing commitment after estimated duration, travel time, and the fixed 30-minute buffer are considered.

Capacity is inferred from confirmed bookings, scheduled commitments, estimated duration, travel time, and the fixed buffer. These rules apply to hard conflict checks before any capacity-based ranking adjustment.

An Unavailable worker receives no new offers. An Available worker may still be excluded from a conflicting scheduled job.

Among otherwise similarly qualified eligible workers, less estimated workload in the same 24-hour period provides a modest ranking advantage. Workload is measured in estimated time, not booking count.

## 13. Historical pricing intelligence

Warsha learns from completed, approved work. Relevant inputs include:

- category;
- service subtype when available;
- final approved price;
- original quote;
- approved price revisions;
- quote-to-final-price difference;
- location;
- urgency;
- complexity;
- materials included or excluded;
- warranty;
- completion date; and
- sample size and recency.

Pricing intelligence uses robust statistics such as medians and percentiles rather than relying only on averages.

**LOCKED:**

- Cheaper is not automatically better.
- Higher historical prices do not make a worker ineligible.
- Higher-priced workers may rank well based on quality, reliability, warranty, experience, timing, relationship, or customer preference.
- Workers without sufficient history use local marketplace benchmarks and receive no cold-start price penalty.
- Internal lower-price, mid-market, or higher-price positions are not displayed as “Budget,” “Mid-market,” or “Premium.”
- Historical and starting prices are not guaranteed quotes.

## 14. Marketplace behavioral intelligence

Authorized marketplace behavior may inform:

- response performance;
- invitation utilization;
- quote completeness;
- selection and completion outcomes;
- worker and customer cancellation context;
- no-show history;
- reliability;
- repeat-customer relationship;
- recent invitation volume;
- recent jobs won;
- capacity;
- new-worker exposure; and
- suspicious patterns requiring review.

Behavioral intelligence must:

- distinguish opportunity, response, selection, and completion;
- use rates and context rather than raw counts alone;
- decay or recover over time where appropriate;
- avoid arbitrary punishment for isolated events;
- separate customer-caused and worker-caused outcomes;
- remain internal unless a separate product rule authorizes disclosure; and
- not infer facts that weaken security, consent, or legal compliance.

## 15. Invitation ranking

After eligibility, ranking may consider:

- distance;
- estimated ETA;
- historical price position;
- expected value;
- rating;
- review count;
- completed jobs;
- reliability;
- response performance;
- cancellation behavior;
- no-show behavior;
- repeat-customer relationship;
- inferred capacity;
- recent invitation volume;
- recent jobs won;
- new-worker exposure; and
- opportunity utilization.

Exact numeric weights are server-controlled, versioned, auditable, configurable, and not exposed.

Ranking must be deterministic enough for authorized investigation. Customer-facing results must not reveal internal scores, candidate pools, exact weights, or exclusion details that expose trust or abuse controls.

## 16. Fair opportunity distribution

Customer satisfaction remains first.

Fairness must:

- prevent permanent marketplace domination;
- give new verified workers a modest temporary visibility opportunity;
- reduce repeated concentration of invitations and wins;
- recover naturally over time;
- consider recent invitations and jobs won;
- consider whether opportunities are used productively;
- apply only among eligible workers meeting quality floors; and
- never rescue unsafe, unreliable, blocked, or unsuitable workers.

Opportunity utilization includes:

- invitations received;
- quotes submitted;
- response time;
- quotes selected;
- jobs completed;
- worker cancellations;
- customer cancellations; and
- no-shows.

A worker who repeatedly ignores invitations may receive fewer future invitations. A customer cancellation must not be treated as a worker failure without evidence that the worker caused it.

## 17. Progressive quote collection

Warsha uses progressive invitation waves.

**CONFIGURABLE launch baseline:**

- the first wave targets approximately five workers;
- later waves may increase the normal total toward approximately five to eight invitees; and
- exact wave size, wave timing, and maximum invitations remain server-controlled.

**LOCKED behavior:**

- Requests are not broadcast to all workers.
- Additional waves occur only when responses are insufficient and eligible candidates remain.
- A worker invited before the target quote count is reached may continue to quote until the request expires, unless the worker becomes ineligible.
- The target is five useful active quotes and remains server-configurable.
- Once five useful active quotes exist, no new wave is sent.
- Already invited workers are not closed merely because the target was reached.
- Quotes appear to the customer live.
- A request remains active for 10 minutes by default and the value is server-configurable.
- An initial quote remains valid until the request expires, the worker withdraws it, a material request change invalidates it, or the customer selects another worker. MVP has no separate quote-expiry timer.
- The customer cannot select during the initial two-minute collection fairness window. The window remains server-configurable.
- The window may close early when every currently invited worker has quoted, declined, withdrawn, expired, or become ineligible.
- After the window, selection may proceed while valid quotes from already invited workers continue arriving.

The goal is useful choice, not unlimited quote volume.

## 18. Quote submission

A quote supports:

- price;
- estimated arrival or proposed time;
- a short message;
- estimated duration where practical;
- whether labor is included;
- materials included or excluded;
- warranty commitment where applicable; and
- payment methods supported for the job.

**LOCKED:**

- One worker may have only one active initial quote per request.
- Only invited, currently eligible workers may quote.
- Quotes are accepted only while the request and invitation allow it.
- A quote cannot silently change after customer selection.
- Workers cannot see competitors, competitor prices, their rank, their score, exact weights, candidate pools, or customer internal trust data.
- Before customer selection, a worker may revise only that worker's quote.
- Exactly one active current revision exists while every revision remains immutable and auditable.
- A revision never exposes competitor quotes or prices.
- After customer selection the quote is locked. Any later price change uses WPS-007's controlled booking price-adjustment workflow.

## 19. Quote comparison and sorting

Default ordering is **Best Value**.

Best Value considers:

- price competitiveness;
- quality;
- reliability;
- ETA;
- distance;
- quote completeness;
- warranty where applicable; and
- previous relationship.

Customers may manually sort by:

- Lowest Price;
- Highest Rated;
- Closest;
- Fastest Arrival; and
- Most Experienced, when reliable experience data exists and the option is useful.

Sorting changes presentation, not eligibility. A customer may intentionally select a more expensive quote. Warsha must not steer every customer toward the cheapest worker.

## 20. Quote selection and confirmation

Once the customer selects a quote:

- the customer is committed to that worker pending confirmation;
- later quotes cannot replace the selection;
- the selected worker receives a short confirmation window;
- the recommended default confirmation window is two minutes and configurable;
- only the selected worker may confirm;
- selection and confirmation are race-safe;
- if confirmation succeeds, the agreement converts once into a booking;
- if the worker fails to confirm in time, the selection expires; and
- the customer may select another still-valid quote or continue searching while the request remains valid.

Fairness does not replace explicit worker confirmation.

## 21. Request lifecycle

A marketplace request progresses through clear customer-facing phases:

1. Draft
2. Matching
3. Collecting quotes or waiting for an emergency acceptance
4. Customer reviewing
5. Selection pending worker confirmation
6. Worker confirmed
7. Converted to booking

Alternative terminal or recovery outcomes include:

- customer cancelled;
- expired;
- replaced after a major edit;
- Rescue Mode;
- no eligible worker found; and
- closed after conversion.

**LOCKED:**

- Matching and quote collection continue when the app closes or backgrounds.
- A request remains active for 10 minutes by default, measured from authoritative creation time; the value is server-configurable.
- Initial quotes do not have an independent MVP expiry timer and follow the request/withdrawal/edit/selection rules in Section 17.
- Returning customers reload authoritative current state.
- A customer may cancel freely before selecting a worker.
- Invited workers are told when the request closes.
- Invalid lifecycle ordering and duplicate conversion are rejected.
- A late quote cannot replace a selected or confirmed worker.

If no worker responds before expiry, the request expires without blaming the customer and offers:

- Retry now;
- Expand search where allowed;
- Schedule for later; and
- Browse workers manually.

## 22. Request editing

The customer has a limited edit window:

- five minutes after request creation; or
- until a worker is selected;
- whichever occurs first.

Minor edits may include:

- description clarification;
- additional photos;
- corrected notes;
- compatible timing adjustments; and
- small address clarification.

Minor edits preserve the request, create an audited revision, notify invited workers, and let each worker retain, revise, or withdraw a quote.

Major edits include:

- different category;
- fundamentally different scope;
- materially different location; or
- a change that could invalidate pricing or eligibility.

Major edits close the original request, invalidate its invitations and quotes, preserve the audit history, create a linked replacement request, and begin a new matching cycle.

When the server cannot classify an edit safely, it treats the edit as major.

## 23. Scheduling

Supported timing choices:

- ASAP
- Today
- Scheduled
- Flexible

Scheduled and flexible requests begin matching immediately rather than waiting until the service time.

After selection and confirmation:

- the agreed time or window is reserved;
- inferred capacity updates;
- travel and buffer time are considered; and
- conflicting invitations are prevented where necessary.

Flexible requests accept a date/time range and may improve matching and pricing.

All customer-facing times follow the applicable Egypt time context and remain unambiguous across stored and displayed values.

## 24. Emergency flow

Emergency dispatch is separate from quote competition.

**LOCKED:**

- Only emergency-eligible categories participate.
- A worker must explicitly opt into emergencies for the category.
- Every normal safety, account, verification, payment, radius, and block rule still applies.
- ETA is the primary ranking objective after hard eligibility.
- Search radius expands progressively without exceeding worker or marketplace limits.
- The first suitable worker whose atomic acceptance succeeds receives the job.
- Other emergency invitations close immediately.
- The applicable emergency surcharge is shown before request creation using WPS-007's authoritative price components.
- The customer must explicitly approve the surcharge before the Emergency request is created.
- No hidden or retroactive surcharge is permitted.
- Emergency cancellation starts immediate replacement matching.
- Emergency misuse contributes an internal signal but does not cause automatic punishment on one signal.

**FUTURE:** Live rescue-style tracking after acceptance.

## 25. Cancellations and Rescue Mode

Declining before an agreement carries no penalty.

After customer selection and worker confirmation, an agreement exists. Either party may still become unable to proceed. Cancellation records actor, stage, timing, reason, and context. There is no automatic cancellation fee at MVP launch. Repeated patterns may influence internal reliability and trigger proportionate review, but one cancellation does not create automatic punishment. Customer cancellation follows WPS-007 when money has moved.

After agreement, cancellations are recorded with:

- actor;
- phase;
- timing;
- reason;
- frequency;
- rate;
- recent trend;
- total booking volume;
- whether the worker was en route or arrived; and
- replacement outcome.

A crude threshold such as “five cancellations per week” is prohibited. Patterns and context matter.

Potential proportionate interventions include:

- a gentle reminder;
- fewer invitations;
- temporary emergency exclusion;
- lower internal priority;
- manual review; and
- temporary suspension.

Worker-facing language may use “Unable to Complete Job.” A reason is required.

### Rescue Mode

When a selected or confirmed worker becomes unable to complete:

- request description, attachments, category, location, timing, and safe financial context are preserved;
- the customer is clearly notified;
- invitation waves restart automatically;
- the customer is not forced to recreate the job;
- the cancelling worker is excluded;
- eligibility is rerun;
- existing valid quotes may be reused where still appropriate;
- duplicate bookings are prevented; and
- approved financial state is not silently changed.

If a replacement price requires approval, the customer must explicitly approve it. Normal Rescue Mode does not silently create a second booking or transfer an agreement to a new worker at an unapproved price.

Emergency cancellations trigger immediate reassignment search for the next suitable worker.

## 26. No-shows and Running Late

### 26.1 Job milestones

The operational lifecycle includes:

- Accepted
- En Route
- Arrived
- Work Started
- Completed

Arrival records a timestamp and approximate location or validated-radius evidence. Raw GPS history is not exposed unnecessarily.

### 26.2 Customer no-show

The worker waits approximately 10 minutes and may then report that the customer did not respond. The report records authorized evidence and context.

### 26.3 Worker no-show

The customer may report a worker no-show 15 minutes after the latest authoritative ETA. A Running Late update changes that authoritative ETA. The report records timing, state, and available evidence.

### 26.4 Consequences

There is no automatic financial penalty at launch. No-show behavior contributes to internal trust and may trigger manual review. A single report does not automatically suspend either party.

### 26.5 Running Late

A worker can send:

- a delay estimate; and
- a short predefined or optional reason.

The customer receives the update promptly.

## 27. Warranties and comeback requests

Warranty applicability is defined by service or category.

**LOCKED:**

- A category must explicitly enable warranty support and configure its duration before a warranty is displayed.
- Warranty periods are category-configurable and never unlimited arbitrary worker choices.
- Where applicable, the customer sees the warranty before quote selection.
- After completion, the customer can see the remaining warranty period.
- A comeback request must relate to the same issue and original booking.
- The original worker receives the first opportunity to respond.
- A comeback does not trigger an automatic refund.
- Both parties may submit evidence.
- A contested comeback becomes a dispute or staff-review matter.
- A new issue creates a new booking.

Exact category duration values are not hardcoded in this WPS. Warranty/comeback architecture may be implemented fail-closed, and customer-facing warranty remains disabled for a category until approved configuration exists.

## 28. Reputation inputs

WPS-011 adds a public informational confidence score, helpful votes, and reputation badges. They are not marketplace ranking inputs and cannot change WPS-008 eligibility, invitation ordering, fairness, quote comparison, or pricing without a later locked WPS revision.

Only completed, eligible, undisputed, or resolved bookings may be reviewed.

Planned customer review dimensions are:

- Quality
- Punctuality
- Professionalism
- Would hire again

Public presentation remains simple. Search ranking considers review volume as well as average rating.

Workers may privately rate customers for internal trust and abuse detection. Private customer ratings are not public marketplace labels.

## 29. Customer preference learning

**FUTURE / DEFERRED:** With sufficient real selection history, Warsha may infer whether a customer tends to prefer:

- lower-priced workers;
- balanced value; or
- higher-priced, higher-confidence workers.

The preference is not shown as a label to the customer, workers, or other customers. It never bypasses eligibility, safety, or customer-controlled sorting. Until the evidence threshold and safeguards are approved, Best Value remains non-personalized.

## 30. Notifications and realtime outcomes

Marketplace state changes appear live while the app is active and reconcile from authoritative state after reconnect, app backgrounding, account change, or mode change.

Customer notification events include:

- quote received;
- more workers being searched;
- request updated;
- request expired;
- worker selected pending confirmation;
- worker confirmed;
- worker failed to confirm;
- worker cancelled;
- Rescue Mode started;
- replacement found;
- worker running late;
- worker arrived; and
- no worker found.

Worker notification events include:

- new quote invitation;
- request updated;
- quote selected;
- confirmation required;
- request awarded elsewhere;
- request cancelled;
- quote expired;
- emergency request; and
- rescue invitation.

Notifications:

- are deduplicated;
- contain only minimal routing identifiers;
- contain no internal score, exact weight, candidate pool, competitor, competitor price, or customer trust data;
- are available in English and natural Egyptian Arabic;
- support RTL correctly;
- route to the intended request or booking safely; and
- reflect authoritative server outcomes rather than client-side guesses.

## 31. Analytics

Restricted internal metrics include:

- requests created, matched, expired, cancelled, and converted;
- average eligible worker pool;
- invitations per request;
- quotes per request;
- time to first quote and time to selection;
- customer selection distribution;
- quote conversion;
- price distribution;
- quote-to-final-price variance;
- worker invitation utilization;
- worker opportunity concentration;
- cancellation and no-show rates;
- Rescue Mode use and outcome;
- geographic demand and supply gaps;
- emergency fulfillment; and
- scheduled capacity utilization.

Metrics are used for marketplace health, operations, and deferred-decision review. Internal worker metrics and customer trust data are not made public.

## 32. Anti-abuse principles

Warsha tracks and prepares evidence for:

- fake requests;
- quote spam;
- consistent underquoting followed by revisions;
- repeated invitation ignoring;
- repeated quote requests without selection;
- collusion;
- review manipulation;
- emergency misuse;
- location spoofing;
- duplicate accounts; and
- attempts to move transactions off-platform.

Controls may include throttles, idempotency, submission limits, location validation, internal flags, and manual review.

No single signal automatically suspends a customer or worker. Consequential action considers corroboration, pattern, context, and appeal or review where appropriate.

## 33. Deferred decisions

Every deferred decision remains unimplemented as locked behavior until its review trigger occurs and the result is approved.

| Decision | Why deferred | Required data | Review trigger |
| --- | --- | --- | --- |
| Emergency eligibility per individual service | Category-level eligibility is sufficient for MVP; service-level demand is unknown. | Emergency requests and fulfillment by category/service. | Enough emergency volume to show materially different service behavior. |
| Exact invitation wave sizes | Supply density and response rates vary by category and geography. | Eligible-pool size, response rate, time to first quote, and concentration. | Pilot data across representative Egyptian areas. |
| Exact wave timing and radius steps | Responsiveness and density are not yet measured. | Response latency, distance, ETA accuracy, and supply gaps. | Pilot operations in more than one density profile. |
| Exact ranking weights | Weights require observed trade-offs between price, reliability, timing, and conversion. | Offline replay and controlled marketplace outcomes. | Before production ranking activation, then each policy-version review. |
| New-worker boost duration and exit threshold | The amount of exposure needed to establish a worker is unknown. | Invitation, quote, selection, completion, and quality data for new workers. | A representative verified-worker onboarding cohort. |
| Minimum worker-specific pricing history | Sparse data can produce misleading medians. | Completed-job sample distributions by category and area. | Before worker-level pricing profiles influence ranking. |
| Pricing area granularity and recency window | Local density and price movement are not yet known. | Completion volume, geographic spread, seasonality, and price drift. | Before local benchmarks influence ranking. |
| Customer pricing-preference personalization | Customer choice history and consent expectations are unproven. | Repeated selections, opt-out research, and fairness/privacy review. | A sufficient repeat-customer cohort and approved privacy review. |
| AI matching | Rule-based matching is adequate and more auditable for launch. | Demonstrated rule-based limitation, labeled outcomes, and governance. | Approved model-risk and product review. |
| Job Confidence indicator | A public confidence claim needs calibrated evidence and understandable language. | Predicted-versus-actual completion and customer comprehension research. | Demonstrated calibration and approved copy. |
| Recurring scheduling | It introduces recurrence, cancellation, capacity, and payment complexity. | Customer demand and repeat-booking behavior. | Approved recurring-services milestone. |
| Business/team capacity | Enterprise workflows must not shape independent-worker MVP. | Proven business demand and a separate product model. | Warsha Business or B2B approval. |
| Detailed service-duration modeling beyond locked category defaults | Category defaults now provide the required launch fallback, but more granular duration prediction needs structured history. | Estimated and actual duration by service and complexity. | Sufficient completed-job duration coverage. |
| Warranty category enablement and durations | Appropriate protection varies by work type and legal expectations. The architecture remains fail-closed until values are approved. | Service failure patterns, legal review, and worker/customer research. | Before enabling warranty display for any category. |
| Analytics and evidence retention | Retention must be purpose-limited and legally reviewed. | Operational need, privacy assessment, and Egyptian legal advice. | Before production analytics retention is activated. |
| Future post-agreement cancellation fees | MVP launches without an automatic fee. Any later charge or deduction requires cancellation evidence, consumer/legal review, and WPS-007 alignment. | Cancellation causes, consumer expectations, legal and financial review. | Before proposing any automatic cancellation charge or deduction. |

## 34. Acceptance criteria

These criteria define required product outcomes. They do not claim current implementation or test completion.

### 34.1 Authority, purpose, scope, and terminology

| ID | Criterion |
| --- | --- |
| AC-008-001 | Product and engineering reviews show no behavior that conflicts with the Warsha Constitution or WPS-007 financial rules. |
| AC-008-002 | All in-scope flows are available without introducing enterprise, employment, academy, gamification, or forced-email worker behavior. |
| AC-008-003 | Product-facing copy uses “worker” where practical, while internal provider terminology does not leak into confusing user copy. |
| AC-008-004 | Every FUTURE and DEFERRED feature remains clearly unavailable or neutral rather than appearing complete. |

### 34.2 Marketplace flows and categories

| ID | Criterion |
| --- | --- |
| AC-008-005 | Browse Workers uses Request a Quote for a specific worker, requires customer acceptance and worker confirmation before conversion, and never represents historical price as a guaranteed quote. |
| AC-008-006 | Get Quotes completes the describe → invite → quote → compare → select → confirm → book flow. |
| AC-008-007 | Emergency uses no quote competition and only one race-safe eligible acceptance can win. |
| AC-008-008 | Exactly the ten locked launch categories are offered; no invented launch category appears. |

### 34.3 Eligibility and geography

| ID | Criterion |
| --- | --- |
| AC-008-009 | A service or category mismatch excludes the worker. |
| AC-008-010 | A worker outside the worker’s radius or marketplace maximum is never invited. |
| AC-008-011 | Distance is evaluated immediately after service compatibility and uses trusted location data. |
| AC-008-012 | Unavailable, inactive, unverified, suspended, blocked, payment-incompatible, cash-restricted, or credential-ineligible workers receive no applicable offer. |
| AC-008-013 | Emergency workers require category eligibility and explicit emergency opt-in. |
| AC-008-014 | Ranking and fairness cannot override any failed hard filter. |
| AC-008-015 | Preselection worker views do not expose the exact customer address. |

### 34.4 Availability and capacity

| ID | Criterion |
| --- | --- |
| AC-008-016 | The worker-facing control presents only Available and Unavailable. |
| AC-008-017 | Unavailable workers receive zero new marketplace offers. |
| AC-008-018 | Capacity uses estimated duration, travel, buffer, overlap, and rolling 24-hour workload rather than booking count alone. |
| AC-008-019 | Less-loaded otherwise-similar workers receive only a modest, bounded advantage. |
| AC-008-020 | A confirmed scheduled request reserves inferred capacity and prevents prohibited conflicts. |

### 34.5 Pricing and behavioral intelligence

| ID | Criterion |
| --- | --- |
| AC-008-021 | Pricing profiles use only completed, approved work and calculate median and percentile statistics. |
| AC-008-022 | Higher-priced workers remain eligible and can rank well when other value signals support them. |
| AC-008-023 | A worker without enough history uses a neutral local benchmark and receives no cold-start price penalty. |
| AC-008-024 | Public experiences expose no worker price tier, customer preference label, or internal behavioral score. |
| AC-008-025 | Cancellation and no-show intelligence uses rates, actor, timing, context, volume, and trend rather than one raw count. |

### 34.6 Ranking and fairness

| ID | Criterion |
| --- | --- |
| AC-008-026 | Ranking uses a versioned server-controlled policy and produces deterministic ordering for identical inputs. |
| AC-008-027 | No customer or worker response exposes exact scores, components, weights, exclusion internals, or the candidate pool. |
| AC-008-028 | Fairness reduces long-term invitation and win concentration in replay tests without admitting an ineligible worker. |
| AC-008-029 | New verified workers receive a bounded opportunity boost and are not permanently disadvantaged. |
| AC-008-030 | Fairness adjustments decay or recover and cannot overwhelm a quality or safety floor. |
| AC-008-031 | Repeated ignored invitations may reduce future opportunities, while customer-caused cancellations are not automatically attributed to the worker. |

### 34.7 Waves and quotes

| ID | Criterion |
| --- | --- |
| AC-008-032 | The first invitation wave is controlled and no request broadcasts to all eligible workers. |
| AC-008-033 | Additional waves are idempotent, expand only within allowed radii, and stop after the configured quote target. |
| AC-008-034 | Already invited workers may continue quoting after the target is reached until the request expires or they become ineligible. |
| AC-008-035 | One worker cannot create more than one active initial quote for a request. |
| AC-008-036 | A worker sees only that worker’s invitation and quote, never a competitor or competitor price. |
| AC-008-037 | A quote contains every applicable price, timing, duration, labor, materials, warranty, message, and payment-method field. |
| AC-008-038 | The default 10-minute request expiry, quote-validity conditions, and two-minute initial collection window are enforced authoritatively when the app is closed. |

### 34.8 Comparison, selection, and lifecycle

| ID | Criterion |
| --- | --- |
| AC-008-039 | Best Value is the default ordering and updates live as valid quotes arrive or change state. |
| AC-008-040 | Lowest Price, Highest Rated, Closest, Fastest Arrival, and supported Most Experienced sorts produce correct deterministic order. |
| AC-008-041 | A customer can intentionally select a higher-priced quote without a forced cheapest-worker override. |
| AC-008-042 | Selection is blocked during the active fairness window. |
| AC-008-043 | Concurrent selection attempts produce at most one selected quote. |
| AC-008-044 | Only the selected worker can confirm, and confirmation creates at most one booking. |
| AC-008-045 | Confirmation timeout restores the allowed recovery path without allowing a late confirmation to win. |
| AC-008-046 | A late quote cannot replace a selected or confirmed worker. |
| AC-008-047 | Closing or backgrounding the app does not stop matching, waves, expiry, or confirmation timers. |
| AC-008-048 | Reopening or reconnecting reloads authoritative request state without duplicated events. |
| AC-008-049 | Request expiry clearly offers Retry, allowed expansion, Schedule for later, and Browse Workers. |
| AC-008-050 | Preselection customer cancellation closes invitations and carries no cancellation penalty. |

### 34.9 Editing and scheduling

| ID | Criterion |
| --- | --- |
| AC-008-051 | The edit window ends at five minutes or worker selection, whichever occurs first. |
| AC-008-052 | A minor edit preserves the request and notifies invitees, who can keep, update, or withdraw their quote. |
| AC-008-053 | A major edit closes the original, invalidates its quotes, preserves history, and creates one linked replacement. |
| AC-008-054 | ASAP, Today, Scheduled, and Flexible requests validate and display their intended timing correctly. |
| AC-008-055 | Scheduled requests begin matching immediately and reserve time only after selection and confirmation. |
| AC-008-056 | Flexible windows participate in matching without being silently converted to an exact time. |

### 34.10 Emergency, cancellation, and rescue

| ID | Criterion |
| --- | --- |
| AC-008-057 | Emergency ordering prioritizes ETA after all hard filters. |
| AC-008-058 | Simultaneous emergency acceptances award exactly one eligible worker and close all other invitations. |
| AC-008-059 | The emergency surcharge is derived through WPS-007, shown and explicitly approved before Emergency request creation, and is never hidden or retroactive. |
| AC-008-060 | Post-agreement cancellations require a reason and record actor, phase, timing, en-route/arrival state, context, and outcome. |
| AC-008-061 | No crude cancellation-count rule or isolated event triggers automatic punishment. |
| AC-008-062 | Rescue Mode preserves request data and attachments, excludes the cancelling worker, reruns eligibility, and creates no duplicate booking. |
| AC-008-063 | Emergency cancellation starts immediate replacement search. |

### 34.11 No-shows, late arrival, warranty, and reputation

| ID | Criterion |
| --- | --- |
| AC-008-064 | Arrival stores a timestamp and only the minimum approximate-location evidence needed for verification. |
| AC-008-065 | Customer and worker no-show reporting is role- and timing-authorized and records evidence. |
| AC-008-066 | No launch no-show report creates an automatic financial penalty. |
| AC-008-067 | Running Late sends a delay estimate and optional reason to the correct customer. |
| AC-008-068 | A comeback request links to the original completed booking and gives the original worker first response opportunity. |
| AC-008-069 | A comeback does not automatically refund, and a different issue produces a new booking. |
| AC-008-070 | Only completed eligible undisputed or resolved bookings can be reviewed, and ranking accounts for review volume. |

### 34.12 Preferences, notifications, analytics, and abuse

| ID | Criterion |
| --- | --- |
| AC-008-071 | Customer price-preference personalization remains neutral and unlabeled until its deferred decision is approved. |
| AC-008-072 | Every required customer and worker notification event is deduplicated and routes to the intended record. |
| AC-008-073 | Notifications and live payloads contain no internal scores, candidate pools, competitor data, or customer trust data. |
| AC-008-074 | English, natural Egyptian Arabic, and RTL layouts correctly display request, quote, timing, money, and notification content. |
| AC-008-075 | Analytics calculate the listed funnel, price, fairness, cancellation, rescue, geography, emergency, and capacity metrics without public exposure of private intelligence. |
| AC-008-076 | Abuse controls throttle duplicates and suspicious patterns while never automatically suspending a person from one signal. |

### 34.13 Mode isolation and testing

| ID | Criterion |
| --- | --- |
| AC-008-077 | Mock mode makes no Supabase call and Supabase mode never falls back to mock data. |
| AC-008-078 | Requests, invitations, quotes, waves, selection, confirmation, expiry, editing, scheduling, capacity, fairness, Rescue Mode, Emergency, notifications, live-like events, and account isolation have Mock-mode parity. |
| AC-008-079 | Automated unit, integration, end-to-end, smoke, failure, security, and race tests exist for applicable criteria. |
| AC-008-080 | Manual tests cover user comprehension, background/return behavior, localization, RTL, accessibility, and operational failure states without claiming unperformed results. |

## 35. Changelog

- 2026-07-31 — Version 1.2. Locked request/quote expiry, five-useful-quote target, preselection revisions, two-minute collection, conservative editing, Emergency surcharge approval, Normal Rescue Mode, 15-minute worker no-show timing, fail-closed category warranties, MVP cancellation consequences, and Request-a-Quote Browse Workers behavior.
- 2026-07-31 — Version 1.1. Locked routing-provider travel time, deterministic distance fallback, configurable category duration defaults, a fixed 30-minute post-completion buffer, fail-safe missing-location behavior, and overlap exclusion.
- 2026-07-31 — Version 1.0. Initial **LOCKED FOR IMPLEMENTATION** product specification.
## WPS-012 operational integration

WPS-012 begins only after worker confirmation and does not change request, invitation, quote, Emergency, Rescue, cancellation, or no-show authority. An approved quote warranty is a minimum completion commitment that WPS-012 cannot shorten. Same-booking return visits do not create marketplace requests or duplicate bookings; any replacement-worker comeback remains the distinct fail-closed WPS-008 path.
