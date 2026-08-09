# WPS-023 — Authentication, Role-Based Onboarding & Worker Vetting

```
WPS-023
Version: 1.0
Status: LOCKED FOR IMPLEMENTATION
Authority: Warsha Constitution
Depends on: WPS-001 through WPS-022
```

Supersedes nothing. It corrects how the application is entered, and it adds a
vetting requirement that did not previously exist.

> **This document makes no claim of legal compliance or legal approval.**
> Nothing here has been reviewed by an Egyptian lawyer. The criminal-record
> policy is a **draft for professional review** carrying
> `legal_review_status = 'pending'`; the offence categories named in §11 are
> illustrative examples for a lawyer to accept, reject or replace, and no code
> path treats them as approved. Warsha has **no Ministry integration, no
> government API access, and no way to confirm a certificate's authenticity**.
> The open questions are recorded in §18 and in
> [worker-criminal-record-model](../decisions/worker-criminal-record-model.md).

---

## 1. Why this exists

Warsha opened onto the customer home while signed out.

Not as a deliberate guest mode — there was no gate at all. `AuthProvider`
resolved a session and put it in context, and nothing branched on the result.
The tab bar rendered, discovery rendered, a provider profile rendered. The only
authentication surface in the entire product was the Profile tab, which showed
a sign-in form instead of a profile when `auth.user` was null. Everything else
behaved as though somebody were signed in, and was saved from the consequences
only by RLS refusing the reads underneath.

That is a survivable architecture and a bad one. It means the first thing a new
person sees is a product they cannot use, with no explanation of what Warsha is
or what an account would give them. It means every screen has to defend itself
individually. And it means the question "who is this?" is asked in twenty
places instead of one.

The second problem is larger. Warsha sends people into strangers' homes, and it
had no vetting. `activate_provider_role` required a verified phone number and a
display name between two and a hundred characters. That was the whole check. A
worker profile could be created, filled in, and — once staff approved it under
WPS-006 — published, without anybody having established that the person was who
they said they were, let alone whether it was safe to send them to a customer's
flat.

WPS-023 fixes both: authentication-first entry, and a server-authoritative
worker vetting lifecycle that no upload, no extraction and no client can move.

---

## 2. What WPS-023 does not do

It creates no second authentication system. Supabase email/password Auth stays
the credential authority. Customers provide their email; workers provide phone
and password while a trusted broker owns an opaque UUID-derived Auth email.
Supabase Phone Auth and SMS OTP are not used.

It creates no second provider identity. `public.provider_profiles` remains the
worker record and `private.provider_verification_identities` remains the
identity store — extended with confirmed fields, not replaced.

It creates no second verification workflow. `public.provider_verifications` and
`public.provider_verification_documents` remain the WPS-006 authority; WPS-023
adds capture metadata columns and a lifecycle that sits alongside them.

It creates no second customer-address system, no second document store, no
second trust system, no second staff-review model, no second notification
catalogue, no second audit trail, and no second Mock.

It does not change what "publicly discoverable" means. See §14 — this was the
single largest design decision in the implementation.

---

## 3. The account model

Stated once, so nothing has to infer it:

- Every authenticated account may use customer functionality. There is no
  customer-only account type and no way to lose customer capability.
- Worker capability is an **additional, server-approved role**.
- Choosing "Worker" at sign-up **starts an application**. It grants nothing.
- Worker approval never removes customer capability.
- Once a worker is active, the worker home is their default. "Book a service"
  remains available as a secondary customer-mode action.

`public.account_onboarding.intended_role` records what an account asked to
become. It is **not an authorization fact**, and nothing reads it as one:
worker privilege is decided by `private.worker_activation_gates`, which never
consults that column.

The role choice locks once a vetting decision exists. Switching away afterwards
would orphan a review somebody actually performed.

---

## 4. Authentication-first entry

