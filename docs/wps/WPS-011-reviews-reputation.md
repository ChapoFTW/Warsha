# WPS-011 — Reviews & Reputation

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **LOCKED FOR LOCAL IMPLEMENTATION — MANUAL AND HOSTED ACCEPTANCE PENDING** |
| Depends on | Constitution and WPS-001 through WPS-010 |
| Engineering specification | `docs/wes/WES-011-reviews-reputation.md` |

Authority order is the Warsha Constitution, WPS-011, WES-011, then implementation. WPS-011 extends the existing completed-booking review, provider reply, trust, profile, marketplace, notification, Realtime, and private-media systems. It does not replace them or authorize review-driven marketplace ranking.

## 2. Purpose and product contract

Reviews provide accountable evidence from completed Warsha work. Reputation summarizes evidence customers can understand without exposing internal moderation, contact, financial, matching, or abuse data. Reviews are never generated or summarized by AI.

Only the booking customer may review a completed booking. One permanent review row is linked to each booking. The provider may publish one public reply; the reply is immutable after publication.

## 3. Review creation and editing

New reviews require integer scores from 1 through 5 for overall, professionalism, quality, punctuality, communication, and value. Existing overall-only reviews are preserved and backfilled across the five dimensions using their original overall score; the migration never invents new written claims.

The customer may edit scores, comment, anonymity choice, and attached photos for 72 hours after first publication. The window is stored in private configuration and may be changed by a forward approved product decision within 1–168 hours. Edits update the same review, retain the completed-booking link, increment a revision, and append a private audit event. Customers cannot delete reviews or edit after the deadline. Staff moderation does not extend the edit deadline.

## 4. Review photos

Up to four optional JPEG, PNG, or WebP images of at most 5 MB each use the existing private `review-attachments` bucket. Authenticated customer/booking-scoped immutable names are required. Bucket controls and server registration validate MIME, size, ownership, completed booking, safe path, and count. Public clients receive only short-lived signed renditions for visible reviews, never public URLs or raw paths.

## 5. Provider reply

The provider attached to the reviewed booking may publish one reply of 1–1,500 characters. Publication is idempotent for retry safety. The reply cannot be edited or deleted by the provider. A hidden review also hides its reply from public projections while preserving participant and staff access.

## 6. Helpful voting

Authenticated customers and workers may mark a visible review Helpful or Not Helpful. One current vote exists per account and review; changing direction updates that row instead of creating a duplicate. The review author and reviewed provider cannot vote on that review. Public totals expose only aggregate helpful/not-helpful counts. Voter identity is private and votes do not affect marketplace ranking or the confidence score.

## 7. Reporting and moderation

Authenticated users may report a visible review for `spam`, `abuse`, `fake_review`, or `offensive_content`, with optional bounded details. One active report per reporter and review is retained. Reports and reporter identities are owner/staff-only and never appear in public review projections.

Authorized staff may move reports through submitted, in-review, resolved, or dismissed states and may soft-hide or restore a review with a required reason. Every transition appends immutable staff-attributed audit history. Hiding removes the review, reply, images, votes, and rating contribution from public projections; it does not delete the review, booking link, participant access, report, or audit trail. One report never causes automatic suspension or ranking punishment.

## 8. Public review presentation

Provider profiles show visible verified-booking reviews with sanitized reviewer names, date, six scores, bounded comment, authorized photos, optional immutable reply, and helpful totals. They support Newest, Highest rated, Lowest rated, and Most helpful sorting. No public response includes reviewer phone, email, account ID, exact address, moderation fields, reports, voters, raw object paths, or staff data.

## 9. Reputation summary

The sanitized provider reputation summary contains:

- average overall rating, overall distribution, visible review count, and five dimension averages;
- completed Warsha jobs;
- 180-day quote-invitation response rate, using eligible invitations and explicit quote/decline responses only;
- completion rate based on completed bookings versus completed bookings plus explicit confirmed worker-caused cancellations/no-shows;
- repeat-customer percentage, defined as completed-job customers with at least two completed jobs divided by all distinct completed-job customers;
- full years on Warsha, measured from provider creation;
- existing approved identity, Skill Certificate, and professional-certificate indicators.

Zero-denominator rates are returned as unavailable, never fabricated as 0% or 100%.

## 10. Trust badges and confidence

Identity Verified, Skill Certificate Verified, and Professional Certificate Verified reuse WPS-006/WPS-010 approval state. Additional deterministic badges are:

- **Top Rated:** at least 20 visible reviews, average at least 4.7, and completion rate at least 90%;
- **Fast Responder:** at least 10 eligible invitations in 180 days and response rate at least 90%;
- **Experienced:** at least 50 completed Warsha jobs or three full years on Warsha.

The public confidence score is informational and versioned as `wps011-v1`: rating 40 points, completion 25, response 15, repeat customers 10, and review volume 10 capped at 20 reviews. Missing rates contribute zero and the payload states evidence sufficiency. The score and badges cannot alter eligibility, invitation ranking, quote comparison, pricing, account restrictions, or moderation decisions without a later locked WPS.

## 11. Reviews, profiles, and marketplace boundaries

WPS-004 remains authoritative for completion. WPS-006 remains authoritative for identity and verified-booking review foundations. WPS-008 remains authoritative for marketplace ranking and explicitly cannot consume WPS-011 confidence or helpful votes. WPS-010 remains authoritative for the public profile and trust projection. WPS-005/009 notification and Realtime privacy rules remain unchanged.

## 12. Privacy and security

- Mutations derive the actor from `auth.uid()` and the booking/provider relationship from server rows.
- Direct review, reply, report, vote, moderation, and attachment-metadata writes are denied to clients.
- Public read APIs are security-definer only where sanitization and signed-media authorization require it, use empty `search_path`, and have minimal grants.
- Owner/participant and staff reads follow existing RLS conventions; unrelated accounts cannot read private reports, voter identity, moderation reasons, or audit events.
- Private tables and object paths are not added to Realtime publication.

## 13. Mock, localization, accessibility, and brand

Mock implements the same completed-booking, one-review, edit-window, dimensions, photos, reply, vote, report, sorting, moderation, reputation, and account-isolation rules without Supabase calls or fallback writes. English and natural Egyptian Arabic cover labels, states, errors, reporting reasons, reputation metrics, and badges. Rows, chips, galleries, and score controls respect RTL, screen-reader labels/states, 44-point targets, loading/empty/error states, and 320 CSS-pixel layouts.

The only active motto is English `YOUR WORK, OUR MISSION` and Arabic `شغلك مهمتنا`. Constitution mission prose is not an active UI motto.

## 14. Deferred features

AI summaries, sentiment analysis, automated moderation, fraud scoring, reviewer contact exposure, review deletion, reply editing, public moderation explanations, helpful-vote ranking, confidence-driven marketplace ranking, production staff console, push delivery, and retention schedulers are deferred.

## 15. Acceptance boundary

WPS-011 is local-only until clean database, full pgTAP, regression, Doctor, Android/iOS/web export, repository-wide motto, linked-ledger dry-run, security, accessibility, and manual evidence are reviewed. Manual cases begin **NOT RUN**. No hosted migration or provider activation is authorized.
