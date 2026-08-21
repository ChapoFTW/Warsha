# Warsha business metric dictionary

Status: implemented by `202608220001_first_party_business_reporting.sql`.
Reporting timezone: `Africa/Cairo`. Authoritative timestamps remain UTC. Every
period uses an inclusive Cairo start date and inclusive Cairo end date, which
the server converts to a half-open UTC interval: `[start, end)`.

This layer extends the WPS-017 operational metric catalog. It does not replace
staff audit, debug logs, or domain history and does not create client telemetry.

## Shared rules

- `ACTIVE CUSTOMER` means an account that created a marketplace request or a
  booking during the period. It does not mean “opened the app,” because Warsha
  has no authoritative sign-in activity ledger.
- `ACTIVE WORKER` means a provider that submitted a quote or received a booking
  during the period. Availability alone is current state, not activity.
- Money is stored and exported in Egyptian-pound minor units. The admin UI is
  the only layer that formats those values as EGP.
- Registration is counted only after the corresponding durable Warsha profile
  row commits. A button press or failed Auth attempt is never a registration.
- Event metrics use immutable history or a canonical event timestamp. Current
  state metrics say so explicitly.
- Summary reports and CSV rows contain no names, email addresses, phone
  numbers, exact addresses, document contents, support text, or user IDs.

## Accounts and customers

| Metric key | Plain name | Definition | Authority and timestamp | Limitations |
| --- | --- | --- | --- | --- |
| `accountsCreated` | Accounts created | Warsha profiles committed during the period. | `public.profiles.created_at` | Excludes an Auth identity whose Warsha profile transaction never committed. |
| `customersRegistered` | Customers registered | Customer profiles committed during the period. | `public.customer_profiles.created_at` | A dual-role account is also counted as a worker. |
| `workersRegistered` | Workers registered | Provider profiles committed during the period. | `public.provider_profiles.created_at` | Registration does not mean approved or active. |
| `dualRoleAccounts` | Dual-role accounts | Accounts created in the period that currently have both customer and provider profiles. | `profiles.created_at`; current profile existence | Later role changes can change this historical cohort. |
| `emailConfirmed` | Email confirmations | Auth identities whose email confirmation timestamp falls in the period. | `auth.users.email_confirmed_at` | Worker synthetic email is not presented as a contact and this metric is not a worker-contact claim. |
| `accountsAnonymized` | Accounts anonymized | Governed deletion requests completed as anonymized in the period. | `account_deletion_requests.anonymized_at` | Counts completed anonymization, not deletion requests. |
| `accountsSuspendedOrBanned` | Suspensions and bans | Immutable enforcement actions of type suspension or permanent ban. | `trust_enforcement_actions.created_at` | Counts actions; one account can have more than one action. |
| `activeCustomers` | Active customers | Distinct customers creating a request or booking in the period. | Request/booking `created_at` | No sign-in-only activity is inferred. |
| `customersWithAddress` | New customers with an address | Customers registered in the period who currently retain at least one active address. | Customer `created_at`; current `addresses.deleted_at` | Later address deletion changes the cohort. |
| `firstRequestCustomers` | First-time requesting customers | Customers whose earliest marketplace request was created in the period. | Minimum `marketplace_requests.created_at` per customer | Direct bookings without a marketplace request are excluded. |
| `repeatCustomers` | Repeat requesting customers | Customers with at least two lifetime requests whose most recent request is in the period. | `marketplace_requests.created_at` | Measures request repeat, not completed-job repeat. |

## Workers and verification

| Metric key | Plain name | Definition | Authority and timestamp | Limitations |
| --- | --- | --- | --- | --- |
| `workerOnboardingStarted` | Worker onboarding started | Provider profiles created in the period. | `provider_profiles.created_at` | The durable provider profile is the earliest reconstructable onboarding fact. |
| `workerOnboardingCompleted` | Worker profile onboarding completed | Distinct workers transitioning to `identity_required`, meaning required profile, trade, area, and work location steps are complete. | `worker_onboarding_events.created_at` | Identity/vetting remains incomplete at this point. |
| `verificationSubmitted` | Verification submitted | Verification records submitted in the period. | `provider_verifications.submitted_at` | Resubmission revisions remain one provider verification record. |
| `workersApproved` | Workers approved | Distinct workers transitioning to approved. | `worker_onboarding_events.created_at`, `to_state=approved` | Approval and activation are separate events. |
| `workersRejected` | Workers rejected | Distinct workers transitioning to rejected. | `worker_onboarding_events.created_at`, `to_state=rejected` | No rejection reason or evidence is exposed. |
| `workersActivated` | Workers activated | Distinct workers transitioning to active. | `worker_onboarding_events.created_at`, `to_state=active` | Does not imply activity in the period. |
| `workersSuspended` | Workers suspended | Distinct workers transitioning to suspended. | `worker_onboarding_events.created_at`, `to_state=suspended` | Counts lifecycle transitions, not current suspension state. |
| `activeWorkers` | Active workers | Distinct providers submitting a quote or receiving a booking in the period. | Quote/booking `created_at` | Browsing opportunities without acting is not counted. |

## Marketplace, quotes, and funnel

