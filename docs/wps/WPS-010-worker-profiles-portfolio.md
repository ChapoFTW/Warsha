# WPS-010 — Worker Profiles & Portfolio

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED — IMPLEMENTED LOCALLY, MANUAL ACCEPTANCE PENDING** |
| Depends on | Constitution and WPS-001 through WPS-009 |
| Engineering specification | `docs/wes/WES-010-worker-profiles-portfolio.md` |

Authority order is the Warsha Constitution, WPS-010, WES-010, then implementation. WPS-010 extends the independent-worker, verification, review, marketplace, financial, and communication foundations; it does not create a business/team model or a second trust system.

## 2. Purpose and product contract

A worker profile helps a customer decide who the worker is, whether Warsha verified the worker, what work the worker offers, whether similar work is demonstrated, whether past customers were satisfied, whether the worker is approximately nearby and available, and whether to request a quote.

The launch model remains an independent worker using large actions, short forms, minimal text, and natural Egyptian Arabic. Business/team features are additive future work.

The primary customer action is **Request a Quote**. The existing WPS-008 targeted request, worker quote/decline, customer selection, worker confirmation, and booking conversion remain authoritative. Fixed-price direct booking is not required by this profile.

## 3. Customer-visible profile

A discoverable profile may show only:

- display name and authorized profile-photo rendition;
- selected launch categories and active services;
- biography, years of experience, short experience summary, and self-declared specialties;
- approximate base governorate/district, rounded travel radius, and request-relative distance where an existing authorized flow calculates it;
- binary availability;
- sanitized identity, Skill Certificate, and relevant-certificate indicators;
- aggregate rating, review count, completed Warsha jobs, and existing verified-booking reviews/replies;
- approved portfolio items and authorized image renditions;
- configured warranty and supported payment methods;
- Request a Quote.

Warsha does not expose identity numbers or documents, exact home address or coordinates, phone, email, raw Storage paths, certificate files, staff notes, rejection reasons, financial data, internal trust/matching/cancellation scores, cash debt, hidden price classes, or restriction details. Repeat-customer indicators remain deferred because no authoritative aggregate exists. Optional price display remains limited to already-supported catalog data and is not required during worker setup.

## 4. Worker-managed profile

The worker can manage:

- one profile photo;
- display name and a 20–500 character practical biography;
- 0–80 years of self-declared experience, an optional summary up to 500 characters, and up to 10 specialties of 50 characters each;
- services from the existing ten launch categories, without mandatory manual prices;
- an approximate governorate/district and a 1–250 km maximum travel radius;
- up to 12 portfolio items;
- the existing optional Skill Certificate workflow and other relevant professional certificates;
- Available or Unavailable.

Draft saving never depends on completion. Weekly schedules, complicated hours, ranking controls, pricing-position labels, internal metrics, cancellation statistics, gamification, levels, artificial achievements, team/fleet/branch tools, and analytics dashboards are excluded.

## 5. Completion and public discovery

The private checklist has five plain items: add a photo, write an introduction, select at least one supported service, add a work area, and submit identity verification. Portfolio work photos and optional certificates are encouraged but do not block submission.

A public profile is discoverable only when all of these are true:

1. its linked authentication account exists, is not deleted or currently banned, and has a confirmed phone;
2. provider status is approved, published, not deleted, and not suspended;
3. identity verification is approved and unexpired, and the protected provider verification flag agrees;
4. display name is 2–100 characters, biography is 20–500 characters, and a private profile-photo object is registered;
5. at least one active supported service and one valid approximate service area exist.

Draft, incomplete, unverified, expired, suspended, deleted, or restricted workers remain hidden. Availability affects matching and customer display but does not delete the profile.

## 6. Profile photo

- The bucket is private and authenticated writes use an account-owned path.
- JPEG, PNG, WebP, HEIC, and HEIF are accepted up to 5 MB.
- Expo Image Picker provides a square crop/preview path; a neutral fallback avatar remains visible.
- Replacement uploads to a new immutable object, validates and registers it transactionally, and deletes the prior object only after success. Failed upload or registration leaves the prior photo registered and readable.
- Deletion clears metadata first and removes the former object afterward as best-effort cleanup.
- UI and public catalog models receive only short-lived authorized URLs, never public URLs or raw paths.

## 7. Biography and experience

Copy asks what work the worker does, how long they have done it, and where they normally work. It avoids formal résumé language. Experience and specialties are labeled as worker-provided; verified certificate indicators are visually and semantically separate. Future text assistance may rewrite wording only and must not invent claims; it is not implemented in WPS-010.

