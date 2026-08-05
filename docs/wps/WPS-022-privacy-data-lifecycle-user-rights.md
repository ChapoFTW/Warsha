# WPS-022 — Privacy, Data Lifecycle & User Rights

```
WPS-022
Version: 1.0
Status: LOCKED FOR IMPLEMENTATION
Authority: Warsha Constitution
Depends on: WPS-001 through WPS-021
```

Supersedes nothing. It constrains what may be removed from every earlier WPS.

> **This document makes no claim of legal compliance.** Nothing in Warsha has
> been reviewed by an Egyptian lawyer, accountant, or data-protection
> specialist. Every retention duration below is a **product proposal** carrying
> `legal_review_status = 'pending'`. The open questions are recorded in
> [WARSHA-PRIVACY-LEGAL-QUESTIONS](../privacy/WARSHA-PRIVACY-LEGAL-QUESTIONS.md)
> and must be answered by qualified professionals before any of it is treated
> as settled.

---

## 1. Why this exists

Warsha holds a lot about people. A worker's national ID hash and verification
documents. A customer's home address and the times somebody was inside it. Six
months of messages between two people who fell out over a broken boiler. Bank
masks, payout destinations, disputes, safety reports.

Until now there was no answer to a simple question: *what happens to all of
that when somebody wants to leave?* Not a bad answer — no answer. There was no
deletion path, no export, no consent record beyond two timestamps, no retention
rule, and a public storage bucket nobody had looked at since day one.

WPS-022 answers it.

## 2. The three commitments

Everything below follows from three positions, and each is a deliberate
rejection of the easier alternative.

### 2.1 Deletion is not a `DELETE`

An account that leaves must stop being a **person** in the product while
remaining a **row** wherever somebody else's legitimate record depends on it.

A customer and a worker share a booking. If the customer leaves and the booking
vanishes, the worker's history now has a hole in it — their completed-job count
drops, their earnings record points at nothing, and a dispute they were part of
loses half its evidence. One party cannot be allowed to rewrite the other's
past. So the primitive is **anonymization**, with a narrow and documented set of
true deletions.

### 2.2 Nothing runs by itself

Retention has rules, a dry run, and an execution path that is **disabled** until
somebody qualified has reviewed the duration. WPS-022 invents no statutory
period; where a duration matters legally, it is written down as an open question
and the rule refuses to run.

### 2.3 The honest state is the state we show

A deletion that is blocked says it is blocked, and why, in words the person can
act on — without naming a reporter, quoting evidence, or identifying staff. An
export that has no file yet says it is being prepared, not that it is ready. A
deletion request says plainly, **before** it is made, that some records remain.

## 3. Scope

**In scope.** Data classification; purpose and minimization; privacy
preferences via consent; consent records; account deactivation; account
deletion; deletion blockers; anonymization and pseudonymization; data export;
retention rules and dry run; legal and operational holds; storage-object
lifecycle; identity-document handling; support, dispute and trust evidence
treatment; financial-record preservation; communication handling; search and
activity-history clearing; staff access to personal data; privacy-safe audit;
privacy incidents; user-facing privacy controls.

**Out of scope, and unchanged.** Authentication (WPS-002), profiles (WPS-010),
money (WPS-007, WPS-015), bookings (WPS-012), disputes (WPS-013), notifications
(WPS-014), trust (WPS-016), staff capability and audit (WPS-017), rate limits
and flags (WPS-018), support (WPS-019), search and appearance (WPS-020),
referrals and promotions (WPS-021). WPS-022 **reads** these systems and
constrains what may be removed from them. It rewrites none of them.

## 4. Data classification

Twelve classes. Each is registered in `private.data_classifications`, so a test
can read them and an object without a class fails a check.

| Class | Personal | Exportable | Meaning |
| --- | --- | --- | --- |
| `public_listing` | Yes | Yes | Deliberately published so customers can choose a worker |
| `account_private` | Yes | Yes | Contact details, addresses, preferences |
| `participant_private` | Yes | Yes | Shared between the two parties on a booking |
| `identity_sensitive` | Yes | **No** | Verification documents and certificates |
| `financial_authoritative` | Yes | Yes | Payments, earnings, ledger |
| `trust_restricted` | Yes | **No** | Reports, evidence, enforcement history |
| `support_restricted` | Yes | **No** | Cases, replies, dispute evidence |
| `credential_secret` | Yes | **No** | Passwords, tokens, provider secrets |
| `operational_audit` | Yes | **No** | Who did what, for security |
| `derived_personalization` | Yes | Yes | Recent searches, recently viewed |
| `ephemeral` | Yes | **No** | Typing indicators and similar |
| `aggregate_nonpersonal` | **No** | No | Counts with a minimum cell size |

