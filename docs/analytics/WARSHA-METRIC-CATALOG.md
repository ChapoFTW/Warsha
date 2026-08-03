# Warsha Metric Catalog

Authority: Warsha Constitution → WPS-017 → WES-017.
Executable mirror: `src/admin/metric-catalog.ts`.

## The rule

**Dashboard code may not define a business metric.** Every number the admin
platform renders must appear here with its business question, sources,
numerator, denominator, inclusion and exclusion criteria, time basis, update
frequency, privacy classification, and known limitations.

`scripts/wps017-operations-admin.test.mts` fails if a rendered metric is missing
from this catalog, and fails if this document does not name every catalogued key.
The two cannot drift apart silently.

## Reading these definitions

**Time.** Authoritative timestamps are stored in UTC. Reporting periods are
bucketed by the **Africa/Cairo** display day, because a Warsha operating day is
an Egyptian day. Every analytics response states its timezone and time basis, and
flags a period that includes today as **partial**.

Time basis values:

| Value | Meaning |
| --- | --- |
| `record_creation` | The record's own creation timestamp |
| `submission_time` | When a person submitted it, not when it was created |
| `request_time` | When it was requested |
| `event_time` | When the external or system event occurred |
| `current_state` | A balance or backlog read now, ignoring the period |

A `current_state` metric sitting next to a period metric is not a rate. Do not
divide one by the other.

**Privacy.**

| Classification | Meaning |
| --- | --- |
| `aggregate` | Counts with no cohort small enough to identify a person |
| `aggregate_suppressed` | Aggregates over people; cells below the configured minimum return `null` and render as "hidden", never as zero |
| `financial_restricted` | Money; requires the ledger capability in addition to analytics |
| `operational_state` | Configuration or platform state; no personal data |

**Suppression is not zero.** A suppressed cell means a handful of real people are
being protected. Reading it as zero is a factual error.

**What is never here.** No personal data, no addresses, no contact details, no
per-individual fraud signals, no per-staff productivity metric, and no public
vanity metric presented without context. Warsha does not build surveillance.

## Executive dashboard

### `requestsCreated` — Requests created

| Field | Value |
| --- | --- |
| Business question | How much demand entered the marketplace in the period? |
| Source tables / functions | `public.marketplace_requests` |
| Numerator | Count of marketplace requests created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Every request row regardless of flow kind or outcome. |
| Exclusion criteria | Nothing is excluded; drafts are counted because they represent attempted demand. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Includes abandoned drafts, so it overstates completed intent. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `bookingsCreated` — Bookings created

| Field | Value |
| --- | --- |
| Business question | How many agreements were formed in the period? |
| Source tables / functions | `public.bookings` |
| Numerator | Count of bookings created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All bookings including direct bookings and marketplace conversions. |
| Exclusion criteria | Soft-deleted bookings are still counted; deletion does not undo history. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Creation is not confirmation. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `bookingsCompleted` — Bookings completed

| Field | Value |
| --- | --- |
| Business question | How much work actually finished? |
| Source tables / functions | `public.bookings` |
| Numerator | Bookings created in the period whose current status is completed. |
| Denominator | Bookings created in the period. |
| Inclusion criteria | Status is evaluated now, not at period end. |
| Exclusion criteria | Cancelled, rejected, and refunded bookings. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A cohort measured on creation date under-reports recent periods because work is still in flight. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `publishedWorkers` — Publicly discoverable workers

| Field | Value |
| --- | --- |
| Business question | How much supply is visible to customers right now? |
| Source tables / functions | `public.provider_profiles` |
| Numerator | Workers with is_published true and no deletion timestamp. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state only. |
| Exclusion criteria | Deleted profiles. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Published is not the same as eligible; WPS-008 eligibility applies additional hard gates. |

### `openDisputes` — Open disputes

| Field | Value |
| --- | --- |
| Business question | How much unresolved conflict is on the platform now? |
| Source tables / functions | `public.disputes` |
| Numerator | Disputes in submitted, waiting, or under-review states. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state only, ignoring the reporting period. |
| Exclusion criteria | Resolved, closed, rejected, and cancelled disputes. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A point-in-time backlog, not a rate. |

