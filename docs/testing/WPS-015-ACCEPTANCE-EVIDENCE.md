# WPS-015 Acceptance Evidence

## Scope and verdict

WPS-015 extends the WPS-007 financial system with the provider-neutral production
boundary: environment resolution, provider registry and accounts, server-authoritative
method availability, secret metadata, verified webhook processing, settlement import,
reconciliation, chargeback intake, payout tokenization, payout events, and the
six-hour release scheduler.

It creates **no second ledger**, no second payment state machine, and no new ledger
transaction type. No provider was selected, no credential was stored, no webhook was
enabled, no scheduler was activated, and no real payment, payout, or refund was
executed. Hosted migration was not performed.

**Verdict: HOLD.** Automated gates pass; provider selection, commercial and legal
approval, and all 60 manual cases remain outstanding.

## Automated evidence

This table records executed gates only. A blocked or unrun gate is never recorded as passed.

| Gate | Result | Evidence |
| --- | --- | --- |
| Exact Expo SDK 54 documentation | PASS | Versioned Expo 54 docs consulted before client changes |
| TypeScript | PASS | `npm.cmd run typecheck` — exit 0 |
| ESLint | PASS | `npm.cmd run lint` — exit 0, no errors, no warnings |
| Mojibake | PASS | `npm.cmd run check:mojibake` — no likely mojibake |
| Patch whitespace | PASS | `git diff --check` — no whitespace errors |
| Clean local database reset | PASS | `npx.cmd supabase db reset` applied the full chain through `202608020003` and seeded successfully |
| Focused WPS-015 pgTAP | PASS | `production-payments-payouts.test.sql` executed **84/84** assertions |
| Full pgTAP | PASS | `npx.cmd supabase test db` executed **18 files / 1,289 assertions**, `Result: PASS` |
| WPS-015 TypeScript regression | PASS | **190/190** checks |
| Existing regressions | PASS | 15 suites executed, all exit 0, zero failures |
| Expo Doctor | PASS | 18/18 checks passed |
| Android export | PASS | Cache-cleared `npx.cmd expo export --platform android --clear` |
| iOS export | PASS | Cache-cleared `npx.cmd expo export --platform ios --clear` |
| Web export | PASS | Cache-cleared `npx.cmd expo export --platform web --clear` |
| Linked list / dry-run | PASS | Executed read-only; exactly one pending migration |
| Manual alpha | NOT RUN | 60/60 cases remain NOT RUN |
| Real payment / payout / refund / webhook / scheduler | NOT EXECUTED | Deliberately not performed |
| Hosted migration push | NOT EXECUTED | Not authorized by this work |

### Executed pgTAP totals per suite

| Suite | Assertions |
| --- | --- |
| `chat.test.sql` | 35 |
| `communication-collaboration.test.sql` | 80 |
| `device-p1-fixes.test.sql` | 22 |
| `disputes-resolution.test.sql` | 94 |
| `financial-spec.test.sql` | 107 |
| `job-execution-operations.test.sql` | 107 |
| `marketplace-intelligence.test.sql` | 96 |
| `notifications-engagement.test.sql` | 82 |
| `payments.test.sql` | 101 |
| `production-payments-payouts.test.sql` | **84** |
| `profile-self-access.test.sql` | 30 |
| `provider-verification.test.sql` | 99 |
| `provider_jobs.test.sql` | 29 |
| `repository-alignment.test.sql` | 35 |
| `reviews-reputation.test.sql` | 80 |
| `reviews.test.sql` | 60 |
| `rls.test.sql` | 71 |
| `worker-profiles-portfolio.test.sql` | 77 |
| **Total (18 files)** | **1,289** |

### Executed regression suite totals

