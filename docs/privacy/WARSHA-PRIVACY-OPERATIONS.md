# Warsha privacy operations

Who owns what, which switches exist, and the full storage matrix.

## Ownership

| Area | Owner role | Capability |
| --- | --- | --- |
| Deletion and export request state | Security administrator, Operations manager | `review_privacy_requests` |
| Legal and operational holds | Security administrator | `manage_legal_holds` |
| Retention previews and storage orphans | Security administrator, Operations manager | `review_retention` |
| Data inventory and classification | Security administrator | `view_data_inventory` |
| Privacy incidents | Security administrator | `review_privacy_incidents` |
| Financial retention questions | Finance controller | — (legal review) |

Holds sit with the security administrator rather than with operations
deliberately: a hold suspends somebody's right to have their data removed, and
that decision belongs beside the other decisions of that weight, not beside
day-to-day case work.

## Switches

| Switch | Type | Default | Effect |
| --- | --- | --- | --- |
| `privacy_center` | Feature flag | **off** | The privacy centre |
| `data_export` | Feature flag | **off** | Self-service export |
| `account_deletion` | Feature flag | **off** | Deletion requests |
| `privacy_requests` | Kill switch | inactive | Stops new privacy requests; existing keep their state |
| `retention_execution` | Kill switch | inactive | Stops execution; dry runs remain |
| `privacy_center_enabled` | Configuration | **false** | Must agree with the flag |
| `export_enabled` | Configuration | **false** | Must agree with the flag |
| `deletion_enabled` | Configuration | **false** | Must agree with the flag |
| `retention_execution_enabled` | Configuration | **false** | One of five execution conditions |

**Both the flag and the configuration must agree** before a surface opens, and
the kill switch overrides both. Flags are environment-scoped: an absent row is
off, so a surface can never default to on because somebody forgot to seed.

## Configuration

`private.privacy_configuration` (singleton):

| Setting | Default | Note |
| --- | --- | --- |
| `cooling_off_hours` | 168 | Product choice, not a legal period |
| `export_ttl_hours` | 72 | How long a prepared copy stays available |
| `export_max_open_requests` | 1 | One at a time per account |
| `deleted_account_label_en` | `Deleted account` | The neutral label |
| `deleted_account_label_ar` | `حساب محذوف` | The neutral label |
| `policy_version` | `2026-08-07` | Current document version |

## Rate limits

| Policy | Limit | Why |
| --- | --- | --- |
| `privacy_export_request` | 3 / day | An export reads across every domain |
| `privacy_deletion_request` | 5 / day | One open request is already unique-indexed; this bounds retries |
| `privacy_consent_write` | 60 / hour | Keeps an append-only trail readable |
| `privacy_history_clear` | 20 / hour | Destructive but owner-scoped, so generous |

## Storage bucket matrix

| Bucket | Owner | Visibility | Path | Row authority | Signed URL | Deletion trigger | Retention rule | Hold scope | Export | Cleanup |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `avatars` | **retired** | retired | n/a | none | — | `retired_by_wps022` | — | account | No | security_administrator |
| `profile-images` | WPS-010 | private_owner | `{user_id}/{file}` | `profiles.avatar_url` | 900 s | account anonymization | — | account | No | operations_manager |
| `provider-portfolios` | WPS-010 | private_owner | `{user_id}/{file}` | `provider_portfolio` | 900 s | account anonymization | — | account | No | operations_manager |
| `provider-certificates` | WPS-010 | private_staff | `{user_id}/{file}` | `provider_certifications` | 900 s | legal review | `identity_documents` | identity_documents | No | security_administrator |
| `verification-documents` | WPS-006 | private_staff | `{user_id}/{file}` | `provider_verification_documents` | 900 s | legal review | `identity_documents` | identity_documents | No | security_administrator |
| `booking-attachments` | WPS-012 | private_participant | `{booking_id}/{file}` | `booking_attachments` | 900 s | booking retention | — | communications | Yes | operations_manager |
| `chat-attachments` | WPS-009 | private_participant | `{booking_id}/{file}` | `message_attachments` | 900 s | message retention | `chat_messages` | communications | Yes | operations_manager |
| `job-progress-media` | WPS-012 | private_participant | `{booking_id}/{file}` | `job_progress_media` | 3600 s | booking retention | — | communications | Yes | operations_manager |
| `marketplace-request-attachments` | WPS-008 | private_owner | `{user_id}/{file}` | `marketplace_request_attachments` | 900 s | request expiry | — | account | Yes | operations_manager |
| `review-attachments` | WPS-011 | public_signed | `{review_id}/{file}` | `review_attachments` | 900 s | review moderation | — | account | Yes | operations_manager |
| `dispute-evidence` | WPS-013 | private_participant | `{dispute_id}/{file}` | `dispute_evidence` | 900 s | legal review | `dispute_evidence` | dispute_evidence | No | operations_manager |
| `support-attachments` | WPS-019 | private_participant | `{ticket_id}/{file}` | `support_ticket_attachments` | 900 s | case closed | `support_attachments` | support_records | Yes | operations_manager |
| `privacy-exports` | WPS-022 | private_owner | `{user_id}/{export_id}.json` | `privacy_export_requests` | 300 s | export expiry | `expired_privacy_exports` | account | No | security_administrator |

Both directions are asserted by pgTAP: a bucket with no matrix row has no
documented owner, and a matrix row describing a bucket that does not exist is
fiction.

### The retired bucket

`avatars` was `public = true`, had no size limit and no MIME allowlist, and
carried a single policy letting any authenticated account write into a folder
named after its own uid. Nothing has referenced it since WPS-010 introduced
`profile-images`.

It was, in short, an open world-readable write target with no owner.

WPS-022 **closes** it rather than dropping it: made private, bounded to 5 MB and
three image types, and stripped of its write policy — leaving `storage.objects`
deny-by-default for it. Dropping a bucket is irreversible and hosted objects may
exist that a local migration cannot see.

## Staff access recording

Every privileged privacy read is recorded in `private.staff_access_log` under
the **existing** WPS-018 surface `audit_explorer`, with the distinction carried
by `query_shape` (`privacy_deletion_requests`, `privacy_data_inventory`).

That allowlist has eight values and WPS-022 widened none of them. Adding a
surface for one caller would make every future access review harder to read.

Hold creation and release are additionally recorded in
`private.staff_audit_events`, which is immutable and retained 3650 days.

## Observability streams

| Stream | Days | Personal data | Owner |
| --- | --- | --- | --- |
| `privacy_legal_hold_events` | 3650 | No | security_administrator |
| `account_deletion_events` | 3650 | No | security_administrator |
| `privacy_anonymization_log` | 3650 | No | security_administrator |

All three hold row counts and state transitions, never content. None is pruned
automatically.