### `openReports` — Open abuse reports

| Field | Value |
| --- | --- |
| Business question | How much trust work is waiting? |
| Source tables / functions | `public.trust_reports` |
| Numerator | Reports in submitted, triage, or investigating status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state only. |
| Exclusion criteria | Actioned, dismissed, and duplicate reports. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Reporter identity is never exposed here or anywhere in analytics. |

### `activeIncidents` — Active incidents

| Field | Value |
| --- | --- |
| Business question | Is anything broken right now? |
| Source tables / functions | `public.operational_incidents` |
| Numerator | Incidents in open, mitigating, or monitoring status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state only. |
| Exclusion criteria | Resolved and closed incidents. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `operational_state` |
| Known limitations | Incidents are created by a human. There is no automated detection. |

### `onlinePaymentsEnabled` — Online payments enabled

| Field | Value |
| --- | --- |
| Business question | Is the payment gateway surface live? |
| Source tables / functions | `private.payment_configuration` |
| Numerator | Gateway mode is not disabled. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current configuration only. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `operational_state` |
| Known limitations | Mock mode reports as enabled; the payment dashboard distinguishes the environment. |

### `marketplaceEnabled` — Marketplace enabled

| Field | Value |
| --- | --- |
| Business question | Is marketplace matching active? |
| Source tables / functions | `private.marketplace_configuration` |
| Numerator | Marketplace configuration enabled flag. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current configuration only. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `operational_state` |
| Known limitations | WPS-008 remains the authority; this reads its flag and never writes it. |

## Marketplace dashboard

### `requestsCreated` — Requests created

| Field | Value |
| --- | --- |
| Business question | How much demand entered the marketplace in the period? |
| Source tables / functions | `public.marketplace_requests` |
| Numerator | Count of marketplace requests created in the period. |
| Denominator | Used as the denominator for every other marketplace rate on this dashboard. |
| Inclusion criteria | Every request row regardless of flow kind or outcome. |
| Exclusion criteria | Nothing is excluded; drafts are counted because they represent attempted demand. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | The denominator for this whole dashboard, so read every rate against it. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `requestsWithQuotes` — Requests receiving quotes

| Field | Value |
| --- | --- |
| Business question | How often does a customer get a real choice? |
| Source tables / functions | `public.marketplace_requests`, `public.worker_quotes` |
| Numerator | Requests created in the period with at least one quote. |
| Denominator | Requests created in the period. |
| Inclusion criteria | Any quote, including later withdrawn or expired ones. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A quote is not a useful quote; use the median quote count alongside it. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `requestsExpired` — Requests expired

| Field | Value |
| --- | --- |
| Business question | How often does demand time out unserved? |
| Source tables / functions | `public.marketplace_requests` |
| Numerator | Requests created in the period whose current status is expired. |
| Denominator | Requests created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | Cancelled requests are counted separately. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Recent periods under-report because requests are still open. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `requestsCancelled` — Requests cancelled

| Field | Value |
| --- | --- |
| Business question | How often does a customer withdraw demand? |
| Source tables / functions | `public.marketplace_requests` |
| Numerator | Requests created in the period with current status cancelled. |
| Denominator | Requests created in the period. |
| Inclusion criteria | Customer and system cancellations alike. |
| Exclusion criteria | Expired requests. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Cancellation reason is not modelled here. |

### `requestsConverted` — Requests converted to bookings

| Field | Value |
| --- | --- |
| Business question | How much demand becomes an agreement? |
| Source tables / functions | `public.marketplace_requests` |
| Numerator | Requests created in the period now in converted_to_booking status. |
| Denominator | Requests created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Conversion lags creation, so the newest days always look worse. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `noProviderOutcomes` — No-provider outcomes

| Field | Value |
| --- | --- |
| Business question | How often does matching find nobody to invite? |
| Source tables / functions | `public.marketplace_requests`, `public.quote_invitations` |
| Numerator | Requests created in the period with zero invitations. |
| Denominator | Requests created in the period. |
| Inclusion criteria | All flow kinds. |
| Exclusion criteria | Requests that were invited but received no quote — that is a different failure. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Counts a coverage gap, not a ranking failure. |