```
Native splash
  → local appearance resolution        (WPS-020, unchanged)
  → session hydration                  (WPS-001, unchanged)
  → onboarding state fetch             (WPS-023)
  → authentication gateway if signed out
  → onboarding gate if incomplete
  → role-specific application home
```

`components/warsha/AuthGate.tsx` renders **nothing operational** until both the
session and the onboarding state are known. The loading state is a branded
canvas with the loading mark — deliberately not a tab bar, not a skeleton, not
a placeholder greeting. A loading screen that impersonates the signed-in app is
a loading screen that lies about whether you are signed in.

The obvious alternative — render the app and redirect once the session resolves
— is what Warsha did until now, and it is *why* the app opened onto the
customer home. A redirect that arrives one frame late has already shown
somebody a screen they should not have seen.

**Client-side routing is not an authorization boundary**, and nothing in
WPS-023 pretends otherwise. Every operation the gate steers around is
independently refused by RLS, a capability check, or
`private.require_active_worker()`.

---

## 5. The signed-out surface

Signed-out users cannot create bookings or marketplace requests, request or
submit quotes, favourite providers, reach private provider details, send
booking messages, upload attachments, submit reviews, open disputes, reach
payment or earnings state, reach worker opportunities or dashboards, or invoke
authenticated operational RPCs.

Public, non-operational surfaces are the gateway itself, three static local
screens (Help, Privacy, Terms), and account recovery. The static screens carry
no network call: serving three links on the gateway is not worth opening a new
anonymous data surface, which is the opposite of what WPS-023 is for.

### 5.1 The reachability defect this uncovered

The Phase 1 audit queried the **running database** rather than the migration
source, and found fifteen `public` functions executable by `anon`: nine WPS-022
privacy mutations and six WPS-022 staff functions, including
`staff_create_legal_hold`.

WPS-022 had written, for every one of them:

```sql
grant execute on function public.<fn> to authenticated;
revoke all on function public.<fn> from anon;
```

`anon` never held a direct grant. Postgres grants `EXECUTE` on every new
function to `PUBLIC` by default, and `anon` reached these functions through
that. `REVOKE ... FROM anon` removes a grant made *to* `anon`; it cannot remove
what `anon` inherits *from PUBLIC*. **All fifteen revokes were no-ops.**

The functions fail closed at runtime — each opens with an `auth.uid() is null`
check or a capability check — so this was never exploitable on its own. It is
still a real defect: the privilege surface did not match the intent, and `anon`
being one missing internal check away from `staff_create_legal_hold` is not a
margin worth keeping.

WPS-022's own suite asserted the **behaviour** (`throws_ok`) and so could not
see it. WPS-023 asserts the **privilege**, and bounds the whole surface: exactly
nine allowlisted sanitized reads are anon-executable, and nothing else, whatever
gets added later.

The nine deliberate WPS-020 / WPS-006 / WPS-011 anonymous reads are preserved
exactly. WPS-020's suite asserts that grant, and those RPCs return only what is
already publicly discoverable.

---

## 6. Customer registration and location

Customer registration requires a display name, email, password, phone, and — before any
operational booking — a **confirmed service address with a confirmed map pin**.
It does not require a National ID, a certificate, a biography, or any worker
configuration. Email and phone uniqueness stay server-authoritative, and error
text comes from WPS-001's `sanitizeAuthError`, which exists precisely so a
failed attempt cannot be used to discover whether an account exists.

**The locked location rule:** GPS permission is optional; a confirmed map pin is
mandatory; manual placement is always available.

These are compatible because manual placement is a **first-class path, not a
fallback**. `pin_confirmed_at` is a separate fact from having coordinates:
coordinates can arrive from a guess, a city centroid, or a stale device fix.
The column records that a human looked at the position and said yes.

