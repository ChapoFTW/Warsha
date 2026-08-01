# WPS-006 - Trust, Reviews & Verification

## Document metadata

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** |
| Authority | Warsha Constitution |
| Source | Existing repository, migrations, tests, and implemented behavior |

## 1. Purpose and authority

This baseline records implemented trust, review, and worker-verification behavior. It does not create a public badge system, guarantee, automatic punishment, or staff power beyond existing guarded contracts.

Primary evidence includes `src/reviews`, `src/verification`, trust/review components, migrations `202607270001`, `202607290001`, `202607290002`, `202607310001`, and the 60-assertion reviews, 99-assertion verification, RLS, and alignment suites.

## 2. Reviews

- Only the customer attached to an eligible completed booking may submit a review.
- One review is allowed per booking. Rating must be an integer from 1 through 5; comment is optional and bounded.
- A review currently has one overall rating, not the future multi-dimensional quality/professionalism/punctuality/value/cleanliness model.
- Up to four customer images are accepted by the UI; server/object policy validates bounded JPG, PNG, or WebP data and private customer/booking-scoped paths.
- Review rows support visible/hidden moderation state and anonymous public presentation preparation. Participant access is preserved where required.
- A worker may post one bounded reply to a review on that worker's booking. Replies are not editable in the implemented contract.

## 3. Rating summaries and public presentation

- `get_provider_rating_summary(uuid)` returns a sanitized average, count, distribution, and permitted reviews/replies.
- Provider profile aggregates are updated from visible reviews rather than trusted client values.
- Public worker profiles display overall rating volume and review content without exposing private customer account data.
- Ranking must consider volume as well as average under WPS-008; the full ranking engine is not part of this baseline.

## 4. Review notifications and Realtime

- Review submission creates a deduplicated worker notification; worker reply creates a deduplicated customer notification.
- Review, reply, and attachment tables provide scoped Realtime invalidations. Clients reload sanitized authoritative projections.
- Mock review submission/reply follows one-review/one-reply rules and emits matching local notification/invalidation behavior.

## 5. Worker identity verification

- Verification states are not started, draft, submitted, under review, approved, rejected, requires resubmission, and expired.
- Required identity evidence is National ID front, National ID back, and selfie.
- The Skill Certificate question is required at submission, but answering **no** is valid. Its document and approval are optional.
- Additional document types are modeled for trade license, qualification, and other evidence, but they are not general launch requirements.
- Submission validates complete owned evidence, increments an auditable revision, and locks deletion until an editable state returns.
- Staff review is guarded by explicit staff role, allowed transitions, evidence completeness, reason requirements, audit logging, expiry, and notification dedupe.

## 6. Private identity and document handling

- Verification objects are stored in the private `verification-documents` bucket with owner/staff policies and short-lived signed owner previews.
- Allowed types and 8 MB server/client limits are enforced. Paths are Auth-user/provider/type scoped.
- The raw National ID is not stored in public tables, responses, notifications, or logs. The database retains a one-way identity hash and last four digits in the private schema for controlled support/deduplication needs.
- Normal clients cannot read the private identity table or another worker's documents.

## 7. Discovery gating and trust indicators

- **Previous behavior:** published/approved worker profiles could be discovered without requiring the implemented identity-verification workflow.
- **Current aligned behavior:** `202607310001_repository_alignment.sql` requires published, approved, non-deleted profile state plus approved verification and `is_verified=true` for public discovery, trust projection, active service exposure, and direct booking compatibility.
- The public marketplace catalog is a sanitized security-definer RPC. It exposes only approved public profile/service data and the booleans `is_verified` and `skill_certificate_verified`.
- `get_provider_trust_indicators(uuid)` returns only `identityVerified` and `skillCertificateVerified` for a discoverable worker; an ineligible/unverified worker receives an empty projection.
- Verification documents, status history, rejection reasons, user IDs, temporary unavailability, National ID material, and staff notes are not public trust fields.

## 8. Customer-visible and worker-visible behavior

- Customers see Verified Identity and, independently, Verified Skill Certificate when true. No indicator is rendered when neither applies.
- Workers see their verification status, missing evidence, rejection/resubmission reason, document previews, and the next permitted action.
- Workers cannot self-approve identity or Skill Certificate evidence.
- A worker losing approved identity status is removed from new public discovery. Existing booking rights remain participant-scoped and are not erased by discovery removal.

## 9. Moderation and future preparation

- Review visibility/moderation columns, audit logs, staff roles, support/dispute schema, and verification review contracts provide preparation for staff operations.
- No production moderation dashboard, automated abuse decision, public customer trust score, or automatic suspension from one review/report is implemented.
- Multi-dimensional reviews, customer private ratings, warranty evidence decisions, formal moderation SLAs, and retention/deletion schedules are **FUTURE / DEFERRED** unless a later locked specification governs them.

## 10. Existing limitations

- Staff verification is RPC/test/harness based; the repository has no production admin review UI.
- Mock staff review is a development simulation and is not production authority.
- No legal identity vendor, liveness provider, criminal/background check, or production document-retention policy is integrated.
- No review report/moderation UI, customer private rating UI, or automated fraud model is complete.
- Manual document-camera, signed-URL expiry, moderation, Arabic/RTL, and accessibility results are not recorded as passed.

WPS-011 supersedes the review limitations in Sections 2, 3, and 9 by defining multidimensional ratings, a bounded edit window, helpful voting, reports, audited moderation, and deterministic reputation summaries. WPS-006 remains authoritative for identity and verified-booking eligibility foundations.

