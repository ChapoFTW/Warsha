# WPS-019 Acceptance Evidence — Customer Support, Help Center & Knowledge Management

| Field | Value |
| --- | --- |
| Specification | WPS-019 v1.0 |
| Engineering baseline | WES-019 v1.0 |
| Architecture audit | `docs/architecture/support-architecture-audit.md` |
| Migration | `supabase/migrations/202608040001_wps019_customer_support_help_center.sql` (local only) |
| Manual acceptance | **NOT RUN** — 58 WPS-019 cases, 0 executed |
| Hosted deployment | **Not applied** |
| Local implementation | **Accepted** |

Every result below was executed from the current repository state after the
interrupted session was recovered. Nothing here is carried over from a previous
report.

## Executed gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | Pass |
| ESLint | `npm run lint` | Pass, 0 errors, 0 warnings |
| Mojibake | `npm run check:mojibake` | `No likely mojibake found.` |
| Whitespace | `git diff --check` | Clean |
| Secret scan | `npm run audit:secrets` | Clean — 444 tracked files, 39 commits |
| Migration audit | `npm run audit:migrations` | Clean — 34 migrations, forward-only verified |
| Environment audit | `npm run audit:environment` | Clean — 5 variables, 22 routes, 6 assets, 0 notes |
| Bundle audit | `npm run audit:bundle` | Clean — 53 artefacts across 3 exports |
| Clean database reset | `supabase db reset` | Full chain through `202608040001` applied without error |
| Full pgTAP | `supabase test db` | **22 files / 2,032 assertions, `Result: PASS`** |
| WPS-019 pgTAP | single-file run | **201 assertions pass** |
| WPS-019 client suite | `npm run test:wps019` | **858 checks pass** |
| All regression suites | 19 suites, exit-code checked | **0 failures** |
| Expo Doctor | `npx expo-doctor` | **18/18** |
| Android export | `--platform android --clear` | Exported |
| iOS export | `--platform ios --clear` | Exported |
| Web export | `--platform web --clear` | Exported; all 7 WPS-019 routes present |
| Migration ledger | `supabase migration list --linked` | Through `202608020005` local **and** remote; `202608030001` and `202608040001` local only |
| Non-mutating dry run | `supabase db push --linked --dry-run` | Two pending migrations; **no hosted mutation** |
| Hosted push | — | **Not executed** |

Totals before WPS-019: 21 pgTAP files / 1,831 assertions, 18 regression suites.
WPS-019 adds a 201-assertion pgTAP suite and an 858-check client suite, and grew
the WPS-014 suite from 217 to 221 checks.

## Existing architecture preserved

The audit's governing finding was that Warsha already had a complete support
backend that no user could reach. WPS-019 made it reachable without rewriting it.

| Preserved | Evidence |
| --- | --- |
| `support_tickets`, `support_messages`, `support_ticket_events` | Extended by `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` only; asserted that neither is recreated |
| Six WPS-017 support RPCs | All keep their name, signature, and body; asserted present |
| `private.open_support_case_impl` | Reused verbatim by the new overload; `private` still holds **exactly 30** `_impl` functions, the WPS-018 count |
| `public.open_support_case` | Exactly two signatures; the 4-argument WPS-018 wrapper is untouched and still resolves |
| WPS-013 disputes, WPS-016 trust, WPS-009 chat | Asserted present; asserted that WPS-019 writes to none of them |
| Staff model | No role, no capability, no queue added; asserted |
| Notification system | One table, one catalog; asserted that no second notification table exists |
| Rate limiter | Five policies added to the WPS-018 limiter; asserted no second limiter |

**All 21 pre-existing pgTAP suites pass.** One assertion in the WPS-017 suite was
made more precise rather than weakened — see §"Recorded assertion changes".

## Security verified

| Property | Evidence |
| --- | --- |
| Anonymous denial | `anon` holds no grant on any support or knowledge table; RPCs are denied at the grant, before any body runs |
| Cross-account denial | Read, reopen, satisfaction, and merge all refused for another account's case; RLS hides the row entirely |
| Narrow-role denial | A verification reviewer is refused on the support queue and on merge |
| Customer denial | A customer is refused on the queue, the toolkit, and article authoring |
| Private notes | A staff note is asserted absent from the requester's view and present as `visibility='staff'` |
| Unpublished content | Search asserted never to return a draft or archived article; RLS hides a draft from a customer |
| Rate limiting | The third search in a two-per-window policy is refused by the server with SQLSTATE 53400 |
| Limiter privacy | Asserted that no raw account identifier reaches the counter table |
| Attachment isolation | A nonexistent path, a traversing name, and a malformed hash are all refused; read requires a **registered** object |
| Notification privacy | The payload carries only `case_id`; asserted the builder never reads the subject or body |
| Audit coverage | Assign, merge, resolve, and article authoring all write to the immutable WPS-017 audit |
| Search path | Every WPS-019 `SECURITY DEFINER` function pins an empty `search_path`; asserted |
| RLS coverage | Every public table in the schema still has RLS enabled; asserted globally, not just for new tables |
| Realtime | No WPS-019 table is broadcast |

