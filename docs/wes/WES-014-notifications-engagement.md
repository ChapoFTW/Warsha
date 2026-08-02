# WES-014 — Notifications & Engagement

## 1. Metadata and authority

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **ENGINEERING BASELINE** |
| Implements | WPS-014 |
| Authority | Constitution → WPS-014 → WES-014 |
| Forward migration | `202608020002_wps014_notifications_engagement.sql` |

WPS-014 extends `public.notifications`, existing notification producers, `notification_preferences`, centralized Realtime, `src/notifications`, the notification screen/banner/badges, and account-scoped Mock storage. It creates no parallel event or domain mutation system.

## 2. Existing-system audit

| Area | Audited baseline | WPS-014 treatment |
| --- | --- | --- |
| Durable source | `public.notifications` with owner RLS, title/body/data, read/dismiss timestamps | Reuse; add server metadata, archive, grouping, source relationship, safe preview, and authoritative read RPCs |
| Producers | Booking, marketplace, message, verification, finance, review, operations, and disputes insert server-side | Preserve transactions; normalize at the shared insert boundary and add only missing source-table triggers |
| Dedupe | Partial unique `(user_id,type,dedupe_key)` | Preserve exact retry idempotency; add immutable source links and group rules |
| Preferences | Legacy push/email/SMS booleans, direct owner CRUD, push defaults true | Revoke direct writes; add guarded simple category/quiet-hour RPC; force push disabled |
| Read/dismiss | Guarded owner RPCs; direct SELECT list/count | Replace client reads/counts with sanitized RPCs; keep wrappers; map dismiss to archive |
| Routing | Client regex/type checks; marketplace rows with camelCase payloads are often inert | Add normalized safe identifiers and guarded route resolution |
| Realtime | One owner-filtered channel; reload on event/reconnect/foreground | Reuse; coalesce invalidations and clear on account/mode changes |
| Badge | Client queries notification count; chat inbox has separate watermark unread | Return authoritative global/category/chat counts in one RPC |
| Mock | One fixed notification key and no recipient/mode isolation | Versioned account keys and explicit recipient/audience parity |
| Push | No package/provider/token/handler | Provider-neutral disabled adapter and private fail-closed contracts only |
| UI | One inbox, mark all/read/dismiss, banner, pagination | Add categories/priorities/group counts/archive/preferences/fallback/action labels |
| Privacy | Most payloads are minimal; some legacy marketplace payloads include non-routing fields | Sanitize all future and retained payloads to allowlisted IDs; generic stored previews |
| Duplicate behavior | WPS-012 legacy sync can pair coarse booking and operation updates | Forward-replace booking side-effect helper to let fine-grained operation event own those milestones |

## 3. Forward schema

Migration `202608020002_wps014_notifications_engagement.sql`:

- extends `notifications` with category, priority, audience, action/route metadata, source key/event, group key/count, latest event, archive, and required-action state;
- sanitizes existing payloads, maps dismissal to archive, derives metadata, and backfills source links;
- extends `notification_preferences` with simple category JSON, quiet hours, IANA timezone, generic preview, and push-off defaults;
- adds private type/template/configuration, immutable `private.notification_source_links`, delivery attempts, disabled token records, reminder jobs, and privacy-safe operational events;
- adds normalized insert/group/source triggers and narrowly scoped missing-domain triggers;
- adds guarded inbox, counts, read/all-read, archive, preferences, route-resolution, token, and private processing contracts;
- retains old RPC names as secure compatibility wrappers; and
- replaces no prior migration or historical row.

## 4. Server normalization

`private.prepare_notification` is the single insert boundary. It resolves the private catalog rule, normalizes snake/camel route identifiers, strips every non-allowlisted payload field, derives audience from the target domain relationship, applies mandatory preference rules, establishes stable source/group keys, and replaces stored copy with a privacy-safe generic preview.

Exact source retries stop at the existing unique key or source-link lookup. `booking_message` and attachment aliases group by booking while quote receipts group by marketplace request. The first insert owns the durable row; later sources append immutable links and update only group count/latest-event fields.

## 5. RPC and grant contract

Authenticated owner RPCs are:

- `get_my_notifications(text,timestamptz,uuid,integer,boolean,text)` with a stable `(last_event_at,id)` cursor;
- `get_my_notification_counts(text)`;
- retained `mark_notification_read(uuid)` and `mark_all_notifications_read()` plus mode-aware overload;
- `archive_notification(uuid,text)` and retained `dismiss_notification(uuid)` wrapper;
- `get_my_notification_preferences()` and `update_my_notification_preferences(jsonb)`;
- `resolve_notification_route(uuid,text)`;
- `register_push_token(text,text,text,text)` and `revoke_push_token(text)` / `revoke_my_push_tokens()`.

