# WES-010 — Worker Profiles & Portfolio

## 1. Status and architecture

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **IMPLEMENTED LOCALLY — MANUAL AND HOSTED DEPLOYMENT GATED** |
| Product authority | `docs/wps/WPS-010-worker-profiles-portfolio.md` |

WPS-010 extends `provider_profiles`, `provider_services`, `provider_service_areas`, `provider_portfolio`, `provider_certifications`, verification records, private Storage, the catalog RPC, provider repositories, and the existing profile screens. It does not add a parallel account, review, quote, verification, or service taxonomy.

## 2. Schema changes

Forward migration `202608010004_wps010_worker_profiles_portfolio.sql`:

- bounds `provider_profiles.about` to 500 characters and adds `experience_summary` plus bounded `specialties`;
- reuses `avatar_url` as a private object reference, never a public URL;
- upgrades `provider_portfolio` to item metadata and adds normalized `provider_portfolio_images` because one item requires multiple ordered images;
- upgrades `provider_certifications` with type, status, private review fields, MIME/size, expiry, timestamps, and soft deletion;
- makes `profile-images` and `provider-portfolios` private, configures exact MIME/size constraints, and adds a private `provider-certificates` bucket;
- replaces legacy public/owner policies with provider-user-aware, full-gate policies and exact table grants;
- adds transactional photo, portfolio, certificate, and profile RPCs;
- replaces catalog/trust projections with sanitized WPS-010 fields.

Legacy portfolio rows are preserved as published items with one child image. Legacy certificate rows default to draft unless prior public intent safely maps to approved. No destructive rollback or hosted write is performed.

## 3. Discoverability helper

`private.is_provider_publicly_discoverable(uuid)` is the single gate for public provider, service, approximate area, published portfolio, and sanitized certificate access. It verifies active confirmed-phone authentication, approved/published/nondeleted provider state, approved and unexpired identity verification, required display name and biography, a registered photo object, an active supported service, and a valid approximate service area.

The helper is `STABLE SECURITY DEFINER SET search_path = ''`. Public execution is unnecessary; public RLS and trusted RPCs call it internally. Direct access never widens sensitive tables.

## 4. Repository boundaries

`ProviderRepository` is account-scoped:

- `load(accountId)`, `activate(accountId, name)`, `save(accountId, draft, submit)`, and `setAvailability(accountId, value)`;
- `replaceAvatar(accountId, input)` and `deleteAvatar(accountId)`;
- portfolio list/create/update/delete/reorder and image upload/delete/reorder;
- certificate list/create/upload/submit/delete plus Mock review simulation.

Supabase methods require an authenticated user and reject a mismatched account scope before calling the database. Mock uses account-namespaced KV keys and account-owned local directories. Environment selection is static and contains no catch/fallback path.

## 5. Upload protocol

### Photo

1. Validate file existence, exact MIME, size, and MD5 using Expo SDK 54 `File`.
2. Upload to `{authUserId}/avatar/{random}.{ext}` with `upsert:false`.
3. Call `set_my_provider_profile_photo(path)`; the RPC checks object ownership and bucket membership and returns the former reference.
4. Request a 15-minute signed URL for the new reference.
5. Delete the former object only after steps 2–4 succeed. On registration/signing failure, remove the new object and leave or restore the former metadata.

Delete calls `clear_my_provider_profile_photo()` before best-effort object removal.

### Portfolio

Validate JPEG/PNG/WebP/HEIC/HEIF, 8 MB/image, five images/item, 40 MB/item, 12 items/worker, and content-MD5 uniqueness. Upload to `{authUserId}/{providerId}/{itemId}/{random}.{ext}` and atomically register through an owner RPC. Failed registration removes the new object. Signed URLs last 15 minutes.

### Certificates

Validate PDF/JPEG/PNG up to 8 MB. Upload to `{authUserId}/{providerId}/{certificateId}/{random}.{ext}`, then register and submit through owner RPCs. Owner previews use 15-minute signed URLs. Staff review is database-authorized; public clients never receive a certificate object reference.