| Suite | Result |
| --- | --- |
| `test:payments` | PASS — 11 assertions |
| `test:wps008-alignment` | PASS — 13 assertions |
| `test:device-p1` | PASS — 73 assertions |
| `test:brand` | PASS — 8 assets, 54 manual-review items |
| `test:provider-card` | PASS — qualitative |
| `test:worker-auth` | PASS — qualitative |
| `test:profile-phone` | PASS — 52 assertions |
| `test:wps009` | PASS — qualitative |
| `test:wps010` | PASS — qualitative |
| `test:wps011` | PASS — 100 contracts |
| `test:wps012` | PASS — 118 contracts |
| `test:wps013` | PASS — 182 contracts |
| `test:wps014` | PASS — 217 checks |
| `test:wps015` | PASS — **190 checks** |
| `test:marketplace` | PASS — 20 assertions |

## Preserved authority

| Locked rule | Status |
| --- | --- |
| Currency EGP | Unchanged |
| Integer piastres, `bigint` | Unchanged |
| Commission 10%, floor at piastre boundary | Unchanged |
| Minimum withdrawal EGP 200 | Unchanged |
| Withdrawal fee zero | Unchanged |
| Rolling reserve none | Unchanged |
| Six-hour release eligibility | Unchanged |
| Customer-confirmed release | Unchanged |
| Dispute holds | Unchanged |
| Warsha-funded promotions; no reduction of worker gross or commission basis | Unchanged |
| Gateway fees a separate Warsha expense | Unchanged |
| Cash commission debt; exact EGP 500 threshold | Unchanged |
| Future online-earning offsets | Unchanged |
| No external debit from a worker after payout | Unchanged |
| Post-release refunds require reviewed recovery cases | Unchanged |
| No fake gateway money; no fake clearing entries for cash | Unchanged |
| No wallet/bank-balance language; no escrow claims | Unchanged |

Asserted directly against the migrated catalog by the WPS-015 pgTAP suite and by
the regression suite against WPS-007's text.

## Security evidence

Verified against the migrated local catalog:

- Zero grants on any WPS-015 private table to `anon`, `authenticated`, or `PUBLIC`.
- All five client RPCs granted to `authenticated` only; `anon` and `PUBLIC` revoked.
- No client role can execute webhook processing, reconciliation, the release
  scheduler, chargeback intake, or raw surface configuration.
- Every WPS-015 `SECURITY DEFINER` function pins an empty `search_path`.
- No private table is published to Realtime.
- No secret value, PAN, CVV, PIN, or raw wallet/bank credential column exists.
- Webhook quarantine stores a `raw_body_sha256` fingerprint and no provider payload.
- Unsigned, replayed, cross-environment, unknown-type, non-EGP, and orphan events
  are all quarantined and never processed.
- Non-staff accounts are denied staff operations; anonymous access is denied at the
  privilege layer.

The formal threat model is `docs/architecture/payment-threat-model.md`. **No legal,
tax, PCI, or regulatory approval is claimed.**

## Hosted state

Observed read-only via `npx.cmd supabase migration list`:

- Every migration through `202608020002_wps014_notifications_engagement.sql` is
  present both locally and remotely.
- `202608020003_wps015_production_payments_payouts.sql` is **local-only**.

> Note: `202608020002` appeared as local-only during WPS-014 validation and now
> appears as remote. That hosted change was made outside this work. **No hosted
> mutation was performed by this task.**

`npx.cmd supabase db push --linked --dry-run` confirmed the single pending migration:

```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 202608020003_wps015_production_payments_payouts.sql
```

The exact deployment command is:

```
npx.cmd supabase db push --linked
```

It was **not** executed, and it requires explicit authorization.

## Outstanding

- Provider selection — **DEFERRED** to the decision gate in `docs/decisions/payment-provider-selection.md`
- Commercial contract, Egyptian legal/accounting confirmation, entity eligibility
- Marketplace disbursement licensing and worker national-ID lawfulness
- Provider-specific webhook signature scheme and refund/intent calls
- Edge Function deployment and secret provisioning
- Admin UI for staff contracts
- 60 manual alpha cases — **NOT RUN**; no physical-device acceptance claimed
