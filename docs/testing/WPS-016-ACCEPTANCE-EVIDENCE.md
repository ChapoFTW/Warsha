# WPS-016 Acceptance Evidence — Trust, Safety & Moderation

## Scope and verdict

WPS-016 establishes the single authority for platform trust state, unified abuse
reporting, moderation, enforcement, bans, fraud signals, investigations, and
appeals. It **extends the existing architecture and replaces nothing**: no
existing table, RPC, trigger, or policy was modified or dropped.

No external moderation provider, no AI moderation, no automated permanent ban,
and no hosted migration was used at any point.

**Verdict: HOLD** — automated gates pass; 48 manual cases remain NOT RUN.

## Automated evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck` — exit 0 |
| ESLint | PASS | `npm.cmd run lint` — exit 0, no errors or warnings |
| Mojibake | PASS | `npm.cmd run check:mojibake` — none found |
| Patch whitespace | PASS | `git diff --check` — clean |
| Clean local reset | PASS | Full chain applied through `202608020004` |
| Focused WPS-016 pgTAP | PASS | `trust-safety-moderation.test.sql` — **98/98** assertions |
| Full pgTAP | PASS | **19 files / 1,387 assertions**, `Result: PASS` |
| WPS-016 TypeScript regression | PASS | **270/270** checks |
| Existing regressions | PASS | 16 suites, zero failures |
| Expo Doctor | PASS | 18/18 |
| Android / iOS / Web exports | PASS | All three cache-cleared, exit 0 |
| Linked list / dry-run | PASS | Read-only; two pending migrations |
| Manual cases | NOT RUN | 48/48 |

### pgTAP totals per suite

| Suite | Assertions |
| --- | --- |
| `chat` | 35 |
| `communication-collaboration` | 80 |
| `device-p1-fixes` | 22 |
| `disputes-resolution` | 94 |
| `financial-spec` | 107 |
| `job-execution-operations` | 107 |
| `marketplace-intelligence` | 96 |
| `notifications-engagement` | 82 |
| `payments` | 101 |
| `production-payments-payouts` | 84 |
| `profile-self-access` | 30 |
| `provider-verification` | 99 |
| `provider_jobs` | 29 |
| `repository-alignment` | 35 |
| `reviews-reputation` | 80 |
| `reviews` | 60 |
| `rls` | 71 |
| `trust-safety-moderation` | **98** |
| `worker-profiles-portfolio` | 77 |
| **Total (19 files)** | **1,387** |

### Regression suite totals

| Suite | Result |
| --- | --- |
| `test:payments` | PASS — 11 |
| `test:wps008-alignment` | PASS — 13 |
| `test:device-p1` | PASS — 73 |
| `test:brand` | PASS — 8 assets / 54 review items |
| `test:provider-card` | PASS — qualitative |
| `test:worker-auth` | PASS — qualitative |
| `test:profile-phone` | PASS — 52 |
| `test:wps009` | PASS — qualitative |
| `test:wps010` | PASS — qualitative |
| `test:wps011` | PASS — 100 |
| `test:wps012` | PASS — 118 |
| `test:wps013` | PASS — 182 |
| `test:wps014` | PASS — 217 |
| `test:wps015` | PASS — 190 |
| `test:wps016` | PASS — **270** |
| `test:marketplace` | PASS — 20 |

## Preservation evidence

pgTAP asserts that every prior authority still exists and functions:
`booking_abuse_reports`, `review_reports`, `moderate_review`,
`report_booking_communication_abuse`, `disputes`, `provider_verifications`,
`provider_earning_holds`, `set_provider_earning_hold`, and
`payment_chargebacks`. The regression suite asserts the migration contains no
`drop table`, no `drop function public.`, and no `alter table` against an
existing trust table.

## Security evidence

- RLS enabled on all five public trust tables with reporter-, subject-, and
  appellant-scoped policies.
- `authenticated` holds no `INSERT`/`UPDATE`/`DELETE` on any trust table.
- `anon` has no access to any trust table or RPC.
- Private evidence, fraud signals, and the moderation audit are readable by no
  client role.
- Report content, enforcement history, and the audit are immutable **at the
  trigger level** — verified to raise even for the table owner.
- Every WPS-016 `SECURITY DEFINER` function pins an empty `search_path`.
- No trust table is published to Realtime.
- Constraints structurally prevent an automatic permanent ban and forbid a
  `system` actor from issuing anything except a non-punitive investigation.
- A recorded fraud signal was verified to leave trust state and access unchanged.

## Hosted state

`npx.cmd supabase migration list` (read-only): everything through
`202608020002` is local and remote; `202608020003` and `202608020004` are
local-only.

`npx.cmd supabase db push --linked --dry-run`:

```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 202608020003_wps015_production_payments_payouts.sql
 • 202608020004_wps016_trust_safety_moderation.sql
```

**No hosted mutation occurred.** Deployment command, not executed:

```
npx.cmd supabase db push --linked
```

## Outstanding

- 48 manual cases — **NOT RUN**; no physical-device acceptance claimed
- Staff moderation Admin UI (contracts and four runbooks are complete)
- Automated fraud-signal emitters per domain (recording exists)
- Bulk moderation tooling