### `emergencyRequests` — Emergency requests

| Field | Value |
| --- | --- |
| Business question | How often is the Emergency flow used? |
| Source tables / functions | `public.marketplace_requests` |
| Numerator | Requests created in the period with flow kind emergency. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All emergency requests. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Misuse detection is a WPS-016 concern and is not inferred here. |

### `rescueRequests` — Rescue Mode requests

| Field | Value |
| --- | --- |
| Business question | How often does a booking need rescuing? |
| Source tables / functions | `public.marketplace_requests` |
| Numerator | Requests created in the period with flow kind rescue. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All rescue requests. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A rescue can itself be rescued; the chain is not collapsed. |

### `medianQuotesPerRequest` — Median quotes per request

| Field | Value |
| --- | --- |
| Business question | Does a typical customer get enough choice? |
| Source tables / functions | `public.marketplace_requests`, `public.worker_quotes` |
| Numerator | Median of the per-request quote count. |
| Denominator | Requests created in the period. |
| Inclusion criteria | Requests with zero quotes are included as zero. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Median hides the tail; pair with the no-provider rate. |

### `medianSecondsToFirstQuote` — Median time to first quote

| Field | Value |
| --- | --- |
| Business question | How fast does a customer see a first price? |
| Source tables / functions | `public.marketplace_requests`, `public.worker_quotes` |
| Numerator | Median seconds between request creation and the earliest quote submission. |
| Denominator | Requests created in the period that received at least one quote. |
| Inclusion criteria | Only requests with a quote. |
| Exclusion criteria | Requests with no quote are excluded rather than counted as infinite. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Survivorship bias: slow requests that never received a quote are absent. |

## Bookings dashboard

### `bookingsCreated` — Bookings created

| Field | Value |
| --- | --- |
| Business question | How many agreements were formed in the period? |
| Source tables / functions | `public.bookings` |
| Numerator | Count of bookings created in the period. |
| Denominator | Used as the denominator for every other booking rate on this dashboard. |
| Inclusion criteria | All bookings including direct bookings and marketplace conversions. |
| Exclusion criteria | Soft-deleted bookings are still counted; deletion does not undo history. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | The denominator for this whole dashboard. Creation is not confirmation. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `confirmed` — Confirmed bookings

| Field | Value |
| --- | --- |
| Business question | How many bookings moved past the draft or refused stage? |
| Source tables / functions | `public.bookings` |
| Numerator | Bookings created in the period not in draft, cancelled, or rejected status. |
| Denominator | Bookings created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | Draft, cancelled, rejected. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Confirmation is inferred from the current status, not from a confirmation event. |

### `completed` — Completed bookings

| Field | Value |
| --- | --- |
| Business question | How much work finished? |
| Source tables / functions | `public.bookings` |
| Numerator | Bookings created in the period with completed status. |
| Denominator | Bookings created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | Everything else. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Lags creation. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `cancelled` — Cancelled bookings

| Field | Value |
| --- | --- |
| Business question | How often does an agreement fall through? |
| Source tables / functions | `public.bookings` |
| Numerator | Bookings created in the period with cancelled status. |
| Denominator | Bookings created in the period. |
| Inclusion criteria | Customer, worker, and system cancellations alike. |
| Exclusion criteria | No-shows, which are counted separately. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Blame is not attributed here; WPS-008 holds cancellation events with actor detail. |

### `noShow` — No-show bookings

| Field | Value |
| --- | --- |
| Business question | How often does someone not turn up? |
| Source tables / functions | `public.bookings` |
| Numerator | Bookings created in the period with no_show status. |
| Denominator | Bookings created in the period. |
| Inclusion criteria | Both customer and worker no-shows. |
| Exclusion criteria | Cancellations before the appointment. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | The booking status does not say who failed to arrive. |

### `disputed` — Disputed bookings

| Field | Value |
| --- | --- |
| Business question | How often does a booking end in conflict? |
| Source tables / functions | `public.bookings` |
| Numerator | Bookings created in the period with disputed status. |
| Denominator | Bookings created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | Disputes that were withdrawn before submission. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A booking may leave disputed status after resolution, so this understates history. |