## 8. Services and service area

Only active services under the ten locked launch categories are selectable. WPS-010 removes mandatory worker-maintained prices, transport fees, emergency surcharges, and pricing-model setup from the profile form. Existing stored/catalog pricing remains compatible, while historical intelligence continues to come from completed work.

The worker supplies governorate, optional district, and maximum radius. Public copy is area-level. Latitude, longitude, and radius geometry are never included in the public projection.

## 9. Portfolio

Each worker-owned item has a title of 2–80 characters, description up to 500 characters, optional category/service, optional `YYYY`, `YYYY-MM`, or free approximate period up to 40 characters, explicit draft/published state, and 1–5 ordered images. A worker may keep at most 12 non-deleted items. Images are JPEG, PNG, WebP, HEIC, or HEIF, at most 8 MB each and 40 MB per item.

File-content fingerprints prevent duplicate images for a worker. An upload is first written to a unique private path, then registered; registration failure removes the new object. Reorder is transactional. Metadata deletion precedes best-effort object cleanup. Failed uploads remain retryable without creating metadata duplicates.

Draft items are owner/staff-only. A published item is customer-visible only while its owner passes the full discoverability gate. Retrieval uses short-lived authorized URLs. The UI warns against customer names, faces without consent, phone numbers, addresses, payment details, and other identifying information. Likes, followers, and social behavior are excluded.

## 10. Certificates

Skill Certificate / شهادة قياس مهارة remains part of the existing verification record and private `verification-documents` flow. Other professional certificates use the existing provider-certification record with private PDF/JPEG/PNG upload up to 8 MB, a title, optional issuer, optional expiry, and `draft`, `submitted`, `approved`, `rejected`, or `expired` status.

Workers can read their metadata, private preview, status, and private rejection reason. Staff can approve, reject with a reason, or expire a submission. Customers receive only a sanitized approved-certificate indicator/count; no certificate path, file, issuer, expiry, reviewer, or rejection detail is public. Optional submissions are not presented as legal requirements. Criminal-record certificates remain outside MVP pending legal review.

## 11. Trust, reviews, and payments

Meaningful trust indicators are identity verified, Skill Certificate verified, relevant-certificate verified, rating, review count, and completed Warsha jobs. There is no Premium label, top-worker claim, XP, level, or decorative badge.

The existing verified-completed-booking review source and provider replies are reused. Fixtures remain visibly Mock-only and never become Supabase production reviews. Supported payment methods may be shown only when supplied by the existing marketplace/financial capability; profile management does not activate money movement.

## 12. Privacy and access rules

- Owners may read their own draft profile, services, areas, portfolio metadata/images, and certificate metadata/files.
- Another worker, customer, or anonymous session cannot read draft records or private documents.
- Public table policies use the same full discoverability helper as sanitized RPCs.
- Public catalog RPCs omit ownership IDs, contact details, exact geometry, private paths, review reasons, staff data, and financial/internal fields.
- Storage uses minimal bucket-specific policies. Sensitive certificate documents never receive public read access or Realtime publication.
- Aggregate mutation RPCs derive the worker from `auth.uid()`, use `SECURITY DEFINER` only where validation/atomicity requires it, set an empty `search_path`, and have minimal grants.

## 13. Mock and localization contract

Mock and Supabase repositories are selected once from environment configuration; neither calls nor falls back to the other. Mock keys and media directories are account-scoped. Mock supports draft/save, private photo replacement/deletion, services/area, portfolio CRUD/reorder/deduplication, certificate status simulation, verification visibility, reviews, and discoverability semantics.

All new customer and worker copy is available in English and natural Egyptian Arabic. Rows, actions, fields, and horizontal collections respect RTL. Controls expose roles, labels, states, disabled states, and minimum touch sizes; the form remains usable at 320 CSS pixels without horizontal page overflow.

## 14. Deferred features

Business employees, dispatch, teams, schedules, fleet/branch management, professional résumé tooling, AI-generated claims, portfolio social features, public certificate downloads, criminal-record documents, OCR/moderation automation, exact public geography, repeat-customer claims, live payment/SMS/call/payout/webhook/scheduler activation, and a staff console are deferred.

## 15. Acceptance boundary

WPS-010 is implemented locally only. Automated validation must include client contracts, Mock isolation, a clean local Supabase reset, all pgTAP suites, Expo Doctor, cache-cleared Android/iOS/web exports, migration ledger inspection, and a hosted dry-run that cannot mutate. Manual cases remain **NOT RUN** until executed and signed. No hosted migration is authorized by this specification.