No map or geocoding provider has been selected. `src/onboarding/location-provider.ts`
reports its own capabilities honestly, so the address screen says "not available
yet" with a reason rather than showing a search box that silently does nothing.
`expo-location` is deliberately **not** a dependency — adding it would put a
permission prompt in front of people for a capability the product cannot use,
and it could not be accepted without a device. See
[customer-location-onboarding](../decisions/customer-location-onboarding.md).

Privacy: exact coordinates stay private, never enter public discovery or
general analytics, and reach a worker only at the booking stage that requires
them. No background location, no continuous collection, no forced permission
loop. WPS-022 governs retention, export and deletion.

---

## 7. Worker registration

Worker-first registration requires full name, a unique contact phone, and a
password. It has no email field, email-confirmation step, phone OTP, or SMS.
After account creation, onboarding additionally requires legal full name,
current residential address, service area, services, specialties, profile photo,
biography, experience, availability, National ID front and back, confirmed
identity fields, an official criminal-record certificate with its issue date,
worker terms, and document-processing consent.

The trusted `worker-auth` Edge boundary generates a UUIDv4 credential identifier
and derives `worker.<uuid>@auth.warsha.invalid`. The address is used only inside
Supabase email/password Auth. `private.worker_auth_identities` maps the unique
contact phone to that credential and is executable only through service-role
RPCs; neither clients nor staff can read it. The broker returns session tokens,
never the address. Application contact-email projections return `null`, and
worker notification preferences disable email and SMS delivery.

This reuses WPS-010's worker profile architecture. There is no second provider
profile, and provider-profile IDs still come from the table UUID default.

**National ID registration governorate is never treated as current residence or
service area.** It records where somebody was registered, not where they live
or work, and treating it as an address would put a worker in the wrong service
area on the strength of a number.

---

## 8. The worker onboarding state machine

Fifteen server-authoritative states:

`account_created` · `onboarding_incomplete` · `identity_required` ·
`identity_submitted` · `identity_under_review` · `criminal_record_required` ·
`criminal_record_submitted` · `criminal_record_under_review` ·
`correction_required` · `manual_review` · `rejected` · `appeal_pending` ·
`approved` · `active` · `suspended`

`private.worker_transition()` is the **sole writer** of `worker_state`. No
client holds `EXECUTE` on it. It takes a row lock (two staff decisions arriving
together must serialize, or both read the same `from` state and both believe
they were valid), is idempotent (re-issuing the current state is a no-op, not a
duplicate history row), and appends an immutable event.

Transition rules, by actor:

- A **worker** may submit and resubmit, and may appeal a rejection. A worker
  can never reach a review, adverse, approval or activation state.
- **Staff** reach every decision state, each behind a named capability.
- The **system** may only record an account's own creation.

The certificate step is not reachable by a worker acting alone: they arrive at
`criminal_record_required` only because staff put them there after an identity
review. That is what keeps the two reviews in order.

History is append-only for everybody, including staff. `created_at` defaults to
`clock_timestamp()`, not `now()` — `now()` is the transaction start, so two
transitions recorded in one transaction would share a timestamp and their order
would fall back to a random uuid tiebreak. A history whose order depends on a
uuid is not a history.

---

## 9. National ID capture

Both sides required, in the private `verification-documents` bucket WPS-006
already owns, with capture metadata added: `capture_source`, `content_hash`,
`quality_flags`, `page_side`.

Capture uses `expo-image-picker`'s `launchCameraAsync`. It is already a
dependency, already used for portfolio and avatar capture, and needs no new
native module. A framing overlay drawn over a live preview would need
`expo-camera`, a new dev-client build, and a physical device to accept — none of
which WPS-023 can honestly claim. Framing guidance is therefore text and a
static frame. **Recorded as a limitation, not papered over.**

Quality warnings (blur, glare, low resolution, edges) are **advisory and never
block**. Warsha cannot reliably tell a blurry photo from a worn card, and
refusing an upload on a guess would strand somebody whose only ID is an old one.

Duplicate `content_hash` across accounts is **recorded for a reviewer, never
auto-actioned**. Shared devices, re-scans and family members produce legitimate
collisions, and an automatic block would reject honest workers.

