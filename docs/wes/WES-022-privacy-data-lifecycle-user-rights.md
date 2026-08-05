# WES-022 — Privacy, Data Lifecycle & User Rights (engineering baseline)

```
WES-022
Version: 1.0
Status: ENGINEERING BASELINE
Implements: WPS-022
```

| Field | Value |
| --- | --- |
| Migration | `202608070001_wps022_privacy_data_lifecycle_user_rights.sql` |
| pgTAP | `supabase/tests/database/privacy-data-lifecycle.test.sql` |
| Client suite | `npm run test:wps022` |

---

## 1. What was reused rather than rebuilt

WPS-022 creates no second authority for anything that already has one.

| Need | Existing authority | Used as |
| --- | --- | --- |
| Staff capability gate | `private.require_staff_capability` (WPS-018) | Entry to every staff RPC |
| Immutable staff audit | `private.record_staff_audit` (WPS-017) | Hold create/release, retention preview |
| Sensitive-access log | `private.staff_log_access` (WPS-018) | Privacy queue and inventory reads |
| Rate limiting | `private.enforce_rate_limit` (WPS-018) | Export, deletion, consent, history clearing |
| Operational log | `private.record_operational_event` (WPS-018) | Install, request, export events |
| Feature flags | `private.staff_feature_flags` (WPS-017) | `privacy_center`, `data_export`, `account_deletion` |
| Kill switches | `private.staff_kill_switches` (WPS-017) | `privacy_requests`, `retention_execution` |
| Dual control | `private.staff_platform_configuration.dual_control_enabled` | Hold release |
| Notifications | `private.prepare_notification` + catalog (WPS-014) | Six privacy events |
| Environment | `private.platform_environment` (WPS-018) | Every environment stamp |
| Observability retention | `private.observability_retention_policy` (WPS-018) | Three new privacy streams |
| Soft delete | `deleted_at` on profiles/addresses/portfolio (WPS-001/010) | Anonymization targets |
| History clearing | `clear_my_recent_searches` / `clear_my_recently_viewed` (WPS-020) | Preserved; the privacy RPC is additive |

**Deliberate non-reuse:** privacy configuration is a singleton table
(`private.privacy_configuration`) following `communication_configuration` and
`payment_configuration`, rather than a new WPS-017 configuration domain.
`private.staff_configuration_payload_valid` validates a closed set of payload
shapes; adding a domain would either fail validation or force that function to
be rewritten for one caller.

## 2. Schema

### Client-visible (`public`, RLS on, select-only grant)

| Table | Policy | Writes |
| --- | --- | --- |
| `privacy_consent_purposes` | `select … using (active)` | None. Seed data |
| `privacy_consent_records` | `select … using (user_id = auth.uid())` | RPC only; immutable |
| `account_deletion_requests` | `select … using (user_id = auth.uid())` | RPC only |
| `privacy_export_requests` | `select … using (user_id = auth.uid())` | RPC only |

No `INSERT`, `UPDATE` or `DELETE` policy exists on any of the four, and no
client role holds those grants. Every write is a `SECURITY DEFINER` RPC.

### Server-only (`private`, no grant to any client role)

`data_classifications`, `data_inventory`, `privacy_configuration`,
`privacy_legal_holds`, `privacy_legal_hold_events`, `account_deletion_events`,
`privacy_anonymization_log`, `privacy_retention_rules`,
`privacy_retention_runs`, `storage_bucket_lifecycle`,
`privacy_incident_details`.

### Column added

`public.profiles.deactivated_at` — reversible, hides public presence, deletes
nothing.

## 3. Functions

| Function | Schema | Callable by |
| --- | --- | --- |
| `get_my_privacy_overview()` | public | authenticated |
| `get_my_consents()` | public | authenticated |
| `record_my_consent(text, boolean, text)` | public | authenticated |
| `clear_my_privacy_history(text)` | public | authenticated |
| `set_my_account_deactivated(boolean)` | public | authenticated |
| `request_account_deletion(text, text)` | public | authenticated |
| `cancel_account_deletion()` | public | authenticated |
| `request_my_data_export(text)` | public | authenticated |
| `get_my_data_exports(integer)` | public | authenticated |
| `staff_privacy_requests(integer)` | public | capability |
| `staff_retention_dry_run(text)` | public | capability |
| `staff_storage_orphan_preview(text)` | public | capability |
| `staff_create_legal_hold(…)` | public | capability |
| `staff_release_legal_hold(uuid, text)` | public | capability, dual control |
| `staff_data_inventory()` | public | capability |
| `privacy_deletion_blockers(uuid)` | **private** | nobody |
| `privacy_anonymize_account(uuid, uuid)` | **private** | nobody |
| `privacy_build_manifest(uuid)` | **private** | nobody |
| `privacy_hold_active(uuid, text)` | **private** | nobody |
| `privacy_retention_executable(text)` | **private** | nobody |
| `privacy_surface_enabled(text)` | **private** | nobody |

Every one is `SECURITY DEFINER` with `set search_path = ''` and fully qualified
references. `anon` holds `execute` on none of them.

## 4. The five-condition execution guard

```sql
return v_rule.enabled
   and v_rule.legal_review_status = 'approved'
   and v_config.retention_execution_enabled
   and not private.staff_kill_switch_active('retention_execution')
   and private.platform_environment() <> 'production';
```

