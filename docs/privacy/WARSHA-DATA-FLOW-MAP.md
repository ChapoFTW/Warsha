# Warsha data-flow map

Where personal data enters, where it moves, and where it can leave.

## Entry points

| Entry | Data | Class | Authority |
| --- | --- | --- | --- |
| Sign-up | Phone or email, display name | account_private / credential_secret | WPS-002 |
| Profile edit | Name, photo | account_private / public_listing | WPS-002 |
| Address book | Address line, governorate, coordinates | account_private | WPS-001 |
| Worker onboarding | Biography, skills, specialties, service areas | public_listing | WPS-010 |
| Verification upload | Identity documents, certificates | identity_sensitive | WPS-006 |
| Booking creation | Issue description, address snapshot, schedule | participant_private | WPS-012 |
| Chat | Messages, attachments | participant_private | WPS-009 |
| Review | Rating, body, images | public_listing | WPS-011 |
| Dispute | Description, evidence files | support_restricted | WPS-013 |
| Abuse report | Report body, evidence | trust_restricted | WPS-016 |
| Support case | Subject, replies, attachments | support_restricted | WPS-019 |
| Search box | Query text | derived_personalization | WPS-020 |
| Provider view | Provider id, timestamp | derived_personalization | WPS-020 |
| Referral claim | Code, attribution | account_private | WPS-021 |
| Push registration | Device token (hashed + encrypted) | credential_secret | WPS-014 |
| Consent decision | Purpose, version, decision | account_private | WPS-022 |

**No entry point collects** advertising identifiers, background location,
contact lists, biometrics, or any inferred attribute.

## Internal movement

```
                          ┌─────────────────────────────┐
   client (RLS-scoped) ──►│  public schema              │
                          │  owner / participant scoped │
                          └──────────────┬──────────────┘
                                         │  SECURITY DEFINER RPCs only
                                         ▼
                          ┌─────────────────────────────┐
                          │  private schema             │
                          │  NO grant to anon or        │
                          │  authenticated. Ledger,     │
                          │  trust, audit, config,      │
                          │  privacy registries         │
                          └─────────────────────────────┘
```

The boundary is a **privilege** boundary, not only a policy one. `private`
holds zero grants to either client role, so a leaked anon key reaches none of
it regardless of RLS.

### Coordinate handling

Exact coordinates enter `public.addresses` (owner-scoped) and
`private.marketplace_request_locations` (no client grant). Discovery and
analytics read **neither**. WPS-020 matches on coarse service areas, so an exact
home location never reaches a ranking input or an aggregate.

### Snapshotting

Bookings freeze an address snapshot and a price snapshot at creation. This is
why anonymization can soft-delete the live address row without damaging the
booking: the record the two parties rely on already carries what it needs.

## Exit points

| Exit | What leaves | Controls |
| --- | --- | --- |
| Client reads | Owner- or participant-scoped rows | RLS + grants |
| Signed storage URLs | One object, 300–3600 s | Policy-scoped to owner or participant |
| Public worker listing | `public_listing` fields only | Explicitly published |
| Public reviews | Rating, body, neutral reviewer label | WPS-011 |
| User export | The requester's own data | Owner-scoped RPC; manifest states exclusions |
| Staff reads | Capability-scoped projections | Capability + sensitive-access log |
| Staff operational exports | Aggregates and case data | WPS-017; separate from user exports |
| Notifications | Generic title/body, resource UUIDs | `notification_safe_payload` |
| Operational logs | Event key, safe metadata allowlist | Redaction at write time |

**No exit point sends personal data to a third party.** There is no analytics
SDK, no crash reporter, no attribution service — see
[WARSHA-SUBPROCESSOR-REGISTER](WARSHA-SUBPROCESSOR-REGISTER.md).

## Flows that deliberately do not exist

| Flow | Why absent |
| --- | --- |
| Staff → user export contents | An export is built for one person. No RPC returns one to staff |
| Subject → reporter identity | Would expose a reporter to the person they reported |
| Customer → worker documents | Identity documents are staff-only |
| Worker → customer evidence | Dispute evidence is participant- and staff-scoped |
| Discovery → exact coordinates | Ranking uses coarse areas |
| Realtime → privacy tables | No privacy table is published; a deletion request on a channel is a leak with a subscription |
| Logs → raw search terms | The access log stores fixed shapes, never a phrase |
| Deletion → shared records | One party cannot rewrite the other's past |

Each is asserted by pgTAP or by `test:wps022`.

## The export flow, in detail

```
account requests
      │
      ▼
rate limit (3/day) ──► idempotency key resolved FIRST ──► existing request returned
      │                                                   (a retry is not a second request)
      ▼
open-request cap (1)
      │
      ▼
private.privacy_build_manifest(user_id)
      │  counts only; reads no staff-private table;
      │  never touches reporter identity or provider secrets
      ▼
row written to public.privacy_export_requests
      │  status = manifest_ready, expires_at = now + 72h
      ▼
[ GAP: no worker exists to produce the file ]
      │
      ▼
account sees "being prepared" — never "ready"
```

The gap is real and is stated in the product rather than papered over. Building
the archive needs a worker or Edge Function that is not deployed; see
[DATA-EXPORT-RUNBOOK](../operations/privacy/DATA-EXPORT-RUNBOOK.md).