Exactly one class is marked non-personal, and a pgTAP assertion enforces that.
**Nothing is labelled anonymous that can reasonably be linked back to an
account** — including the account UUID, which survives anonymization and is
therefore documented as a pseudonym rather than as anonymity.

## 5. Minimization

WPS-022 introduces no new personal-data collection. It **removes** a
collection surface: the legacy `avatars` bucket (§11).

Prohibited, and asserted absent by test: advertising identifiers, cross-app
tracking, background location, inferred income, inferred religion, inferred
ethnicity, inferred health, unapproved biometrics, contact-list harvesting,
invisible behavioural profiling.

## 6. Consent

`profiles.terms_accepted_at` and `profiles.privacy_accepted_at` already
existed. They are scalar acknowledgements: one timestamp, no version, no
withdrawal, no purpose. They are **preserved** and **backfilled** into the new
ledger, which is the authority going forward.

**Accepting Terms is not consent to everything else.** Eight purposes, three
required and five optional:

| Purpose | Required | Why |
| --- | --- | --- |
| `terms_of_service` | Yes | The agreement to use Warsha |
| `privacy_notice` | Yes | Acknowledgement, not agreement to anything optional |
| `service_communication` | Yes | Booking messages, while a booking is live |
| `marketing_communication` | No | Off unless chosen |
| `referral_communication` | No | Off unless chosen |
| `diagnostics` | No | Off unless chosen |
| `location_use` | No | Foreground only, while choosing an address |
| `identity_verification` | No | Workers only |

A required purpose renders as a **statement**, never as a toggle that would
refuse. Declining one raises an error rather than storing a `false` the product
then ignores.

Consent history is **immutable**. Withdrawal appends a new decision and stamps
`withdrawn_at` on the grant it closes; it never edits what was agreed. The
single permitted update is that stamp, and every other column must match for it
to pass the trigger.

## 7. Deactivation and deletion

Separate products, separate verbs, separate screens sections.

**Deactivation** hides the profile, stops new work reaching a worker, deletes
nothing, and is reversed by signing in. It is offered **above** deletion,
because most people reaching for deletion want a break.

**Deletion** is a server-authoritative workflow:

```
requested → cooling_off → approved → processing → anonymized → completed
                ↓              ↓
            blocked        cancelled
          legal_hold         failed
```

`blocked` and `legal_hold` are deliberately distinct states. Both mean "not
yet", but the first is something the account can resolve and the second is not.
Telling somebody to go and finish a booking when a hold is the real obstacle
sends them to fix something that was never the problem.

**Cooling-off is 168 hours by default.** This is a product choice, not a legal
one, and it is configurable.

## 8. Blocking conditions

Nine, evaluated server-side, returned as opaque slugs:

`active_booking`, `open_dispute`, `unsettled_payment`, `outstanding_earnings`,
`active_payout`, `open_chargeback`, `active_enforcement`, `open_support_case`,
`legal_hold`.

Two properties matter more than the list. First, **`outstanding_earnings` is a
blocker**: deleting an account with a live payable would quietly cancel a debt
in Warsha's favour. Second, **a blocked request is still cancellable** — an
account that cannot leave yet is not thereby trapped in a workflow it did not
want.

Every code names something the reader owns. None names another party, quotes
evidence, or reveals that a report exists. A blocked-deletion screen is an
oblique channel and must not leak through one.

## 9. Anonymization

**Removed:** display name → neutral label; profile photo; phone; addresses
(soft-deleted); worker biography, cover image, specialties, skills, location
label; portfolio (soft-deleted); worker listing unpublished and unavailable;
recent searches; recently viewed; favourites; appearance preference; device
tokens revoked and their labels cleared.

**Preserved:** bookings; messages; reviews (under a neutral reviewer label);
disputes; trust and moderation history; every financial record; referral
attribution; consent history; notifications; the account UUID.

Three preservation decisions are worth stating because deleting them would look
like the privacy-respecting choice:

- **Referral attribution stays.** Deleting it would enable delete-and-recreate
  referral fraud.
- **Consent history stays.** It is the proof of what was agreed.
- **Notifications stay.** WPS-014 already reduced their payloads to resource
  UUIDs at write time, their titles come from a generic catalog, and its dedupe
  ledger is immutable by design. There is nothing personal left to remove.

Anonymization runs as a **system operation** with no end-user session. The
WPS-010 guard on `is_published` proves this: with an end-user JWT present, that
guard correctly refuses the unpublish.