Images are private, owner-bound, MIME- and size-validated, path-validated, and
reachable by staff only through a short-lived signed URL whose issuance is
audited. WPS-022 retention and legal holds apply.

---

## 10. The extraction boundary

Provider-neutral, and currently **unconfigured**. `extractionCapability.available`
is `false`, `privacyApproved` is `false`, and `sendsImageOffDevice` is `false`.

Rules that hold whether or not a provider is ever configured:

- Extraction is **assistive**. It fills a form; it never approves anybody.
- The worker reviews and confirms or corrects every candidate field.
- **Confidence scores are internal** and never cross a boundary.
- A candidate below the confidence floor is **withheld, not shown greyed out**
  — showing it invites acceptance, and a wrong pre-filled identity number that
  somebody taps past is worse than an empty field.
- Mock makes no external call. Neither does Supabase mode, because no provider
  is configured in either.
- No document image leaves Warsha without a configured, approved provider.

**Gender and sex markers are deliberately not extracted.** The Egyptian National
ID encodes one; there is no approved product or legal purpose for it, so the
field key does not exist and cannot be produced.

The full National ID number is **never stored**. WPS-006 established hash plus
last four, and WPS-023 keeps exactly that. Candidates returned to the worker are
masked to the last four digits: the owner already knows their own number, and a
full number on a screen is a full number in a screenshot, a crash report and a
support ticket.

---

## 11. Criminal-record certificate — Model A

**Locked product decision.** The worker obtains the official فيش وتشبيه
themselves and uploads it. Warsha does not retrieve it.

Warsha does not claim, and no schema column records, direct Ministry
integration, Ministry API access, automatic government lookup, privileged
government access, or automatic authenticity confirmation.

Flow: account → identity information → worker obtains certificate → worker
uploads → quality and metadata check → authorized staff review →
approved / rejected / correction required / manual review / appeal.

The certificate gets its **own private bucket** (`worker-criminal-records`), its
own table, and its own capability. It is the most sensitive document Warsha
holds and it does not belong in the same access envelope as a portfolio photo.
Access requires `review_criminal_records` — not `private.is_staff()`, because
the whole point of a dedicated capability is that ordinary staff access is not
enough. Every open is logged individually with the capability that permitted it.

`public.worker_criminal_record_submissions` has **no offence column at all**.
Offence-relevant text can exist only in `private.worker_criminal_record_review`,
which no RPC returns to any client. The worker sees a `safe_outcome_reason` and
nothing more. No notification, analytics event, Realtime message, log line or
privacy export carries offence information.

### 11.1 The eligibility policy

**The rule "any offence within the previous twelve months automatically rejects
the worker" is deliberately not implemented.** It cannot distinguish an
accusation from a final conviction, a mistaken identity from a real one, or an
offence relevant to entering someone's home from one that is not.

What exists instead is `private.worker_vetting_policies`: a versioned record
whose criteria are **data a human reads**, whose `legal_review_status` starts at
`pending`, and which cannot take effect until a named person marks it reviewed.
Every factor carries `weighting: 'reviewer_judgement'` — none is numeric, none
is automatic.

Factors for a lawyer to accept, reject or replace: offence category, severity,
relevance to entering customers' homes, conviction versus accusation, judgment
finality, recency, pending appeal, mistaken identity, document authenticity,
rehabilitation or legal correction, repeat pattern, staff evidence.

Categories a lawyer-approved policy *might* treat as serious — violence, theft,
burglary, fraud, sexual offences, kidnapping, serious weapons offences, drug
trafficking, deliberate property damage, and offences directly relevant to
customer safety — are **illustrative examples only and are not legally
approved**.

Outcomes: `clear`, `approved`, `rejected`, `correction_required`,
`manual_review`, `appeal_pending`.

