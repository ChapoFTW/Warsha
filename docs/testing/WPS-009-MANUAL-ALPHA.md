# WPS-009 Manual Alpha

Overall manual status: **NOT RUN**

No row in this document is evidence of execution. Record tester, build, platform, account IDs, data mode, locale, time, result, and evidence link only after an observed run. Never use real phone numbers, payment credentials, production push, or hosted mutations.

## Environment record

| Field | Value |
| --- | --- |
| Tester | **NOT RUN** |
| Build/commit | **NOT RUN** |
| Android device/OS | **NOT RUN** |
| iOS device/OS | **NOT RUN** |
| Web/browser | **NOT RUN** |
| Data mode/account fixtures | **NOT RUN** |
| Local Supabase reset | **NOT RUN** |

## Test cases

| ID | Area | Procedure / expected result | Status |
| --- | --- | --- | --- |
| M009-001 | Preselection | Open Browse/Get Quotes before selection; no direct chat action or participant data appears. | **NOT RUN** |
| M009-002 | Pending direct booking | Create legacy pending/accepted booking; booking detail has no chat action. | **NOT RUN** |
| M009-003 | Confirmation | Confirm selected quote; one conversation appears for both participants. | **NOT RUN** |
| M009-004 | Customer inbox | Chat tab shows counterpart, service, status, activity, unread state. | **NOT RUN** |
| M009-005 | Worker inbox | Switch worker mode; only assigned confirmed conversations appear. | **NOT RUN** |
| M009-006 | Text | Send English and Arabic text; order, timestamps, wrapping, and retry state are clear. | **NOT RUN** |
| M009-007 | Quick replies EN | Send every quick reply in English; each renders naturally. | **NOT RUN** |
| M009-008 | Quick replies AR | Send every quick reply in Egyptian Arabic; each renders naturally. | **NOT RUN** |
| M009-009 | Quick late distinction | Send ten-minute quick reply; verify it does not claim to change authoritative ETA. | **NOT RUN** |
| M009-010 | Status | Advance booking through confirmed/on-way/arrived/started/in-progress; server chips appear once. | **NOT RUN** |
| M009-011 | Running Late | Use guarded worker action; customer sees new ETA outcome and chat system event. | **NOT RUN** |
| M009-012 | Off-platform EN | Send a likely phone/WhatsApp phrase; original stays and neutral reminder appears. | **NOT RUN** |
| M009-013 | Off-platform AR | Repeat in Arabic; copy is neutral and does not accuse or block. | **NOT RUN** |
| M009-014 | Ordinary text | Send ordinary coordination containing numbers; assess false-positive behavior. | **NOT RUN** |
| M009-015 | Camera image | Grant camera, attach JPG/HEIC, observe upload state and private preview. | **NOT RUN** |
| M009-016 | Gallery image | Grant photos, attach JPG/PNG/HEIC where supported, preview on other account. | **NOT RUN** |
| M009-017 | PDF | Pick PDF through system UI; safe name/size appear and signed viewer opens. | **NOT RUN** |
| M009-018 | Oversize | Attempt image/PDF over 8 MB; clear local/server rejection and no message. | **NOT RUN** |
| M009-019 | Unsupported type | Attempt unsupported type; no upload/message and safe explanation. | **NOT RUN** |
| M009-020 | Upload retry | Interrupt upload/RPC, retry retained draft, verify one message only. | **NOT RUN** |
| M009-021 | Signed expiry | Reopen an old attachment after URL expiry; repository refreshes access safely. | **NOT RUN** |
| M009-022 | No hard delete | Confirm sent message/file has no edit or delete control. | **NOT RUN** |
| M009-023 | Unread | Receive messages while inbox visible; aggregate badge updates and clears on open. | **NOT RUN** |
| M009-024 | No exact seen | Read a message; sender UI does not rely on an exact seen timestamp. | **NOT RUN** |
| M009-025 | Typing | Type, stop, background, and leave; indicator expires/clears without lingering. | **NOT RUN** |
| M009-026 | Cancellation | While typing/uploading, cancel booking; composer/typing/upload writes lock immediately. | **NOT RUN** |
| M009-027 | Cancelled history | Reopen cancelled confirmed conversation; history/attachments read, composer absent. | **NOT RUN** |
| M009-028 | Completion before boundary | At less than 48 hours from completion, send follow-up successfully. | **NOT RUN** |
| M009-029 | Completion boundary | At exact/after 48 hours, composer changes to read-only without stale send. | **NOT RUN** |
| M009-030 | Disputed after completion | Verify completion-window behavior remains as documented. | **NOT RUN** |
| M009-031 | Disputed no completion | Verify conversation is read-only when completion evidence is absent. | **NOT RUN** |
| M009-032 | Rescue original | Worker cancellation starts Rescue; original chat becomes read-only. | **NOT RUN** |
| M009-033 | Rescue replacement | Replacement worker sees only replacement booking chat, not original history. | **NOT RUN** |
| M009-034 | Customer Rescue view | Customer sees both properly scoped booking histories with no participant mix-up. | **NOT RUN** |
| M009-035 | Call unavailable | Tap secure call; explanation appears, no number/dialer/call opens. | **NOT RUN** |
| M009-036 | Safety report | Submit each category with/without details; confirmation says staff review/no auto action. | **NOT RUN** |
| M009-037 | Report retry | Interrupt report response and retry; one report exists. | **NOT RUN** |
| M009-038 | Cross-customer | Sign out/in as another customer; no stale inbox/thread/banner appears. | **NOT RUN** |
| M009-039 | Cross-worker | Switch worker accounts; no other worker conversation appears. | **NOT RUN** |
| M009-040 | Mock/Supabase | Exercise equivalent core flow in both modes; no fallback or data mixing. | **NOT RUN** |
| M009-041 | Reconnect | Disable network, send/retry, reconnect; authoritative state dedupes and reconciles. | **NOT RUN** |
| M009-042 | App background | Background/return on inbox/thread; unread/messages/status reconcile. | **NOT RUN** |
| M009-043 | Notification | Receive message outside thread; generic localized banner routes to owned booking. | **NOT RUN** |
| M009-044 | Active thread notification | Receive message in open thread; no redundant foreground banner, thread refreshes. | **NOT RUN** |
| M009-045 | Notification privacy | Inspect visible notification; no text, number, filename, address, or URL appears. | **NOT RUN** |
| M009-046 | Arabic RTL | Inspect inbox, bubbles, quick replies, files, report sheet, read-only and errors in RTL. | **NOT RUN** |
| M009-047 | Text scaling | Increase device text size; actions/content remain reachable and understandable. | **NOT RUN** |
| M009-048 | Screen reader | Verify labels, radio state, unread count, disabled call explanation, and focus order. | **NOT RUN** |
| M009-049 | Touch targets | Verify interactive controls are at least 44 points and not crowded. | **NOT RUN** |
| M009-050 | Motto splash | Rebuild/uninstall/reinstall; splash shows Current plus `YOUR WORK, OUR MISSION`. | **NOT RUN** |
| M009-051 | Motto Arabic UI | Verify shared Arabic motto is exactly `شغلك مهمتنا` where rendered. | **NOT RUN** |
| M009-052 | Web metadata | Fresh web export/install shows approved description/icons; old mission is absent as motto. | **NOT RUN** |
| M009-053 | Native separation | Android and iOS cache-cleared exports start independently with no stale asset. | **NOT RUN** |
| M009-054 | Retention honesty | Confirm UI/docs do not claim disappearing/deletion schedule. | **NOT RUN** |
| M009-055 | Production gates | Confirm no real push, call, SMS, payment, webhook, scheduler, or hosted migration ran. | **NOT RUN** |

## Sign-off

| Role | Name | Date | Outcome |
| --- | --- | --- | --- |
| Product | **NOT RUN** | **NOT RUN** | **NOT RUN** |
| Engineering | **NOT RUN** | **NOT RUN** | **NOT RUN** |
| Security/privacy | **NOT RUN** | **NOT RUN** | **NOT RUN** |
| Arabic/RTL | **NOT RUN** | **NOT RUN** | **NOT RUN** |