Push registration checks private configuration and currently raises fail-closed SQLSTATE `55000`. Private event/reminder processing has no authenticated execution. All definer functions use `search_path=''`, derive identity, bound input, and qualify objects. Direct notification insertion/update/deletion and preference writes are revoked.

## 6. Route authorization

The resolver returns a typed route descriptor only after notification ownership and resource access succeed. Supported descriptors are marketplace request, worker opportunities/quote, booking, conversation, provider profile, booking payment, worker earnings, verification, booking review, booking dispute, and preferences.

UUID identifiers are parsed server-side. Booking/chat/dispute access reuses participant helpers; marketplace access checks customer ownership or owned invitation/quote; financial/verification/review/profile checks reuse their canonical relationship. Missing targets return `stale`; unauthorized targets return the same safe `inaccessible` shape without resource details. The TypeScript router maps only this descriptor to Expo Router paths.

## 7. Counts, preferences, and archive

Counts are calculated under Auth from non-archived rows matching current audience. Global unread counts durable rows, category counts group rows, and message unread sums booking conversation watermarks independently.

Preferences remain one row per account. Mandatory/required events bypass in-app category opt-out. Quiet-hour validation uses `pg_timezone_names`, allows equal start/end only when quiet hours are disabled, and supports cross-midnight evaluation in TypeScript/SQL policy. Push remains false regardless of client input until a future configuration migration enables it.

Archive sets `archived_at` and retained `dismissed_at`. Required-action archive calls `private.notification_action_is_open`; current source state—not read state—decides whether archival is allowed. No delete grant or RPC exists.

## 8. Realtime, lifecycle, and foreground behavior

`notifications` remains the only notification Realtime table. The client selects ID-only invalidations, coalesces bursts, and reloads the RPC projection/counts. Reconnect and app foreground reload. Account and customer/worker mode changes increment a generation, clear rows/counts/banner/fallback state, and remove the old channel before loading the new scope.

Foreground banners use localized catalog copy and suppress the active booking conversation. A banner never uses raw server title/body or performs navigation without route resolution.

## 9. Push and reminder fail-closed engineering

`notification_push_adapter.ts` exposes capability and generic-preview policy but no provider import or network call. Supabase token registration is rejected while private configuration is disabled. Mock reminder state is stored under the explicit Mock account, labeled simulation, and never uses a timer, scheduler, provider, or network call. Push remains capability-only and unavailable in both modes.

Private reminder jobs reference an existing source/resource, next run, policy key, attempt cap, and dedupe key. Configuration stores scheduler disabled. Source-table and terminal-event triggers suppress pending jobs after completion, cancellation, resolution, successful payment, verification approval, review submission, or rescheduling. The trusted processor returns without claiming delivery while disabled; a future enabled processor must recheck authoritative source state before claiming work. No Edge Function, cron, webhook, or provider is added.

## 10. Client and Mock

`src/notifications` defines the catalog, types, policy, safe route descriptors, Supabase/Mock repository, provider-neutral push boundary, localization, and context reconciliation. `app/notifications.tsx` remains the unified center; `app/notification-preferences.tsx` supplies simple category and quiet-hour controls with an explicit unavailable push state.

Mock rows are keyed by recipient account. Producers pass the intended customer or worker recipient. Grouping, source dedupe, preference bypass, archive rules, counts, safe routes, quiet-hour policy, reminder simulation, invalidation, and account/mode isolation mirror Supabase. Static selection prevents fallback.

## 11. Localization, accessibility, and brand

Catalog types resolve to English and Egyptian Arabic title/body/action copy. Unknown retained types render generic safe copy. Timestamp formatting uses the active locale. Logical direction, icon placement, filter/action order, and wrapped text support RTL with no Latin letter spacing on Arabic.

Rows announce unread/read, category, priority, group count, and action. Badges announce meaningful totals. Controls are at least 44 points, use correct roles/state, support dynamic text and small screens, expose progress/error/empty semantics, and use no motion-dependent meaning.

The visual design uses restrained dark surfaces and borders, no gradient/glass/card flood, and exact motto authority `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`.

## 12. Testing and operations

Dedicated pgTAP covers catalog/schema, trusted creation, source dedupe/grouping, owner/cross-account/anon access, read/all-read/archive, counts, mandatory preferences, quiet hours, disabled push/tokens, private delivery data, safe payloads, route authorization, Realtime publication, reminders, and WPS source integration.

Dedicated TypeScript regression covers catalog mapping, localization, grouping/sorting/counts, routes/fallback, preferences, cross-midnight quiet hours, generic previews, Realtime behavior, Mock isolation/parity, accessibility, and motto. Manual files begin **NOT RUN**.

Run clean reset, all pgTAP/regressions, TypeScript, ESLint, mojibake, patch whitespace, Expo Doctor, cache-cleared Android/iOS/web exports, local/linked migration evidence, and a non-mutating linked dry-run. Never execute hosted push or activate a provider/scheduler in WPS-014.
