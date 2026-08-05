# Warsha data inventory

The authoritative copy lives in `private.data_inventory` so a test can read it.
This document is the readable projection.

An object holding personal data that is **missing** from the registry is a bug:
it will be absent from exports and will fail `staff_data_inventory` coverage.

Legend for **Treatment**: `delete` — the row goes · `anonymize` — the row stays,
the person does not · `preserve` — untouched by a deletion request ·
`preserve_minimized` — kept, identifiers reduced.

## Accounts and profiles

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `public.profiles` | account_private | Identifies the account and carries the contact phone | WPS-002 | anonymize | Yes |
| `public.provider_profiles` | public_listing | The worker listing customers choose from | WPS-010 | anonymize | Yes |
| `public.addresses` | account_private | Where the work happens | WPS-001 | anonymize | Yes |
| `public.user_display_preferences` | account_private | Remembers appearance across devices | WPS-020 | delete | Yes |

## Bookings and commerce

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `public.bookings` | participant_private | The commercial record between two people | WPS-007 | preserve_minimized | Yes |
| `public.messages` | participant_private | Conversation evidence relied on in disputes | WPS-009 | preserve_minimized | Yes |
| `public.reviews` | public_listing | Verified feedback a worker's reputation rests on | WPS-011 | preserve_minimized | Yes |
| `public.notifications` | account_private | Tells an account something happened | WPS-014 | preserve | No |

## Money

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `public.financial_booking_payments` | financial_authoritative | What a customer paid | WPS-007 | preserve | Yes |
| `private.financial_ledger_entries` | financial_authoritative | Double-entry ledger | WPS-007 | preserve | No |
| `public.provider_earnings_ledger` | financial_authoritative | What Warsha owes a worker | WPS-007 | preserve | Yes |
| `public.provider_payout_destinations` | financial_authoritative | Where a worker is paid; stored masked | WPS-015 | preserve_minimized | No |

Deleting any of these would unbalance the books or cancel a real debt. None is
touched by a deletion request, and the anonymization function does not reference
them at all — asserted by test against its own body.

## Identity

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `public.provider_verification_documents` | identity_sensitive | Proves a worker is who they claim | WPS-006 | preserve_minimized | No |
| `private.provider_verification_identities` | identity_sensitive | Hash and last four digits of a national ID | WPS-006 | preserve_minimized | No |

Warsha never stores a raw national ID number. Retention duration is an **open
legal question** (Q-01).

## Trust, support and disputes

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `public.disputes` | support_restricted | Formal disagreement over an outcome | WPS-013 | preserve | No |
| `public.trust_reports` | trust_restricted | Safety reports | WPS-016 | preserve | No |
| `private.trust_fraud_signals` | trust_restricted | Abuse detection signals | WPS-016 | preserve | No |

Reporter identity is never disclosed to the subject, never exported, and never
implied by a blocked-deletion reason.

## Devices and credentials

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `private.notification_device_tokens` | credential_secret | Addresses a device for push | WPS-014 | preserve_minimized | No |

Stored hashed and encrypted, never in plain text. Revoked on anonymization; the
hash remains as proof that delivery stopped.

## Personalization

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `public.user_recent_searches` | derived_personalization | Speeds up repeat searches | WPS-020 | delete | Yes |
| `public.user_recently_viewed_providers` | derived_personalization | Find a worker seen yesterday | WPS-020 | delete | Yes |
| `public.conversation_typing` | ephemeral | Shows the other person is writing | WPS-009 | delete | No |

Clearable at any time from the privacy centre.

## Growth

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `public.referral_attributions` | account_private | Who invited whom, for reward and fraud detection | WPS-021 | preserve | Yes |

Preserved deliberately: deleting it would enable delete-and-recreate referral
fraud.

## Audit

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `private.staff_audit_events` | operational_audit | What staff did | WPS-017 | preserve | No |
| `private.staff_access_log` | operational_audit | Which sensitive records staff read | WPS-018 | preserve | No |

Query shapes are hashed or fixed slugs; no phrase anybody typed is stored.

## Privacy

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `public.privacy_consent_records` | account_private | Proves what was agreed, when, under which version | WPS-022 | preserve | Yes |

## Storage buckets

| Object | Class | Purpose | Authority | Treatment | Export |
| --- | --- | --- | --- | --- | --- |
| `storage.privacy-exports` | account_private | A brief copy of one account's own data | WPS-022 | delete | No |
| `storage.verification-documents` | identity_sensitive | The identity files themselves | WPS-006 | preserve_minimized | No |
| `storage.avatars` | public_listing | **Retired.** Superseded by profile-images | WPS-022 | not_applicable | No |

Full bucket matrix: [WARSHA-PRIVACY-OPERATIONS](WARSHA-PRIVACY-OPERATIONS.md).
