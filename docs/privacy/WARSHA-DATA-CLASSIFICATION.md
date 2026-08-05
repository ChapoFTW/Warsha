# Warsha data classification

Twelve classes, registered in `private.data_classifications`. Exactly one is
non-personal, and a pgTAP assertion enforces that.

## The classes

| Key | Personal | Staff-readable | Exportable | What it means |
| --- | --- | --- | --- | --- |
| `public_listing` | Yes | Yes | Yes | Deliberately published so customers can choose a worker |
| `account_private` | Yes | Yes | Yes | Yours alone: contact details, addresses, preferences |
| `participant_private` | Yes | Yes | Yes | Visible to the two people on a booking, nobody else |
| `identity_sensitive` | Yes | With capability | **No** | Verification documents and certificates |
| `financial_authoritative` | Yes | With capability | Yes | Authoritative money records |
| `trust_restricted` | Yes | With capability | **No** | Reports, evidence, enforcement history |
| `support_restricted` | Yes | With capability | **No** | Cases, replies, dispute evidence |
| `credential_secret` | Yes | **No** | **No** | Passwords, tokens, provider secrets |
| `operational_audit` | Yes | With capability | **No** | Who did what, for security |
| `derived_personalization` | Yes | **No** | Yes | Recent searches, recently viewed |
| `ephemeral` | Yes | **No** | **No** | Typing indicators; expire on their own |
| `aggregate_nonpersonal` | **No** | Yes | No | Counts with a minimum cell size |

## Field-family classification

| Field family | Class | Notes |
| --- | --- | --- |
| Display name | `public_listing` for workers, `account_private` for customers | Becomes a neutral label on anonymization |
| Phone number | `account_private` | Never public. Removed on anonymization |
| Email address | `credential_secret` | Held by `auth.users`, never in `public` |
| Exact address | `account_private` | Booking snapshots freeze the address served |
| Exact coordinates | `account_private` | In `private.marketplace_request_locations`; never in discovery analytics |
| Approximate service area | `public_listing` | Coarse by design |
| Profile photo | `public_listing` | Removed on anonymization |
| Portfolio media | `public_listing` | Soft-deleted on anonymization |
| Identity documents | `identity_sensitive` | Private bucket, staff capability, signed URL, never exported |
| Certificates | `identity_sensitive` | Same treatment |
| Booking details | `participant_private` | Preserved: two people depend on them |
| Chat content | `participant_private` | Preserved; sender presentation neutralized |
| Attachments | `participant_private` | Private buckets, participant-scoped |
| Reviews | `public_listing` | Preserved under a neutral reviewer label |
| Disputes | `support_restricted` | Preserved |
| Abuse reports | `trust_restricted` | Reporter identity never disclosed |
| Fraud signals | `trust_restricted` | Internals never exported |
| Support messages | `support_restricted` | The requester's own messages are exportable |
| Payment records | `financial_authoritative` | Preserved |
| Payout destinations | `financial_authoritative` | Stored masked; full number never held |
| Ledger entries | `financial_authoritative` | Preserved; never exported raw |
| Bank / wallet masks | `financial_authoritative` | Mask only |
| Device and push tokens | `credential_secret` | Hashed and encrypted; revoked on anonymization |
| Search terms | `derived_personalization` | Clearable at any time |
| Recently viewed | `derived_personalization` | Clearable at any time |
| Appearance preference | `account_private` | Local device store is the authority (WPS-020) |
| Referral attribution | `account_private` | Preserved to prevent delete-and-recreate fraud |
| Admin audit | `operational_audit` | Immutable |
| IP hashes | `operational_audit` | Hashed at write time; raw IPs are never stored |
| Request identifiers | `operational_audit` | Correlation IDs only |
| Exported reports | `operational_audit` | Staff exports; separate from user exports |

## What "anonymous" means here

**It is not claimed.** The account UUID survives anonymization because it is the
join key under a worker's payout and a customer's receipt. That makes the
result **pseudonymous**, not anonymous, and this documentation says so rather
than using the more comfortable word.

Only `aggregate_nonpersonal` — counts subject to a minimum cell size — is
described as non-personal, and only because no single account can be recovered
from it.

## What Warsha does not classify, because it does not collect it

Advertising identifiers · cross-app tracking · background location · inferred
income · inferred religion · inferred ethnicity · inferred health · biometrics ·
contact-list harvesting · invisible behavioural profiling.

These are absent from the schema, and the client regression suite asserts that
no copy or code introduces them.