| Metric key | Plain name | Definition | Authority and timestamp | Limitations |
| --- | --- | --- | --- | --- |
| `requestsCreated` | Requests created | Marketplace requests committed in the period after active category/governorate filters. | `marketplace_requests.created_at` | Includes drafts because they are durable attempted demand. |
| `requestsCancelled` | Requests cancelled | Requests whose cancellation occurred in the period. | `marketplace_requests.cancelled_at` | Event-period count, not a creation cohort. |
| `requestsWithQuotes` | Requests receiving a quote | Requests created in the period with at least one durable quote. | Request `created_at`; quote existence | Recent periods can mature after the report is viewed. |
| `quotesSubmitted` | Quotes submitted | Quotes submitted in the period. | `worker_quotes.submitted_at` | Revisions do not create a second quote. |
| `quotesAccepted` | Quotes accepted | Quotes selected in the period. | `worker_quotes.selected_at` | Selection and completed work are separate. |
| `quotesWithdrawn` | Quotes withdrawn | Quotes withdrawn in the period. | `worker_quotes.withdrawn_at` | An expired quote is not a withdrawal. |
| `averageQuotedAmountMinor` | Average quote amount | Arithmetic mean of quote price in minor EGP units. | `worker_quotes.price_minor` by submission period | Not revenue and not a final charge. |
| `medianQuotedAmountMinor` | Median quote amount | Median quote price in minor EGP units. | `worker_quotes.price_minor` by submission period | Not revenue and not a final charge. |
| `averageQuotesPerRequest` | Average quotes per request | Mean durable quote count for requests created in the period. | Requests plus quotes | Recent requests may still receive quotes. |
| `medianSecondsToFirstQuote` | Time to first quote | Median seconds from request creation to its first submitted quote. | Request `created_at`; minimum quote `submitted_at` | Requests with no quote are excluded. |

The funnel deliberately uses a request-creation cohort for its first two steps
and canonical event counts for accepted quotes and completed jobs. It is an
operational directional funnel, not user-level attribution. Its four displayed
steps are `requestsCreated → requestsWithQuotes → quotesAccepted → jobsCompleted`.

## Jobs and financials

| Metric key | Plain name | Definition | Authority and timestamp | Limitations |
| --- | --- | --- | --- | --- |
| `jobsCreated` | Jobs created | Bookings committed in the period. | `bookings.created_at` | Creation is not completion. |
| `jobsStarted` | Jobs started | Distinct bookings entering `job_started` or `work_in_progress`. | `booking_status_history.created_at` | A booking is counted once in the period. |
| `jobsCompleted` | Jobs completed | Distinct bookings entering completed. | `booking_status_history.created_at` | A completion retry cannot double-count the booking. |
| `jobsCancelled` | Jobs cancelled | Distinct bookings entering cancelled. | `booking_status_history.created_at` | Event-period count. |
| `jobsDisputed` | Jobs disputed | Distinct bookings entering disputed. | `booking_status_history.created_at` | Dispute contents are never exposed. |
| `grossJobValueMinor` | Gross job value | Sum of committed gross ledger amounts created in the period. | `provider_earnings_ledger.gross_minor`, `created_at` | This is authoritative ledger value, not external cash collection. |
| `workerEarningsMinor` | Worker earnings | Sum of committed net ledger amounts. | `provider_earnings_ledger.net_minor`, `created_at` | Includes ledger statuses; status breakdown remains in the financial console. |
| `platformFeesMinor` | Platform fees | Sum of committed commission ledger amounts. | `provider_earnings_ledger.commission_minor`, `created_at` | A fee record is not proof of external settlement. |
| `refundsMinor` | Successful refunds | Sum of successful governed refund amounts created in the period. | `financial_refunds.amount_minor`, `created_at`, `status=succeeded` | Failed/pending refunds are excluded. |

Warsha does not report “revenue” or payment-provider settlement because no
authoritative settled-revenue fact exists. The financial metrics above are
ledger facts and the UI says so.

## Support

| Metric key | Plain name | Definition | Authority and timestamp | Limitations |
| --- | --- | --- | --- | --- |
| `supportCasesOpened` | Support cases opened | Support tickets committed in the period. | `support_tickets.created_at` | No subject/message text is read into analytics. |
| `supportReplies` | Support messages | Support message rows created in the period. | `support_messages.created_at` | Includes participant and staff messages; it is not staff productivity. |
| `supportCasesResolved` | Support cases resolved | Cases whose resolved timestamp falls in the period. | `support_tickets.resolved_at` | Reopened cases can later leave resolved state. |
| `medianFirstResponseSeconds` | First response time | Median seconds from case creation to first staff response. | `first_response_at - created_at` | Cases without a response are excluded. |
| `medianResolutionSeconds` | Resolution time | Median seconds from case creation to resolution. | `resolved_at - created_at` | Unresolved cases are excluded. |

## Filters, presets, and exports

The server owns all presets: Today, Yesterday, Last 7/30 days, this/last week,
month, quarter and year, all time, and custom. Custom reads are limited to 367
inclusive days. “All time” starts at the earliest durable Warsha record and is
available only as a server-selected preset.

Category and governorate filters apply to marketplace facts and compatible job
facts. Verification status applies only to verification/worker facts. The RPC
returns its applied filters so the UI and CSV cannot silently disagree.

`business_daily` CSV export is aggregate-only and has stable snake_case
columns:

```text
date,accounts_created,customers_registered,workers_registered,requests_created,quotes_submitted,jobs_created,jobs_completed,support_cases_opened
```

Export requires `export_operational_report`, fresh reauthentication, a reason,
an idempotency key, an expiring authorization owned by the requesting staff
account, and immutable audit/access events. Detailed row-level exports are not
implemented: Warsha has no separately approved detailed-analytics capability,
and inventing one would widen privacy authority.