## 10. Export

Owner-scoped, authenticated, rate-limited, expiry-bound, one open request at a
time, written to a private bucket under an owner-prefixed path.

**A retry is not a second request.** The idempotency key is resolved *before*
the open-request cap, so a dropped response never leaves somebody unable to
retry the request they already own.

Excluded, and asserted by test against the function body: another participant's
contact details; staff notes; reporter identity; fraud-signal internals;
payment-provider secrets; another user's messages outside the requester's
participant context.

**Honest limitation.** The manifest is generated. The **file is not**:
producing a downloadable archive needs a worker or Edge Function, and Warsha has
neither deployed. The request stops at `manifest_ready`, and the client says the
export is being prepared — which is true. It never says ready.

## 11. Storage lifecycle

Thirteen buckets, each with a documented owner, visibility, path format, row
authority, signed-URL duration, deletion trigger, retention rule, hold scope,
export inclusion, and cleanup owner. A bucket missing from the matrix fails a
test, and so does a matrix row describing a bucket that does not exist.

**The `avatars` bucket is retired.** It was `public = true`, had no size limit
and no MIME allowlist, and carried a policy letting any authenticated account
write into a folder named after its own uid. Nothing has referenced it since
WPS-010 introduced `profile-images`. It was an open, world-readable write target
with no owner.

It is **closed, not dropped**: made private, given a size and MIME bound, and
stripped of its write policy, leaving `storage.objects` deny-by-default for it.
Dropping a bucket is irreversible and hosted objects may exist that this
migration cannot see.

## 12. Retention

Eleven rules. Each carries a data class, trigger, proposed duration, authority,
`legal_review_status`, action at expiry, hold scope, and execution owner.

**Execution requires five independent conditions**, all of which must hold:
the rule is enabled; its `legal_review_status` is `approved`; configuration
permits execution; the kill switch is clear; and the environment is not
production. As shipped, **no rule is executable** — asserted by pgTAP.

Only the **dry run** is enabled. It counts; it never writes to the target. A
rule with no automated counter reports `supported: false` rather than a
misleading zero, and the attempt is still recorded.

## 13. Legal holds

Subject, scope, reason category, staff actor, start, **mandatory review date**,
release actor, release reason, immutable history.

Three constraints stop a hold becoming permanent retention by neglect: a hold
**requires a future review date**; it may not run more than a year without
review; and **the person who created it cannot release it** while dual control
is enabled. A hold is never announced to its subject — there is deliberately no
`privacy_legal_hold` notification event.

## 14. Staff access

Five capabilities, all mapped onto existing WPS-017 domains:

| Capability | Domain | Grants |
| --- | --- | --- |
| `review_privacy_requests` | `accounts` | Request **state**, never contents |
| `manage_legal_holds` | `security` | Create and release; release is dual-controlled |
| `review_retention` | `audit` | Dry runs and orphan previews. Read-only |
| `view_data_inventory` | `audit` | The inventory and classification registry |
| `review_privacy_incidents` | `incidents` | Privacy facts on a WPS-017 incident |

**There is no capability that reads the contents of somebody's export**, and no
RPC that returns one to staff. An export is built for one person.

Every privileged read is recorded in the WPS-018 sensitive-access log under an
**existing** surface (`audit_explorer`) rather than a new one, so an access
review still reads as a single list.

## 15. Incidents

A privacy incident **is** a WPS-017 `operational_incidents` row. WPS-022 adds
`private.privacy_incident_details` carrying the privacy category, affected data
classes, affected-account estimate, containment, corrective action, and the
external-notification decision.

That decision is **recorded, never performed**. Nothing in this codebase
notifies a regulator, and nothing here implies that it has.

## 16. Notifications

Six events, all in the `security` category so preferences cannot suppress them,
all routed to `preferences`, all with **empty payloads**. No body names a
document, an address, a hold, a reporter, a dispute, or a payment.

## 17. What must never happen

1. A deletion request erases a booking, a ledger entry, a payout, or a dispute.
2. An export contains another account's private data or any staff-private note.
3. A blocked-deletion reason reveals a reporter, evidence, or a staff decision.
4. Retention executes against real data without a reviewed duration.
5. Staff read the contents of somebody's export.
6. A hold is created without a review date, or released by its own author.
7. Consent history is edited or deleted.
8. Copy claims deletion is immediate, total, or legally required.
9. Pseudonymized data is described as anonymous.
10. A privacy table is published to Realtime.

Each has a pgTAP or client assertion.