### `cancellationRate` — Cancellation rate

| Field | Value |
| --- | --- |
| Business question | What share of bookings is cancelled? |
| Source tables / functions | `public.bookings` |
| Numerator | Cancelled bookings created in the period. |
| Denominator | Bookings created in the period. |
| Inclusion criteria | As for the two component metrics. |
| Exclusion criteria | Returns null when the denominator is zero rather than reporting 0%. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A rate over a short window is noisy; read it with the absolute counts. |

### `returnVisits` — Return visits

| Field | Value |
| --- | --- |
| Business question | How often does a worker have to come back? |
| Source tables / functions | `public.booking_return_visits` |
| Numerator | Return visits requested in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All requested return visits including declined ones. |
| Exclusion criteria | None. |
| Time basis | `request_time` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A return visit can be a warranty comeback or an agreed second section; the two are not split here. |

### `additionalWorkRequests` — Additional-work requests

| Field | Value |
| --- | --- |
| Business question | How often does scope grow after work starts? |
| Source tables / functions | `public.booking_additional_work_requests` |
| Numerator | Additional-work requests created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Approved, rejected, and pending requests. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Frequency alone does not indicate abuse; WPS-007 holds approval outcomes. |

## Workers dashboard

### `totalWorkers` — Total workers

| Field | Value |
| --- | --- |
| Business question | How large is the worker base? |
| Source tables / functions | `public.provider_profiles` |
| Numerator | Worker profiles with no deletion timestamp. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Every non-deleted profile at any onboarding stage. |
| Exclusion criteria | Deleted profiles. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Includes profiles that never completed onboarding. |

### `verifiedWorkers` — Verified workers

| Field | Value |
| --- | --- |
| Business question | How much of the base passed identity verification? |
| Source tables / functions | `public.provider_profiles` |
| Numerator | Worker profiles with is_verified true. |
| Denominator | Worker profiles with no deletion timestamp. |
| Inclusion criteria | Current state. |
| Exclusion criteria | Deleted profiles. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Verification can expire; the flag reflects the last decision, not the expiry. |

### `publishedWorkers` — Published workers

| Field | Value |
| --- | --- |
| Business question | How many worker profiles are publicly visible? |
| Source tables / functions | `public.provider_profiles` |
| Numerator | Worker profiles with is_published true. |
| Denominator | Worker profiles with no deletion timestamp. |
| Inclusion criteria | Current state. |
| Exclusion criteria | Deleted profiles. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Published is a profile flag; WPS-008 discoverability applies further hard gates. |

### `availableWorkers` — Available workers

| Field | Value |
| --- | --- |
| Business question | How much supply is switched on right now? |
| Source tables / functions | `public.provider_profiles` |
| Numerator | Worker profiles with is_available true. |
| Denominator | Worker profiles with no deletion timestamp. |
| Inclusion criteria | Current state. |
| Exclusion criteria | Deleted profiles. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Availability is the single worker control; it says nothing about capacity. |

### `approvedOnboarding` — Approved onboarding

| Field | Value |
| --- | --- |
| Business question | How many workers completed onboarding? |
| Source tables / functions | `public.provider_profiles` |
| Numerator | Worker profiles with onboarding_status approved. |
| Denominator | Worker profiles with no deletion timestamp. |
| Inclusion criteria | Current state. |
| Exclusion criteria | Deleted profiles. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | The funnel stages before approval are not broken out here. |

### `averageRating` — Average worker rating

| Field | Value |
| --- | --- |
| Business question | What is the typical quality signal across reviewed workers? |
| Source tables / functions | `public.provider_profiles` |
| Numerator | Mean rating average across workers with at least one review. |
| Denominator | Workers with at least one review. |
| Inclusion criteria | Only reviewed workers. |
| Exclusion criteria | Unreviewed workers, which would otherwise drag the mean to zero. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | An unweighted mean of means; a worker with one review counts as much as one with fifty. |

### `categoryCoverage` — Category coverage

