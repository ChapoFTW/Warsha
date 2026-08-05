# WPS-022 acceptance evidence

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Branch | `feat/wps-022`, rooted on `main` at `0d09629` |
| Migration | `202608070001_wps022_privacy_data_lifecycle_user_rights.sql` (local only) |
| Hosted push | **NOT EXECUTED** |
| Manual alpha | 72 cases, **0 executed** |

---

## 1. What was executed

| Gate | Result |
| --- | --- |
| `supabase db reset` (clean, full 37-migration chain) | **PASS** |
| `supabase test db` | **25 files / 2,547 assertions — `Result: PASS`** |
| WPS-022 pgTAP suite | **218 assertions** |
| `npm run test:wps022` | **577 checks passed** |
| Regression suites | **21 / 22** — see §5 |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS**, 0 errors 0 warnings |
| `npm run check:mojibake` | **PASS** — no likely mojibake found |
| `git diff --check` | Clean |
| `npm run audit:secrets` | Clean — 515 tracked files, 44 commits |
| `npm run audit:migrations` | Clean — 37 migrations |
| `npm run audit:environment` | Clean — 5 vars, 27 routes, 6 assets, **0 open notes** |
| `npm run audit:appearance` | Clean — 225 files, 73 roles in both themes |
| `npm run audit:bundle` | Clean — 60 artefacts across 3 exports |
| Expo Doctor | **18/18** |
| Android / iOS / Web export | **PASS** (cache cleared); `privacy.html`, `privacy-delete.html` and `admin/privacy.html` present |
| `supabase migration list --linked` | Read-only — `202608060001` and `202608070001` both remote-empty |
| `supabase db push --linked --dry-run` | Read-only — exactly two pending, no mutation |

## 2. Two real findings in the existing schema

Neither was introduced by WPS-022. Both were found by the Phase 1 audit reading
the **live schema** rather than the client source — the correction WPS-021
learned when it missed `public.wallets`.

### 2.1 A public, world-readable, unowned write target

`storage.buckets` row `avatars`:

| Property | Value |
| --- | --- |
| `public` | **true** |
| `file_size_limit` | none |
| `allowed_mime_types` | none |
| Policy | `own_avatar_write` — any authenticated account may write to `{own_uid}/…` |
| Referenced by client code | **Nothing**, since WPS-010 introduced `profile-images` |

An open bucket with no owner, no bound, and no reader restriction. Retired in
place: made private, bounded to 5 MB and three image types, write policy
dropped, leaving `storage.objects` deny-by-default for it.

**Not dropped**, because dropping a bucket is irreversible and hosted objects
may exist that a local migration cannot see — the same reasoning WPS-021 applied
to `promo_codes` and `wallets`.

### 2.2 Leftover bootstrap grants

`anon` and `authenticated` held `TRUNCATE`, `REFERENCES` and `TRIGGER` on
**every** table in `public`, from Supabase's `grant all on schema public`.
Earlier hardening revoked `SELECT`/`INSERT`/`UPDATE`/`DELETE` and left these.

Not reachable through PostgREST, which issues only DML and RPC. But
**`TRUNCATE` bypasses RLS entirely**, so holding it was a standing defect
waiting for a connection string to leak. All three revoked; asserted absent.

## 3. Defects found and fixed during implementation

Each was a real defect, not a test artefact.

1. **A retry defeated by the open-export cap.** `request_my_data_export`
   checked the one-open-request limit *before* resolving the idempotency key, so
   retrying a request the client already owned raised `55000`. A dropped
   response would have left somebody permanently unable to retry. The key is now
   resolved first — **a retry is not a second request.**

2. **`pg_catalog.nullif` / `least` / `greatest` do not exist.** They are SQL
   constructs, not functions, and cannot be schema-qualified — the same class of
   error as `EXTRACT`, which WPS-014 hit on a hosted push. Unqualified, and the
   client suite now asserts none reappears.

3. **`text[] || 'literal'` is not an append.** With an untyped literal Postgres
   prefers `anyarray || anyarray` and tries to cast the string to an array,
   giving `malformed array literal: active_booking`. Every blocker append is now
   `::text`.

4. **`provider_profiles.about` is `NOT NULL`.** Anonymization nulled it. WPS-010
   declares it `NOT NULL DEFAULT ''`. Emptied rather than nulled — the
   difference between removing somebody's biography and breaking the table it
   lived in.

5. **Deleting notifications breaks WPS-014.** `notification_source_links` holds
   a foreign key onto them and is **immutable by design**, so its dedupe ledger
   can never be rewritten. Notifications are now preserved — correctly, since
   `notification_safe_payload` already reduced their payloads to resource UUIDs
   at write time and their titles come from a generic catalog. There was nothing
   personal left to remove.

6. **`staff_access_log.surface` is an allowlist.** WPS-018 constrains it to
   eight values. Mapped onto `audit_explorer` with the distinction carried by
   `query_shape`, rather than widening a constraint on an applied migration.