**No AI decides criminal eligibility. No extraction decides it. No automatic
permanent rejection follows from a low-confidence extraction or an ambiguous
record. Every adverse decision requires a named human with a named capability
and recorded evidence.**

---

## 12. Activation gates

A worker account exists immediately. Worker capability stays **fail-closed**
until every gate passes. A gate that is missing evaluates to `false`, so an
incomplete account is never accidentally activated by a gate nobody wrote.

Twenty-four gates cover: authenticated account, contact phone present, worker role
selected, legal name, profile photo, biography, services, service area, current
address, both ID sides uploaded, both approved, identity fields confirmed,
certificate uploaded, certificate approved, worker agreements, document-processing
consent, identity verification approved, not banned, no blocking trust action,
provider status allowed, not deactivated, no deletion pending.

`private.worker_capability_active()` is true only when **every gate passes AND
the lifecycle actually reached `active`**. Both halves are required: passing the
gates is necessary, but a human still has to activate the account.

Before activation a worker may sign in, complete onboarding, upload and replace
documents, review extracted fields, view status, respond to corrections, contact
support, appeal, and use customer booking through the secondary mode.

Before activation a worker may **not** appear in discovery, receive quote
invitations, submit quotes, accept jobs, use booking chat as a worker, receive
worker opportunity notifications, receive payouts, represent themselves as
verified, or bypass activation through a direct RPC call.

Activation is refused outright if any gate is unsatisfied, even for a reviewer
holding `activate_worker`.

---

## 13. Staff review, correction, rejection and appeal

Five new capabilities under WPS-017's existing model:

| Capability | High risk | Dual control | Reauth |
| --- | --- | --- | --- |
| `review_worker_vetting` | no | no | no |
| `review_criminal_records` | yes | no | yes |
| `activate_worker` | yes | no | yes |
| `reject_worker_application` | yes | **yes** | yes |
| `manage_vetting_policy` | yes | **yes** | yes |

Capability follows the **weight of the decision, not the shape of the call**.
Approving somebody and rejecting them are not the same authority.

The queue exposes an opaque `subjectRef`, a state, a wait and a priority — no
name, email, phone, identifier or storage path. A queue is a work list, not a
directory of people. Opening a case is a separate, capability-checked, audited
call.

An adverse decision without recorded evidence is refused by the server. A
rejection with an empty note is a rejection nobody can review later.

Appeals reuse the WPS-016 authority. **The separation rule is enforced in SQL,
not in a runbook**: `private.worker_appeal_reviewer_is_independent()` refuses an
appeal decided by anybody who made an adverse decision on that account. No AI
decides an appeal.

Corrections preserve prior immutable history and never expose staff-private
notes.

---

## 14. Discoverability — the decision that shaped this WPS

The first implementation added `private.worker_capability_active(p.user_id)` as
a final condition inside `private.is_provider_publicly_discoverable`. It is the
tidiest possible enforcement point: discovery, search, the catalog and quote
invitations all flow through that one predicate.

**It broke fifty-two assertions across nine existing suites.**

Those failures were not brittle tests. They were WPS-006, WPS-010, WPS-011 and
WPS-020 stating what "discoverable" means, against fixtures that build an
approved worker with no WPS-023 onboarding row. Redefining a predicate four
specifications already validated, in order to save writing the gate where the
work happens, would have been WPS-023 quietly taking ownership of a definition
it does not own.

The predicate was restored unchanged. The gate lives where a worker acts:

- `is_published` is the discovery switch, and for any account that went through
  WPS-023 the only thing that sets it true is
  `staff_worker_vetting_decision('activate')`, which refuses unless every gate
  passes.
- Operational worker verbs check `private.require_active_worker()`.

A worker who has not been activated is therefore never published, never
discoverable, and refused at every worker verb — without changing what
"discoverable" has meant since WPS-006.

---

## 15. Grandfathering