| Field | Value |
| --- | --- |
| Business question | How many service categories have visible supply? |
| Source tables / functions | `public.provider_profiles` |
| Numerator | Distinct primary categories among published, non-deleted workers. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Published workers only. |
| Exclusion criteria | Suppressed when the distinct count falls below the configured minimum cell. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate_suppressed` |
| Known limitations | Primary category only; secondary categories are not counted. |

## Customers dashboard

### `activeCustomers` — Active customers

| Field | Value |
| --- | --- |
| Business question | How many distinct customers booked in the period? |
| Source tables / functions | `public.bookings` |
| Numerator | Distinct customer ids on bookings created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All booking statuses. |
| Exclusion criteria | Suppressed below the configured minimum cell so a tiny cohort cannot identify a person. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate_suppressed` |
| Known limitations | A suppressed value renders as hidden, never as zero. |

### `requestingCustomers` — Requesting customers

| Field | Value |
| --- | --- |
| Business question | How many distinct customers asked for quotes? |
| Source tables / functions | `public.marketplace_requests` |
| Numerator | Distinct customer ids on requests created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All flow kinds. |
| Exclusion criteria | Suppressed below the minimum cell. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate_suppressed` |
| Known limitations | Overlaps with active customers; the two are not mutually exclusive. |

### `repeatCustomers` — Repeat customers

| Field | Value |
| --- | --- |
| Business question | How many customers booked more than once in the period? |
| Source tables / functions | `public.bookings` |
| Numerator | Customers with more than one booking created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All booking statuses. |
| Exclusion criteria | Suppressed below the minimum cell. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate_suppressed` |
| Known limitations | Window-bounded: a customer who returns after the window is not counted. |

### `cashSelections` — Cash selections

| Field | Value |
| --- | --- |
| Business question | How often is cash chosen? |
| Source tables / functions | `public.financial_booking_payments` |
| Numerator | Payment records created in the period with method cash. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All payment statuses. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Reflects the selected method, not a settled payment. |

### `onlineSelections` — Online selections

| Field | Value |
| --- | --- |
| Business question | How often is an online method chosen? |
| Source tables / functions | `public.financial_booking_payments` |
| Numerator | Payment records created in the period with method online. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All payment statuses. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Online payments remain disabled outside mock mode, so this is near zero by design. |

## Financial dashboard

### `grossBookingValueMinor` — Gross booking value

| Field | Value |
| --- | --- |
| Business question | How much value passed through the platform? |
| Source tables / functions | `public.provider_earnings_ledger` |
| Numerator | Sum of gross minor units on earnings rows created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All earning statuses. |
| Exclusion criteria | Nothing; reversals appear as their own rows. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | Derived from the WPS-007 ledger projection, never recomputed here. |

### `commissionMinor` — Warsha commission

| Field | Value |
| --- | --- |
| Business question | What did Warsha earn? |
| Source tables / functions | `public.provider_earnings_ledger` |
| Numerator | Sum of commission minor units on earnings rows created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All earning statuses. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | Commission recorded at posting time; later reversals are separate rows. |

### `pendingEarningsMinor` — Pending earnings

| Field | Value |
| --- | --- |
| Business question | How much worker money is not yet releasable? |
| Source tables / functions | `public.provider_earnings_ledger` |
| Numerator | Sum of net minor units in pending_job_completion or pending_release status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state, ignoring the reporting period. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | A balance, not a flow. Do not add it to period totals. |

### `availableEarningsMinor` — Available earnings

| Field | Value |
| --- | --- |
| Business question | How much worker money can be withdrawn now? |
| Source tables / functions | `public.provider_earnings_ledger` |
| Numerator | Sum of net minor units in available status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | A balance, not a flow. |

### `paidEarningsMinor` — Paid earnings

| Field | Value |
| --- | --- |
| Business question | How much has actually left the platform to workers? |
| Source tables / functions | `public.provider_earnings_ledger` |
| Numerator | Sum of net minor units in paid_out status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | Payouts are disabled, so this stays zero until a payout provider is authorized. |

### `withdrawalsRequested` — Withdrawals requested

| Field | Value |
| --- | --- |
| Business question | How much withdrawal demand is there? |
| Source tables / functions | `public.provider_withdrawal_requests` |
| Numerator | Withdrawal requests created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All statuses. |
| Exclusion criteria | None. |
| Time basis | `request_time` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | Counts requests, not amounts. |

