# WPS-013 Acceptance Evidence

## Scope and verdict

WPS-013 is implemented locally by extending the canonical booking-linked dispute tables and the existing WPS-004 booking, WPS-005 notification, WPS-007 financial, WPS-008 no-show, WPS-009 communication, WPS-011 review, and WPS-012 operation systems. It creates no parallel booking, conversation, financial ledger, review, return-visit, verification, profile, or ranking system. Manual acceptance and fresh hosted comparison remain pending. No hosted migration/deployment, live payment, SMS, telephony, push delivery, webhook, scheduler, or irreversible operation was executed.

## Automated evidence

This table is updated from executed gates before handoff; a failed or unrun gate is never recorded as passed.

| Gate | Result | Evidence |
| --- | --- | --- |
| Clean local database reset | PASS | All forward migrations through `202608020001` plus seed |
| Focused WPS-013 pgTAP | PASS | 1 file / 94 assertions |
| WPS-013 TypeScript regression | PASS | 182 architecture/product/security contracts |
| TypeScript | PASS | `npm.cmd run typecheck` |
| ESLint | PASS | `npm.cmd run lint` |
| Mojibake | PASS | `npm.cmd run check:mojibake` reported no likely mojibake |
| Patch whitespace | PASS | `git diff --check` (line-ending notices only) |
| Existing regressions | PASS | 13 package suites; 631 enumerated checks plus 4 qualitative behavioral suites |
| Full pgTAP | PASS | 16 files / 1,123 assertions |
| Expo Doctor | PASS | 18/18 checks |
| Android/iOS/Web export | PASS | Android and iOS bundles; web static export with 30 routes |
| Local migration list | PASS | Ledger complete through `202608020001` |
| Linked list/dry-run | BLOCKED EXTERNALLY | Both read-only attempts failed during login-role initialization with `LegacyDbConfigLoginRoleNetworkError` / `TransportError`; dry-run banner confirmed no push |
| Manual alpha | NOT RUN | 60/60 cases remain NOT RUN |

The implementation was checked against the exact Expo SDK 54 ImagePicker, DocumentPicker, FileSystem, and Image documentation before client code.

## Architecture evidence

- The dormant `disputes`, `dispute_evidence`, and private `dispute-evidence` bucket are extended forward.
- `dispute_events` is the append-only case timeline; direct writes are revoked and an immutable trigger rejects privileged update/delete.
- Eligibility, role, one-active-case rule, transitions, evidence metadata, staff assignment, and resolution are server authoritative.
- Existing booking/operation/chat/review/no-show/warranty records are referenced or counted, not copied or summarized.
- Participant responses/statuses project into the existing WPS-009 conversation. Staff-private notes never project.
- Partial compensation delegates to WPS-007; return/warranty outcomes create one WPS-012 return section on the same booking.
- A submitted active case can temporarily hold one WPS-011 review from public reputation; it never changes review content, score, badge, confidence, or ranking.

## Security and Storage evidence

- Customer draft privacy; assigned-worker post-submit access; participant/staff RLS; unrelated denial.
- Empty-search-path security-definer RPCs, bounded input, row locks, idempotency, minimal table grants.
- Staff-only timeline visibility is filtered in RLS and guarded projections.
- Private 8 MB bucket permits only JPEG, PNG, WebP, HEIC, and PDF.
- Path binds authenticated uploader, booking, and dispute. Registration verifies actual owner, participant, state, MIME, size, count, safe filename, content identity, and retry ID.
- Only unregistered staged objects have an owner cleanup path. Registered evidence is immutable and read by 15-minute signed URL.
- Realtime publishes only participant-scoped dispute/invalidation rows, not evidence metadata or private schema data.

## Public/private data matrix