## Nothing was enabled

Asserted negatively: push delivery, push token registration, the notification
scheduler, every feature flag, and every kill switch remain off. WPS-019 selects
no external provider of any kind.

## Localization verified

- Every published article has both an English and an Egyptian Arabic body,
  asserted in pgTAP as a count of zero exceptions.
- English and Arabic bodies are asserted to differ, so an untranslated copy
  cannot masquerade as finished.
- The client vocabulary exposes an identical key set in both languages, and every
  Arabic value is asserted to contain Arabic script.
- An article cannot be published without an English body.
- The approved motto is untouched: `src/i18n/translations.ts` is not modified by
  WPS-019, and the support vocabulary is asserted not to restate it.

## Mock parity

19 repository methods, 19 explicit Mock branches, verified programmatically.
Mock imports no Supabase module, constructs no client, and performs no network
call of any kind — all asserted.

Parity is stated precisely rather than overclaimed: Mock carries the same 12
categories and the same 29 article slugs in both locales with the same surface
and tag metadata and the same four search outcomes. Article **bodies** are
abbreviated and the file says so. Staff actions raise in Mock rather than
pretending to succeed.

## Defect found and fixed during recovery

**`npm run audit:secrets` was failing on every run** — a required CI gate, broken
by the WPS-018 commit itself.

The scanner was flagging its own pattern definitions: `scripts/audit-bundle.mjs`
contained a contiguous PEM private-key header as a regex literal, and
`docs/testing/WPS-018-SECURITY-REVIEW.md` contained the Hermes collision string
it exists to document. Both were also permanent in commit `c88957a`.

This is precisely the failure mode WPS-018 recorded as its own F1 finding — a
scanner that always fails trains people to ignore it — reintroduced by the
commit that fixed it.

Fixed three ways, none of which weakens detection:
1. The bundle scanner assembles the PEM header from two parts; the compiled
   expression is identical.
2. The security review writes the collision string as two halves and explains why.
3. Two **exact literals** are neutralized in the secret scanner for the history
   scan, alongside Supabase's published demo keys. Neutralization is by value,
   never by path: a path allowlist would let a real secret hide in that file
   forever, whereas a real private key does not carry the regex tail
   `[\s\S]{0,40}MIG` and a real Supabase key is not that specific Hermes string.

Verified in both directions afterwards: the bundle scanner still catches a
planted Apple p8 header, a planted Supabase secret key, and a planted
service-role JWT, and is still clean on a file containing only supabase-js's own
`startsWith("sb_secret_")` guard and on all 53 real export artefacts.

## Recorded assertion changes

Three existing assertions changed, all deliberate, none weakened:

1. `scripts/wps014-notifications-engagement.test.mts` — nine notification
   categories became ten.
2. `scripts/wps014-notifications-engagement.test.mts` — the "every category is
   database constrained" loop checked one migration file. The constraint now
   spans two forward migrations, so it checks the schema instead. The property
   is unchanged.
3. `supabase/tests/database/operations-admin-platform.test.sql` — an empty
   customer inbox was used as a proxy for "no staff notification leaks into a
   customer inbox". A customer now legitimately has support notifications, so the
   assertion tests the property directly: nothing with a `staff_` event key or a
   `staff` audience reaches a customer inbox. This is stronger than what it
   replaced.

## What is not claimed

- **No manual acceptance.** All 58 WPS-019 cases are NOT RUN. They join a
  backlog of 486 consolidated cases that has never been executed.
- **No device testing.** Zero real-device runs exist across every WPS.
- **No support team.** The service levels are targets in a table with nobody
  rostered to meet them, which is why they are internal and unpublished.
- **No SLA breach alerting.** `staff_support_sla_breach` is catalogued; the
  WPS-014 scheduler that would fire it is disabled, so nothing emits it.
- **No attachment picker UI.** The bucket, policies, RPC, and repository binding
  are complete and tested; the customer-facing picker is not built. Manual cases
  S48–S51 are expected to be BLOCKED on device for that reason.
- **No article editor UI and no merge UI.** Both RPCs exist and are tested;
  neither has a staff screen.
- **No search relevance measurement.** There are no real queries to measure against.
- **No legal review** of any article, including the payment, refund, and dispute
  articles, which describe product behaviour and not legal entitlement.
- **No hosted migration applied and no deployment performed.**

## Deployment verdict

| Environment | Verdict |
| --- | --- |
| Local | **Accepted.** Every gate passes. |
| Staging | **Accepted once a staging project exists.** It does not (WPS-018 gap G20). |
| Production | **Blocked**, and not by this code — by the WPS-018 launch blockers, which WPS-019 does not change and does not reduce. |

WPS-019 is safe to commit. It is not safe to launch, and nothing here moves the
launch verdict.