### `refunds` — Refunds

| Field | Value |
| --- | --- |
| Business question | How often is money returned? |
| Source tables / functions | `public.financial_refunds` |
| Numerator | Refund records created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All statuses. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | Counts refund records, not net refunded value. |

### `refundsFailed` — Failed refunds

| Field | Value |
| --- | --- |
| Business question | How much refund work is stuck? |
| Source tables / functions | `public.financial_refunds` |
| Numerator | Refund records created in the period with failed status. |
| Denominator | Refund records created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | A failed refund is an operational queue, not an accounting balance. |

### `chargebacks` — Chargebacks

| Field | Value |
| --- | --- |
| Business question | How much provider-side dispute pressure is there? |
| Source tables / functions | `private.payment_chargebacks` |
| Numerator | Chargebacks opened in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All statuses. |
| Exclusion criteria | None. |
| Time basis | `event_time` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | A chargeback is a payment-provider dispute, never a WPS-013 service dispute. |

### `reconciliationExceptions` — Reconciliation exceptions

| Field | Value |
| --- | --- |
| Business question | How much money does not reconcile? |
| Source tables / functions | `private.reconciliation_exceptions` |
| Numerator | Exceptions created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All severities and statuses. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | Reconciliation only runs when a provider is configured; this is zero while disabled. |

### `openCashCommissionDebtRecords` — Cash commission debt records

| Field | Value |
| --- | --- |
| Business question | How much cash commission was recorded in the period? |
| Source tables / functions | `public.provider_cash_commission_records` |
| Numerator | Cash commission records created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All records. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `financial_restricted` |
| Known limitations | A record count, not an outstanding balance. |

## Trust dashboard

### `reportsSubmitted` — Reports submitted

| Field | Value |
| --- | --- |
| Business question | How much abuse is being reported? |
| Source tables / functions | `public.trust_reports` |
| Numerator | Reports created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All categories and surfaces. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Reporter identity is never exposed. Report volume reflects reporting culture as much as abuse. |

### `reportsActioned` — Reports actioned

| Field | Value |
| --- | --- |
| Business question | How often does a report lead to action? |
| Source tables / functions | `public.trust_reports` |
| Numerator | Reports created in the period with actioned status. |
| Denominator | Reports created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Lags creation; recent periods look lower. |

### `reportsDismissed` — Reports dismissed

| Field | Value |
| --- | --- |
| Business question | How often is a report closed with no action? |
| Source tables / functions | `public.trust_reports` |
| Numerator | Reports created in the period with dismissed status. |
| Denominator | Reports created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | Duplicates, counted separately by WPS-016. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Dismissal is not proof the report was false. |

### `enforcementActions` — Enforcement actions

| Field | Value |
| --- | --- |
| Business question | How much enforcement is happening? |
| Source tables / functions | `public.trust_enforcement_actions` |
| Numerator | Enforcement actions created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All eleven measures plus restoration. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Includes non-punitive investigations and restorations. |

### `permanentBans` — Permanent bans

| Field | Value |
| --- | --- |
| Business question | How often is the terminal measure used? |
| Source tables / functions | `public.trust_enforcement_actions` |
| Numerator | Permanent bans created in the period. |
| Denominator | Enforcement actions created in the period. |
| Inclusion criteria | All permanent bans. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | WPS-016 forbids automatic bans; every one of these had a human actor and an investigated report. |

### `appealsSubmitted` — Appeals submitted

| Field | Value |
| --- | --- |
| Business question | How often do people contest enforcement? |
| Source tables / functions | `public.trust_appeals` |
| Numerator | Appeals created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All appeal statuses. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Appeal content is private to the appellant and staff and never appears in analytics. |

### `appealsOverturned` — Appeals overturned

| Field | Value |
| --- | --- |
| Business question | How often was an enforcement decision wrong? |
| Source tables / functions | `public.trust_appeals` |
| Numerator | Appeals created in the period with overturned or partially overturned status. |
| Denominator | Appeals created in the period. |
| Inclusion criteria | Full and partial overturns. |
| Exclusion criteria | Withdrawn appeals. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | The single most important quality signal for the trust team; read it as a rate, not a count. |