7. **Anonymization inside a user session hits the WPS-010 guard.**
   `prevent_provider_approval_changes` refuses an `is_published` change from a
   signed-in non-staff session. **The guard was right.** It proved a design
   fact: anonymization is a *system* operation with no end-user session. The
   pgTAP fixture was changed to reflect that; no authority was weakened.

8. **`package.json` was reformatted by a tooling round-trip.** A
   `ConvertTo-Json` rewrite re-serialized the whole file, producing a 183-line
   diff on a dependency manifest. Dependencies were verified byte-identical and
   the file was restored to a 2-line diff.

## 4. Constraints honoured rather than widened

| Allowlist | Owner | WPS-022's choice |
| --- | --- | --- |
| `staff_access_log_surface_check` | WPS-018 | Log under `audit_explorer` |
| `staff_capabilities_domain_check` | WPS-017 | `accounts`, `security`, `audit`, `incidents` |
| `operational_log_category_check` | WPS-018 | Log under `security` |
| `notifications_category_check` | WPS-014 | `security` |
| `notifications_route_type_check` | WPS-014 | `preferences` |
| `operational_incidents_category_check` | WPS-017 | Existing `security_incident` |

Six allowlists, none widened.

## 5. Preservation

All 24 pre-existing pgTAP suites pass with **no assertion edited**. WPS-022 adds
one suite and changes none.

`staffCapabilities` in `src/admin/admin-types.ts` was deliberately **not**
extended, following the WPS-021 precedent: `wps017-operations-admin.test.mts`
asserts every member of that array is seeded by the *WPS-017* migration, so
adding WPS-022 keys would break a passing suite. The five new capabilities are
in the `StaffCapability` union, which is what `can()` needs.

Extended and none replaced: `require_staff_capability`, `record_staff_audit`,
`staff_log_access`, `enforce_rate_limit`, `record_operational_event`,
`staff_kill_switch_active`, `platform_environment`, the notification catalog,
the feature-flag and kill-switch tables, and `observability_retention_policy`.
No existing table, function, policy, or grant was dropped or weakened.

## 6. What the numbers prove, and what they do not

2,547 pgTAP assertions prove the server enforces what it claims — that one
account cannot read another's consent, deletion, or export row; that
anonymization touches no financial, trust, or referral record; that no retention
rule is executable; that a hold's author cannot release it; that no privacy
table reaches Realtime.

The client suite proves the client's contracts hold and that the dark patterns,
legal claims, and internal vocabulary really are absent.

They do **not** prove:

- that somebody reading the deletion screen understood their payment history
  would remain;
- that the blocked-deletion sentence reads as helpful rather than as
  stonewalling;
- that the Arabic sounds like a person wrote it;
- that a screen reader user can actually complete a deletion;
- that "being prepared" reads as progress rather than as broken.

Those are the 72 manual cases, and all 72 are **NOT RUN**.

## 7. The one regression failure

`test:wps018` fails on the assertion *"over-the-air updates are not enabled"*.

It is **pre-existing**. Verified directly: with every WPS-022 change stashed
(`git stash push -u`), `test:wps018` fails with the identical assertion on the
clean tree. WPS-022 does not touch `app.json`.

All 21 other suites pass, including all 20 that existed before WPS-022.

## 7a. Two fixes made during validation

1. **An unused import.** `app/admin/privacy.tsx` imported `View` after the
   staff rows were converted to `AdminRow` props. Removed, along with the
   orphaned `meta` style. Lint is now 0 errors, 0 warnings.

2. **Two undeclared routes.** `app/privacy` and `app/privacy-delete` were not
   named in the root layout `Stack`, which the environment audit reported as two
   open notes. Both declared; the audit is now **0 open notes**.

## 8. Deployment posture

**Local: accepted.** Every automated gate passes from a clean reset.

**Staging: not attempted.** No staging environment is configured.

**Production: blocked, unchanged.** The WPS-018 launch blockers stand and
WPS-022 removes none of them.

Pending hosted chain — **two** migrations:

```
202608060001_wps021_growth_referrals_promotions.sql
202608070001_wps022_privacy_data_lifecycle_user_rights.sql
```

Documented, **unexecuted** command:

```
npx.cmd supabase db push --linked
```

Applying WPS-022 changes no user-visible behaviour: `privacy_center`,
`data_export` and `account_deletion` all ship disabled, and both configuration
and flag must agree before any surface opens.

## 9. Open items

1. No worker produces an export **file**. The request stops at `manifest_ready`.
2. No scheduler advances a deletion past `cooling_off`.
3. Anonymization clears rows but not storage objects.
4. Sign-in disablement is an auth-layer operation WPS-022 does not own.
5. Ten of eleven retention durations are unreviewed.
6. 72 manual cases, 0 executed.

Items 1–4 sit behind a flag that is off, and the product copy claims none of
them work. Item 5 is a deliberate refusal to invent law.