| Data/action | Customer | Assigned worker | Authorized staff | Public/unrelated |
| --- | --- | --- | --- | --- |
| Draft aggregate/events | Own only | Hidden | Read | Denied |
| Submitted aggregate/events | Own booking | Assigned booking | Read/action | Denied |
| Staff-private note | Hidden | Hidden | Read/write | Denied |
| Evidence metadata/object | Upload/signed read | Upload/signed read after submit | Signed read | Denied |
| Registered evidence delete | Denied | Denied | No participant path | Denied |
| Booking/operation evidence | Existing participant rules | Existing participant rules | Existing staff rules | Existing sanitized rules only |
| Financial reference | Safe outcome class | Safe outcome class | Existing finance authority | Denied |
| Review under case hold | Participant access | Provider participant access | Moderation access | Absent while held |
| Public profile/reputation | No case fields | No case fields | No new public fields | Existing sanitized projection only |

## Mock, localization, accessibility

Mock is selected statically and enforces the same account role, eligibility, active-case, transition, idempotency, evidence MIME/size/count/duplicate, response, staff-note visibility, resolution/delegation, notification, and return-reference rules. Submitted cases apply the same review-publication hold without overriding staff-hidden state, and participant-visible case events are projected into both participants' existing Mock booking conversation. Supabase failures do not fall back.

English and Egyptian Arabic cover all reasons/states/actions, evidence and privacy copy, responses, outcomes, loading/empty/error/retry states, notification titles/bodies, and conversation system events. UI rows reverse for RTL, choices wrap, text aligns by locale, controls meet 44-point targets, and radio/button/link labels and selected/disabled/busy states are exposed. Automated contracts are evidence; physical TalkBack/VoiceOver/RTL/device acceptance remains NOT RUN.

## Motto audit

The only active motto is exactly English `YOUR WORK, OUR MISSION` and Arabic `شغلك مهمتنا`. No active outdated variant was found and no motto correction was required in WPS-013. The negative strings in `scripts/device-p1-regressions.test.mts` are intentional absence assertions.

| Requested location | Repository locations checked | Result |
| --- | --- | --- |
| Splash | `app.json`, `scripts/render-brand-assets.ps1`, `assets/images/warsha-current-approved-splash.png` (visual inspection) | Active splash visibly reads `YOUR WORK, OUR MISSION`; config selects it |
| Onboarding | `app/(tabs)/profile.tsx` role choice/worker creation, `app/provider-mode.tsx` provider setup | Approved shared lockup; no tagline variant |
| Authentication | `app/(tabs)/profile.tsx`, `app/reset-password.tsx`, `src/auth/`, `src/auth/auth-translations.ts` | Approved lockup/copy; no tagline variant |
| Home | `app/(tabs)/index.tsx`, `components/warsha/Header.tsx` | Approved shared lockup; no tagline variant |
| Profile | `app/(tabs)/profile.tsx`, `app/provider-mode.tsx`, provider profile routes | Approved shared lockup; no tagline variant |
| Settings | Authenticated account/preferences area in `app/(tabs)/profile.tsx`; there is no separate settings route | No tagline variant |
| Notifications | `app/notifications.tsx`, `components/warsha/NotificationBanner.tsx`, notification translation catalogs | No tagline variant; WPS-013 copy localized |
| HTML | `app/+html.tsx` | Exact English motto in description and Open Graph metadata |
| Web manifest | `public/manifest.webmanifest` | Exact English motto and approved 192/512 icons |
| App config | `app.json` | Approved icon, notification, favicon, adaptive/monochrome, and splash assets |
| Docs | Active brand/WPS/WES/decision/testing docs, including WPS-009/011/012/013 | Exact bilingual authority; no active superseded motto |
| Tests | Brand, Device P1, WPS-009/011/012/013 regression scripts | Exact bilingual locks; obsolete variants asserted absent |
| Assets | Eight active approved native/web assets plus renderer | All eight pass dimensions/transparency regression; SHA-256 inventory captured during audit |

## Release gate

Local automated engineering verdict is **PASS**. Hosted release remains **HOLD** until a fresh linked ledger/dry-run is reviewed, the pending chain is approved, and manual alpha is executed. Relative to the last successfully verified hosted migration `202607290002`, the candidate chain is `202607300001`, `202607300002`, `202607310001`-`202607310003`, `202608010001`-`202608010006`, and `202608020001`; the failed fresh comparison means this is not claimed as a current hosted observation. The documented deployment command is `npx.cmd supabase db push --linked`; it was **not executed**.