### `disputesOpened` — Disputes opened

| Field | Value |
| --- | --- |
| Business question | How much service conflict entered the system? |
| Source tables / functions | `public.disputes` |
| Numerator | Disputes created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All reasons. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Includes drafts that were never submitted. |

### `disputesResolved` — Disputes resolved

| Field | Value |
| --- | --- |
| Business question | How much conflict was closed out? |
| Source tables / functions | `public.disputes` |
| Numerator | Disputes created in the period now resolved or closed. |
| Denominator | Disputes created in the period. |
| Inclusion criteria | Current status. |
| Exclusion criteria | Rejected and cancelled disputes. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Lags creation. Bucketed by the Africa/Cairo reporting day; authoritative timestamps stay UTC. |

### `reviewReports` — Review reports

| Field | Value |
| --- | --- |
| Business question | How often is review content reported? |
| Source tables / functions | `public.review_reports` |
| Numerator | Review reports created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All four reasons. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | WPS-011 remains the review moderation authority; this only counts. |

### `reviewModerationActions` — Review moderation actions

| Field | Value |
| --- | --- |
| Business question | How much review content was acted on? |
| Source tables / functions | `public.review_moderation_events` |
| Numerator | Moderation events created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Hides and restores alike. |
| Exclusion criteria | None. |
| Time basis | `event_time` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Moderation is a soft hide; evidence is never destroyed. |

### `reviewsPublished` — Reviews published

| Field | Value |
| --- | --- |
| Business question | How much feedback is customers giving? |
| Source tables / functions | `public.reviews` |
| Numerator | Reviews created in the period that are not soft-hidden. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All ratings. |
| Exclusion criteria | Soft-hidden reviews. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A review held by a dispute is still counted as published if it is not hidden. |

## Verification dashboard

### `submitted` — Verifications submitted

| Field | Value |
| --- | --- |
| Business question | How much verification work arrived? |
| Source tables / functions | `public.provider_verifications` |
| Numerator | Verifications whose submission timestamp falls in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Only submitted records. |
| Exclusion criteria | Drafts and not-started records. |
| Time basis | `submission_time` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | One row per worker: a resubmission overwrites the submission timestamp. |

### `approved` — Verifications approved

| Field | Value |
| --- | --- |
| Business question | How many workers are currently approved? |
| Source tables / functions | `public.provider_verifications` |
| Numerator | Verifications currently in approved status. |
| Denominator | All verification records. |
| Inclusion criteria | Current state, not period-bounded. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A current-state count sitting next to period counts; do not compute a rate across the two. |

### `rejected` — Verifications rejected

| Field | Value |
| --- | --- |
| Business question | How many workers are currently rejected? |
| Source tables / functions | `public.provider_verifications` |
| Numerator | Verifications currently in rejected status. |
| Denominator | All verification records. |
| Inclusion criteria | Current state. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Rejection reasons are private to the worker and the reviewer. |

### `awaitingReview` — Awaiting review

| Field | Value |
| --- | --- |
| Business question | How big is the verification backlog? |
| Source tables / functions | `public.provider_verifications` |
| Numerator | Verifications in submitted or under_review status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Matches the identity verification queue exactly. |

### `requiresResubmission` — Correction requested

| Field | Value |
| --- | --- |
| Business question | How many workers were asked to fix something? |
| Source tables / functions | `public.provider_verifications` |
| Numerator | Verifications in requires_resubmission status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | A high value can indicate unclear guidance rather than poor submissions. |

### `expired` — Verifications expired

| Field | Value |
| --- | --- |
| Business question | How many verifications lapsed? |
| Source tables / functions | `public.provider_verifications` |
| Numerator | Verifications in expired status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Expiry is a WPS-006 concern; WPS-017 only reports it. |

### `certificatesSubmitted` — Certificates submitted

| Field | Value |
| --- | --- |
| Business question | How much certificate review work arrived? |
| Source tables / functions | `public.provider_certifications` |
| Numerator | Certificates whose submission timestamp falls in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | All certificate types. |
| Exclusion criteria | Drafts. |
| Time basis | `submission_time` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | The criminal-record certificate is not part of Warsha and never appears here. |

