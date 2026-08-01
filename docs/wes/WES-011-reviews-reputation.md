# WES-011 — Reviews & Reputation

## 1. Status and architecture

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **IMPLEMENTED LOCALLY — MANUAL AND HOSTED DEPLOYMENT GATED** |
| Product authority | `docs/wps/WPS-011-reviews-reputation.md` |

WPS-011 extends `reviews`, `review_responses`, `review_attachments`, private Storage, booking authority, provider trust/catalog projections, `src/reviews`, provider profile review components, notifications, Realtime invalidation, and Mock storage. No parallel review or reputation subsystem is permitted.

## 2. Existing-system audit

The baseline already provides completed-booking submission, booking uniqueness, private four-image storage, visible/hidden review state, sanitized public reviewer initials, one provider reply, rating aggregation, participant RLS, notifications, Realtime invalidation, Mock persistence, customer submission UI, provider reply UI, and profile summaries. Missing capabilities are dimensions, edit deadlines/history, reporting workflow, immutable moderation audit, helpful voting/sorts, complete reputation metrics/badges/confidence, and full localized UI.

## 3. Forward schema

Migration `202608010005_wps011_reviews_reputation.sql`:

- adds five bounded dimension columns, `edit_deadline_at`, and `revision` to `reviews`;
- adds server-authoritative byte size/content hash/order fields to review attachments;
- creates private `review_edit_events`, `review_reports`, `review_report_events`, `review_helpfulness_votes`, and `review_moderation_events` records;
- stores the 72-hour edit policy in private configuration;
- preserves old reviews and backfills dimensions from their original score;
- adds only indexes, constraints, policies, grants, and functions required by WPS-011.

## 4. RPC contract

Customer mutations are `submit_booking_review_v2`, `edit_booking_review`, `vote_review_helpfulness`, and `report_review`. Provider mutation remains `reply_to_booking_review`. Staff mutations are `review_report_transition` and `moderate_review`. Reads are `get_booking_review_v2`, `get_provider_reputation_summary`, and owner/staff report views. Legacy review functions remain compatible but public clients use WPS-011 projections.

## 5. Reputation engine

`private.provider_reputation(uuid)` calculates WPS-011 metrics from visible reviews, completed bookings, explicit reviewed worker-caused failure events, quote invitations, provider creation time, and existing verification/certificate helpers. It returns versioned deterministic evidence and badge booleans. Helpful totals are presentation-only. No trigger writes confidence into ranking tables.

## 6. Review projection and sorting

The public summary accepts `newest`, `highest_rated`, `lowest_rated`, or `most_helpful`, plus bounded limit/offset. Stable ties use creation time then review ID. The projection contains sanitized initials, verified-booking marker, scores, comment, signed-media references for adapter hydration, reply, aggregates, and vote totals. Internal path keys are adapter-only and never retained in domain/UI state.

## 7. Storage engineering

The existing `review-attachments` bucket remains private at 5 MB and JPEG/PNG/WebP only. Object names are immutable UUID-like safe names under `{auth.uid()}/{booking_id}/review/`. Storage insertion confirms the authenticated completed-booking customer. Metadata registration confirms object owner, MIME, size, safe path, count, and duplicate content hash. Visible-review object SELECT permits signed-URL creation; it does not create public object URLs.

## 8. RLS, grants, and audit

Review participants retain scoped access to their hidden reviews. Reporters read their reports; staff read all reports and audit rows. Vote rows are self-readable only. Public access occurs through sanitized RPCs. Client table writes remain revoked. Definer functions use `set search_path=''`; private helpers have no public execution; staff mutations recheck `private.is_staff()`. Private records are not in `supabase_realtime`.

## 9. Client, Mock, and account isolation

The review repository exposes submit/edit, booking detail, sorted provider reputation, immutable reply, vote, report, and Mock-only moderation simulation. Mock keys include the authenticated account scope; provider/customer switching resets visible state and never copies private review actions. The repository is selected statically from `EXPO_PUBLIC_DATA_MODE`; errors propagate without fallback writes.

## 10. UI, localization, and accessibility

The completed-booking card collects six star scores, optional comment/photos, displays the deadline, and permits edits only inside it. Provider profiles show reputation metrics, meaningful trust badges, dimension breakdown, sorting, photos, replies, helpful voting, and reporting. English/Egyptian Arabic translations, RTL direction, accessible star/radio states, labelled images/actions, loading/empty/error/retry states, and small-screen wrapping are required.

## 11. Motto audit

Audit splash renderers/assets, onboarding, authentication, home, profiles, settings, notifications, `app/+html.tsx`, `public/manifest.webmanifest`, `app.json`, brand docs, tests, and asset-generation scripts. Active surfaces must contain only `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`; Constitution mission prose may remain only as constitutional context.

## 12. Testing and operations

Add dedicated TypeScript contracts and pgTAP covering eligibility, uniqueness, edit expiry/audit, immutable replies, reports/moderation, soft-hide, votes, sort order, dimensions, reputation formulas/badges, privacy, storage constraints, Mock isolation, localization/RTL/accessibility, public projection sanitation, and motto exactness. Run all existing suites, clean local reset, all pgTAP, Expo Doctor, cache-cleared platform exports, local ledger, and linked dry-run only. Manual status begins **NOT RUN**; no hosted push is executed.