All five must hold. As shipped, every rule fails at least two. Production
execution additionally requires an approved change and is refused here by
design — turning it on is a deliberate act with an audit trail, not a default
that drifted.

## 5. Defects found during implementation

Each was a real defect, not a test artefact.

1. **A public, world-readable, unowned write target.** `avatars` was
   `public = true`, unbounded, and writable by any authenticated account into a
   folder named after its own uid. Superseded by `profile-images` since WPS-010
   and referenced by nothing. Closed in §0 of the migration.

2. **Leftover Supabase default grants.** `anon` and `authenticated` held
   `TRUNCATE`, `REFERENCES` and `TRIGGER` on **every** table in `public`.
   Earlier hardening revoked the DML verbs and left these. Not reachable
   through PostgREST — but `TRUNCATE` bypasses RLS entirely, so holding it is a
   standing defect waiting for a connection string to leak. Revoked; asserted
   absent.

3. **A retry defeated by the open-export cap.** `request_my_data_export`
   checked the one-open-request limit *before* resolving the idempotency key,
   so retrying a request already owned raised `55000`. A dropped response would
   have left the client permanently unable to retry. The key is now resolved
   first.

4. **`pg_catalog.nullif` / `least` / `greatest` do not exist.** They are SQL
   constructs, not functions, and cannot be schema-qualified — the same class
   of error as `EXTRACT`, which WPS-014 hit on a hosted push. Unqualified;
   asserted absent by the client suite.

5. **`text[] || 'literal'` is not an append.** With an untyped literal Postgres
   prefers `anyarray || anyarray` and tries to cast the string to an array,
   giving `malformed array literal`. Every blocker append is now `::text`.

6. **`provider_profiles.about` is `NOT NULL`.** Anonymization nulled it. WPS-010
   declares it `NOT NULL DEFAULT ''`; honouring that is the difference between
   removing somebody's biography and breaking the table it lived in. Emptied
   rather than nulled.

7. **Deleting notifications breaks WPS-014.** `notification_source_links` holds
   a foreign key onto them and is **immutable by design**, so the dedupe ledger
   can never be rewritten. Notifications are now preserved — correctly, since
   `notification_safe_payload` already reduced their payloads to resource UUIDs
   at write time and their titles come from a generic catalog.

8. **`staff_access_log.surface` is an allowlist.** WPS-018 constrains it to
   eight values. Mapped onto `audit_explorer` with the distinction carried by
   `query_shape`, rather than widening a constraint on an applied migration.

9. **Anonymization inside a user session hits the WPS-010 guard.**
   `prevent_provider_approval_changes` refuses an `is_published` change from a
   non-staff session. This is correct, and it proved a design fact: anonymization
   is a **system** operation with no end-user session. The fixture was changed
   to reflect that; the guard was not weakened.

## 6. Constraints honoured rather than widened

| Allowlist | Owner | WPS-022's choice |
| --- | --- | --- |
| `staff_access_log_surface_check` | WPS-018 | Log under `audit_explorer` |
| `staff_capabilities_domain_check` | WPS-017 | `accounts`, `security`, `audit`, `incidents` |
| `operational_log_category_check` | WPS-018 | Log under `security` |
| `notifications_category_check` | WPS-014 | `security` |
| `notifications_route_type_check` | WPS-014 | `preferences` |
| `operational_incidents_category_check` | WPS-017 | Existing `security_incident` |

## 7. Client architecture

```
src/privacy/
  privacy-types.ts            import-free contracts + pure rules
  privacy-copy.ts             import-free EN/AR tables
  privacy-translations.ts     the copy hook
  privacy-repository.ts       method-per-RPC, Mock branch each
  mock-privacy-state.ts       Mock parity, no network
  privacy-context.tsx         account-isolated state
  privacy-staff-types.ts      staff contracts, SEPARATE from the account ones
  privacy-staff-repository.ts read-only staff reads
app/
  privacy.tsx                 the privacy centre
  privacy-delete.tsx          deletion
  admin/privacy.tsx           staff privacy operations
```

The staff types live in their own module deliberately. A shared type is how a
manifest field ends up on a staff screen because it was already there.

`StaffPrivacyRequest` **cannot** carry a manifest, a reason code, or a blocker
list — only a count — and the client suite asserts those absences against the
type file itself.

## 8. Verification

| Gate | Result |
| --- | --- |
| Clean `supabase db reset` (37 migrations) | PASS |
| `supabase test db` | 25 files / 2,547 assertions — PASS |
| WPS-022 pgTAP | 218 assertions |
| `npm run test:wps022` | See acceptance evidence |
| Existing suites | Unchanged, all passing |

## 9. Known limitations

1. **No export file is produced.** The manifest is generated; the archive needs
   a worker or Edge Function that is not deployed. The request stops at
   `manifest_ready` and the copy says "being prepared".
2. **No scheduled execution.** Deletion requests do not advance past
   `cooling_off` automatically; a scheduler is required and does not exist.
   `privacy_anonymize_account` is built, tested, and unwired.
3. **Storage objects are not swept.** Anonymization clears rows; deleting the
   corresponding objects requires the storage runbook to be run by hand.
4. **Sign-in is not disabled on anonymization.** That is an auth-layer
   operation WPS-022 does not own. Recorded as a step in the log so the runbook
   and the log agree on what remains.
5. **Every retention duration is unreviewed.** Ten of eleven rules carry
   `legal_review_status = 'pending'`.