## 6. RPC contract

The migration provides:

- `get_my_worker_profile()` and the retained `save_provider_foundation(jsonb, boolean)` with WPS-010 bounds and simple services;
- `set_my_provider_profile_photo(text)` and `clear_my_provider_profile_photo()`;
- `get_my_provider_portfolio()`, `save_my_provider_portfolio_item(jsonb)`, `register_my_provider_portfolio_image(...)`, `reorder_my_provider_portfolio(...)`, `remove_my_provider_portfolio_image(uuid)`, and `remove_my_provider_portfolio_item(uuid)`;
- `get_my_provider_certificates()`, `save_my_provider_certificate(jsonb)`, `register_my_provider_certificate_document(...)`, `submit_my_provider_certificate(uuid)`, `remove_my_provider_certificate(uuid)`, and staff-only `review_provider_certificate(...)`;
- updated `get_marketplace_catalog()` and `get_provider_trust_indicators(uuid)`.

All mutations derive ownership from `auth.uid()`, lock affected aggregates, validate Storage-object existence, and return only the minimum needed for client cleanup or hydration. RPC grants are authenticated-only except sanitized catalog/trust reads.

## 7. Public projection

Catalog provider JSON includes display identity, categories, active services, approximate area text, binary availability, aggregate review/job data, self-declared experience/specialties, warranty, optional configured payment methods, sanitized certificate booleans/count, and published portfolio item metadata. Media references are hydrated internally by the Supabase adapter into signed URLs and are not retained in the exported app-domain model.

The public app-domain `Provider` contains no user ID, phone, email, exact coordinates, private object reference, document/review reason, restriction detail, financial field, or internal score. The customer profile keeps Request a Quote as its only primary action.

## 8. RLS and grants

| Resource | Owner | Other worker/customer | Anonymous | Discoverable public |
| --- | --- | --- | --- | --- |
| Provider draft | Read through owner policy/RPC | Denied | Denied | Sanitized fields only |
| Services/areas | Owner read | Draft denied | Draft denied | Active/approximate only |
| Portfolio metadata | Owner CRUD | Draft denied | Draft denied | Published item only |
| Portfolio image object | Owner CRUD/read | Draft denied | Draft denied | Authorized signed read only |
| Certificate metadata | Owner read/mutate via RPC; staff review | Denied | Denied | Boolean/count only |
| Certificate object | Owner/staff signed read | Denied | Denied | Never |
| Verification reason/docs | Existing owner/staff rules | Denied | Denied | Existing booleans only |

Sensitive tables are not added to Realtime publication. Table write grants remain revoked where aggregate RPCs enforce invariants.

## 9. UI

`app/provider-mode.tsx` becomes a short-profile workspace with five checklist items and separate large actions for portfolio and certificates. Profile form sections are identity/introduction, services, area/availability, and review/save. Pricing maintenance and weekly schedules are absent. Photo select uses SDK 54 Image Picker crop; delete has confirmation and failure copy.

Portfolio and certificate screens use large labeled controls, bounded inputs, explicit statuses, retryable actions, privacy warnings, RTL row reversal, fallback/empty/error states, and no social affordances. `app/provider/[id].tsx` renders only sanitized fields, authorized media, existing verified reviews/replies, and Request a Quote.

## 10. Validation and operations

Automated checks cover pure validation, account-scoped Mock persistence, repository mode isolation, photo rollback semantics, duplicate upload rejection, localization/RTL/accessibility source contracts, catalog field denial, RLS, Storage, gate behavior, verification/review integration, and migration API shape.

The migration is validated by clean local reset and all pgTAP files. Android, iOS, and web exports each use a separate cleared cache/output directory. `supabase migration list --linked` and `supabase db push --linked --dry-run` are observation only. The safe production command is reported but not executed.