Existing providers are backfilled into `manual_review`, **never `active`**.
None has been through WPS-023 identity confirmation or submitted a certificate,
and silently marking them active would be exactly the automatic approval this
specification forbids. Re-activation is a staff act.

---

## 16. Notifications, support and privacy

Fifteen events under the WPS-014 catalogue, all with generic payloads. None
carries a National ID, a document filename, offence detail, a staff note, a raw
address, or a certificate image.

Support reuses WPS-019. No parallel support flow exists. Review-timing content
makes **no SLA promise** — nothing measures turnaround and nobody has committed
to staffing one, so "usually within 48 hours" would be a number invented to make
a screen feel better.

WPS-022 remains authoritative for classification, retention, staff access,
consent, export, deletion, anonymization, legal holds, storage cleanup, audit
and incidents. WPS-023 weakens none of it: seven new stores are registered in
`private.data_inventory`, the certificate bucket is registered in
`storage_bucket_lifecycle` as `private_staff`, and no sensitive vetting record
is export-included.

---

## 17. What ships disabled

Four feature flags, all `enabled = false, audience = 'none'`:
`authentication_gateway`, `worker_vetting`, `identity_extraction`,
`location_provider`. Two kill switches ship inactive: `worker_activation`,
`identity_extraction`.

An authentication gateway that turns itself on before anyone has seen it on a
device is the one change that can lock every account out at once.

---

## 18. Unresolved legal and product questions

These require professional advice and are **not answered here**.

| # | Question | Owner |
| --- | --- | --- |
| **Q-01** | Is Warsha permitted, under Egyptian law, to require and store a criminal-record certificate for platform workers at all? | Lawyer |
| **Q-02** | What lawful basis covers processing criminal-record data, and does it require explicit consent, a legitimate-interest assessment, or something else? | Lawyer / DP specialist |
| **Q-03** | How long may a criminal-record certificate be retained after a worker leaves, and what must happen at expiry? The seeded 1,825 days is a placeholder. | Lawyer |
| **Q-04** | Must a certificate be periodically renewed, and at what interval? | Lawyer |
| **Q-05** | Which offence categories may lawfully bar somebody from this work, and does refusing work on that basis create employment-classification or discrimination exposure? | Lawyer |
| **Q-06** | Is an accusation without final conviction usable in an eligibility decision? | Lawyer |
| **Q-07** | What are a rejected worker's rights of explanation, appeal and rectification? | Lawyer |
| **Q-08** | Is there an approved method of verifying certificate authenticity that does not require Ministry integration? | Lawyer / Operations |
| **Q-09** | May Warsha retain National ID hashes indefinitely, and does the hash-plus-last-four model satisfy minimization? | DP specialist |
| **Q-10** | Does requiring identity documents and a criminal-record check push worker classification toward employment? | Lawyer |
| **Q-11** | Is storing an identity document image at all lawful, or must extraction-and-discard be used? | Lawyer / DP specialist |
| **Q-12** | What must be disclosed to a worker before their document is opened by staff? | Lawyer |
| **Q-13** | Which map or geocoding provider may be used, and does its data processing require a transfer assessment? | Lawyer / Owner |
| **Q-14** | Does a customer's exact coordinate require separate consent from the address itself? | DP specialist |
| **Q-15** | May an OCR provider receive an identity document image, and under what contract? | Lawyer / DP specialist |

---

## 19. Acceptance

WPS-023 is complete when: the app opens to the gateway signed out with no
protected-screen flash; role selection is explicit, accessible, RTL-safe and
server-persisted; a customer cannot book without a confirmed pin; a worker
cannot be discovered, invited, quote, accept, chat as a worker or be paid before
activation; every adverse decision has a named actor, a capability, a reason and
evidence; no offence detail or identifier escapes to any client surface; English
and Egyptian Arabic reach parity; and every automated gate passes from a clean
tree.

Manual acceptance is **not** claimed. See
[WPS-023-MANUAL-ALPHA](../testing/WPS-023-MANUAL-ALPHA.md).