### `certificatesApproved` — Certificates approved

| Field | Value |
| --- | --- |
| Business question | How many certificates are currently approved? |
| Source tables / functions | `public.provider_certifications` |
| Numerator | Certificates in approved status with no deletion timestamp. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current state. |
| Exclusion criteria | Deleted certificates. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Approval does not imply the certificate is publicly shown. |

## Notifications dashboard

### `notificationsCreated` — Notifications created

| Field | Value |
| --- | --- |
| Business question | How much is Warsha telling people? |
| Source tables / functions | `public.notifications` |
| Numerator | Notifications created in the period. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Every audience including staff. |
| Exclusion criteria | Deduplicated and grouped events, which never become rows. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Grouping means one row can represent several events. |

### `unread` — Unread notifications

| Field | Value |
| --- | --- |
| Business question | Is the inbox being read? |
| Source tables / functions | `public.notifications` |
| Numerator | Notifications created in the period with no read timestamp. |
| Denominator | Notifications created in the period. |
| Inclusion criteria | All audiences. |
| Exclusion criteria | None. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Recent periods always look unread; read it as a trend. |

### `requiredActionOpen` — Open required actions

| Field | Value |
| --- | --- |
| Business question | How much action is outstanding? |
| Source tables / functions | `public.notifications` |
| Numerator | Notifications requiring action with no resolution timestamp. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Period-bounded by creation. |
| Exclusion criteria | Resolved actions. |
| Time basis | `record_creation` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `aggregate` |
| Known limitations | Resolution is inferred from the underlying record, not from the user tapping. |

### `deliveryFailures` — Delivery failures

| Field | Value |
| --- | --- |
| Business question | Is external delivery working? |
| Source tables / functions | `private.notification_delivery_attempts` |
| Numerator | Delivery attempts in the period with failed status. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Push attempts only. |
| Exclusion criteria | None. |
| Time basis | `event_time` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `operational_state` |
| Known limitations | Push is disabled, so this is zero by design until a provider is authorized. |

### `pushDeliveryEnabled` — Push delivery enabled

| Field | Value |
| --- | --- |
| Business question | Is push turned on? |
| Source tables / functions | `private.notification_configuration` |
| Numerator | The WPS-014 push delivery flag. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current configuration. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `operational_state` |
| Known limitations | WPS-014 constrains this flag to false; WPS-017 reads it and never writes it. |

### `schedulerEnabled` — Reminder scheduler enabled

| Field | Value |
| --- | --- |
| Business question | Are reminders being processed? |
| Source tables / functions | `private.notification_configuration` |
| Numerator | The WPS-014 scheduler flag. |
| Denominator | None. This is a count, not a rate. |
| Inclusion criteria | Current configuration. |
| Exclusion criteria | None. |
| Time basis | `current_state` |
| Update frequency | On read. There is no materialized view and no refresh job. |
| Privacy classification | `operational_state` |
| Known limitations | Constrained to false by WPS-014. |


## Deferred metrics

These appear in WPS-017 as product intent but are **not** implemented, because
the underlying data is not yet modelled well enough to define them honestly:

| Metric | Why it is deferred |
| --- | --- |
| Provider invitation acceptance rate | Invitation outcome reasons need a stable taxonomy before a rate is meaningful |
| Worker response rate and repeat-customer rate | Requires a per-worker cohort definition that avoids identifying small cohorts |
| Fairness concentration and workload distribution | Needs a documented fairness measure agreed with WPS-008 before it is published |
| Time from confirmation to arrival, job duration | Depends on WPS-012 operational timestamps that are not yet uniformly populated |
| Profile completeness and onboarding funnel stages | The funnel stages are not yet distinct states in the schema |
| Geographic coverage by governorate | Would create small geographic cells; needs a suppression policy per region first |
| Warranty comeback rate | Return visits do not yet distinguish warranty from agreed second sections |
| Promotions and gateway-fee expense | Requires live provider settlement data, which does not exist while providers are disabled |

Adding one of these means adding its definition here first, then the query.
Never the other way round.
