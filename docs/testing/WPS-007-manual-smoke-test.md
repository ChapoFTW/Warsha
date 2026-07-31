# WPS-007 local manual smoke test

Status: prepared, automated validation pending/finalized separately. Manual
results must be recorded in `docs/testing/WPS-007-manual-smoke-results.md`.

This runbook is local-only. It never authorizes a hosted migration, real card
payment, real refund, real payout, external webhook, or production scheduler.
All credentials and money below are fictional development data.

## Environment requirements

- Windows PowerShell, Docker Desktop, Node.js 20.19 or later, npm, and the
  Supabase CLI.
- Expo SDK 54-compatible Android and iOS targets.
- The repository root is `C:\Users\siefa\Documents\Warsha`.
- The local Supabase project ID is `warsha`; its database container must be
  `supabase_db_warsha`.
- Never set the smoke harness to a hosted URL. The harness reads `supabase
  status -o env` and refuses any API host other than `localhost`, `127.0.0.1`,
  or `::1`.

On this workstation, set the validated native CLI override before management
commands:

```powershell
$env:SUPABASE_CLI_BINARY_OVERRIDE='C:\Users\siefa\AppData\Local\npm-cache\_npx\aa8e5c70f9d8d161\node_modules\@supabase\cli-windows-x64\bin\supabase-go.exe'
```

If that cache path changes, install/pin a working Supabase CLI and point the
variable to its native binary. Do not substitute a hosted project URL.

## Start, prepare, and stop

From the repository root:

```powershell
npx.cmd supabase start
npx.cmd supabase db reset
npm.cmd run smoke:wps007 -- prepare
npm.cmd run smoke:wps007 -- modes on
npm.cmd run smoke:wps007 -- start-expo
```

`prepare` creates four local Auth personas and 22 labelled booking fixtures,
then explicitly restores all financial modes to disabled. Run `modes on` only
after preparation. `start-expo` injects only the local API URL and local
anonymous key into Expo; it does not print or bundle the service-role key.

At the end of every testing session:

```powershell
npm.cmd run smoke:wps007 -- modes off
npm.cmd run smoke:wps007 -- modes status
```

The final status must be:

```text
gateway_mode=disabled
payout_mode=disabled
automatic_release_scheduler_enabled=false
```

Stop Expo with `Ctrl+C`. Supabase may remain running for another local session,
or be stopped with `npx.cmd supabase stop`.

## Test personas

All four accounts use the local-only password `WarshaSmoke!2026`.

| Persona | Email | Purpose |
| --- | --- | --- |
| Customer A | `wps007.customer.a@warsha.test` | Owns every fixture booking |
| Provider A | `wps007.provider.a@warsha.test` | Owns most financial fixtures |
| Provider B | `wps007.provider.b@warsha.test` | Isolation and recovery cases |
| Staff/Admin | `wps007.staff@warsha.test` | Has a local `admin` role; used only by guarded CLI commands |

Sign in from the Profile tab. To use a provider persona, sign in, open Profile,
choose provider mode, then use Jobs or Earnings. Sign out before switching
actors. The Auth provider clears the prior session; do not leave two personas
signed in on the same app process.

## Development modes and controls

Enable local generic card and payout mocks:

```powershell
npm.cmd run smoke:wps007 -- modes on
```

This sets `gateway_mode=mock` and `payout_mode=mock`. It keeps the automatic
scheduler disabled. The customer payment screen and provider withdrawal screen
must display explicit development-only warnings. No external network financial
operation exists behind either control.

Disable everything:

```powershell
npm.cmd run smoke:wps007 -- modes off
```

Simulate one trusted gateway event after Customer A has pressed Pay now:

```powershell
npm.cmd run smoke:wps007 -- event <fixture-key> success <unique-event-id>
```

Allowed outcomes are `pending`, `success`, and `failure`. Reusing the same event
ID is intentional only in duplicate-event tests.

Simulate six hours and one trusted scheduler run:

```powershell
npm.cmd run smoke:wps007 -- scheduler <fixture-key>
```

The command temporarily enables the scheduler flag inside a local database
transaction, moves only the named fixture past eligibility, calls the private
scheduler contract, and restores the flag to `false` before commit.

Staff actions use the Staff/Admin JWT identity inside guarded public RPCs:

```powershell
npm.cmd run smoke:wps007 -- refund <fixture-key> <amount-egp> <idempotency-key>
npm.cmd run smoke:wps007 -- hold <fixture-key> hold <amount-egp> <idempotency-key>
npm.cmd run smoke:wps007 -- hold <fixture-key> release <amount-egp> <idempotency-key>
npm.cmd run smoke:wps007 -- withdrawal <status> <idempotency-key> a
npm.cmd run smoke:wps007 -- case create <fixture-key> <amount-egp> <idempotency-key>
npm.cmd run smoke:wps007 -- case decide <fixture-key> <provider-responsibility-egp> <idempotency-key>
```

The harness also has setup-only commands for a supported customer RPC and a
fictional masked provider destination:

```powershell
npm.cmd run smoke:wps007 -- intent <fixture-key> online <idempotency-key>
npm.cmd run smoke:wps007 -- destination a mobile_wallet <idempotency-key>
npm.cmd run smoke:wps007 -- request-withdrawal a <amount-egp> <idempotency-key>
```

Prefer the visible app controls in the cases below. Use these setup commands
only when a case explicitly calls for them or when recovering a staff-only case
after an app restart.

## Observation and result recording

After every scenario, run:

```powershell
npm.cmd run smoke:wps007 -- observe <fixture-key>
```

The command prints safe local projections of:

- booking and approved price breakdown;
- payment and immutable price snapshot;
- payment attempts;
- provider earning;
- refunds and their component reversals;
- cash commission record;
- reviewed recovery case;
- masked withdrawal records;
- cash debt, recovery debt, and available earnings balances;
- ledger transactions and entries; and
- relevant notifications.

It never prints a raw payout value, payout fingerprint, service key, gateway
secret, or webhook body. Every posted ledger transaction must have equal debit
and credit totals in EGP. Record the case as `PASS`, `FAIL`, or `BLOCKED` in the
results document; never infer a manual pass from automated tests.

## Fixture index

| Case | Fixture key |
| --- | --- |
| C-01 | `wps007-c01-online-success` |
| C-02 | `wps007-c02-failure-retry` |
| C-03 | `wps007-c03-duplicate-event` |
| C-04 | `wps007-c04-cash-selection` |
| C-05 | `wps007-c05-cash-accepted` |
| C-06 | `wps007-c06-cash-disputed` |
| C-07 | `wps007-c07-full-refund` |
| C-08 / S-03 | `wps007-c08-partial-refund` |
| C-09 | `wps007-c09-price-accepted` |
| C-10 | `wps007-c10-price-rejected` |
| C-11 | `wps007-c11-promotion` |
| P-02 | `wps007-p02-six-hour-release` |
| P-03 | `wps007-p03-customer-release` |
| P-04 | `wps007-p04-dispute-hold` |
| P-07 | `wps007-p07-withdrawal-paid` |
| P-08 | `wps007-p08-withdrawal-failed` |
| P-09 / P-10 exact | `wps007-p09-cash-debt-exact` |
| P-10 above | `wps007-p10-cash-debt-above` |
| P-11 | `wps007-p11-online-debt-offset` |
| P-13 | `wps007-p13-recovery` |
| P-13 offset | `wps007-p13-recovery-offset` |
| S-01 | `wps007-s01-earning-hold` |

## Customer cases

### C-01 — Online mock payment success

- Preconditions: modes on; Customer A signed in; open Past Orders and `C-01
  Online mock payment success`.
- Manual steps: confirm the development-only card warning; press Pay now; run
  `npm.cmd run smoke:wps007 -- event wps007-c01-online-success success
  c01-success-1`; optionally run `npm.cmd run smoke:wps007 -- fee
  wps007-c01-online-success 12.50 c01-gateway-fee-1`; foreground or refresh the
  app.
- Expected UI: paid status, EGP 1,000, online method, reference, receipt, and no
  real-provider brand or card-entry form.
- Expected database: one payment, one succeeded attempt, one current snapshot,
  paid amount 100,000 piastres, and optional gateway fee 1,250 piastres.
- Expected ledger: provider pending credit 90,000; Warsha commission credit
  10,000; customer clearing debit 100,000. The optional fee posts only to
  `gateway_fee_expense` and `gateway_fee_payable`.
- Expected notification: one customer payment confirmation and one Provider A
  pending-earnings notification.
- Result: `NOT RUN`
- Notes:

### C-02 — Online mock failure and retry

- Preconditions: modes on; Customer A; open `C-02 Failure and retry`.
- Manual steps: Pay now; run `event wps007-c02-failure-retry failure
  c02-failure-1`; refresh; press Try again; run `event
  wps007-c02-failure-retry success c02-success-2`; refresh.
- Expected UI: a visible failed state followed by a successful retry; the
  development warning remains visible.
- Expected database: one payment, attempt 1 failed, attempt 2 succeeded, and
  only the latest attempt succeeds.
- Expected ledger: no payment posting for failure; exactly one online-payment
  posting and one earning after success.
- Expected notification: one failure notification and one final confirmation;
  no duplicate confirmation.
- Result: `NOT RUN`
- Notes:

### C-03 — Duplicate trusted gateway event

- Preconditions: modes on; Customer A; start payment on `C-03 Duplicate gateway
  event`.
- Manual steps: run `event wps007-c03-duplicate-event success
  c03-same-event-1` twice; refresh; observe.
- Expected UI: one paid payment and one receipt.
- Expected database: the second result reports `duplicate=true`; one gateway
  event, payment, receipt projection, and earning.
- Expected ledger: exactly one `online_payment_confirmed` transaction.
- Expected notification: one customer confirmation and one provider pending
  notification.
- Result: `NOT RUN`
- Notes:

### C-04 — Cash selection

- Preconditions: modes on; Customer A; open `C-04 Cash selection`.
- Manual steps: press Pay in cash; read the cash instructions; observe.
- Expected UI: cash is paid directly to the provider and Warsha does not
  collect it; status awaits cash collection.
- Expected database: one cash payment, no private payment attempt.
- Expected ledger: no customer clearing, provider earning, or commission
  posting yet.
- Expected notification: no gateway-payment notification.
- Result: `NOT RUN`
- Notes:

### C-05 — Cash confirmation accepted

- Preconditions: C-04 understood; Customer A selects cash on `C-05 Cash
  accepted`.
- Manual steps: sign out; sign in Provider A; provider mode > Jobs > C-05 >
  press I collected the cash. Sign out; sign in Customer A; C-05 > press Yes, I
  paid in cash.
- Expected UI: provider sees reported/waiting, then both parties see paid cash;
  no Warsha-held earning is shown.
- Expected database: cash payment status paid and one cash commission record
  for 6,000 piastres.
- Expected ledger: cash commission debt debit and Warsha commission credit,
  both 6,000; no clearing funds and no provider earning.
- Expected notification: provider report, customer confirmation request, and
  final cash confirmation are understandable and deduplicated.
- Result: `NOT RUN`
- Notes:

### C-06 — Cash rejected or disputed

- Preconditions: Customer A selects cash on `C-06 Cash disputed`; Provider A
  reports collection.
- Manual steps: Customer A presses No, I did not pay; inspect the status,
  timeline, and notifications; observe.
- Expected UI: failed/disagreed state; no successful-payment claim. Record
  `BLOCKED` if a usable support route is not present rather than treating copy
  alone as support.
- Expected database: payment failed; auditable provider/customer cash events;
  no successful cash commission record.
- Expected ledger: no manufactured payment, clearing balance, earning, or
  commission debt.
- Expected notification: a cash-dispute notification, once.
- Result: `NOT RUN`
- Notes:

### C-07 — Full pre-release refund

- Preconditions: Customer A pays `C-07 Full pre-release refund`; process success
  but do not confirm completion or run scheduler.
- Manual steps: run `refund wps007-c07-full-refund 1000 c07-full-refund-1`
  twice with the same key; refresh and observe.
- Expected UI: refunded EGP 1,000 and full-refund receipt state.
- Expected database: one succeeded refund despite the duplicate command;
  payment refunded; earning reversed.
- Expected ledger: immutable reversal debits provider pending 90,000 and
  commission 10,000, and credits customer clearing 100,000.
- Expected notification: one completed-refund notification.
- Result: `NOT RUN`
- Notes:

### C-08 — Partial pre-release refund and rounding

- Preconditions: pay and succeed `C-08 Partial pre-release refund`; do not
  release it.
- Manual steps: run `refund wps007-c08-partial-refund 333.33
  c08-partial-refund-1`; observe; run `refund wps007-c08-partial-refund 111.11
  c08-partial-refund-2`; observe again.
- Expected UI: partially refunded, first 333.33 then cumulative EGP 444.44.
- Expected database: two immutable refund rows with exact cumulative component
  targets; the payment remains partially refunded.
- Expected ledger: each reversal balances; provider and commission components
  use cumulative floor allocation without piastre drift.
- Expected notification: one notification per distinct refund; repeating either
  idempotency key creates none.
- Result: `NOT RUN`
- Notes:

### C-09 — Accepted price revision

- Preconditions: Provider A signed in; open `C-09 Accepted price revision`.
- Manual steps: propose EGP 650 with reason `Replacement part approved`; sign in
  Customer A; confirm old EGP 500, new EGP 650, +EGP 150, and reason; accept;
  start online payment.
- Expected UI: one pending proposal before acceptance and the accepted total
  becomes the payable total.
- Expected database: adjustment accepted; immutable snapshot version 1 is
  superseded by an approved EGP 650 snapshot; payment amount is 65,000.
- Expected ledger: no posting until success; after success all components use
  the new snapshot only.
- Expected notification: price proposal/acceptance notifications are scoped to
  the two participants.
- Result: `NOT RUN`
- Notes:

### C-10 — Rejected price revision

- Preconditions: Provider A; open `C-10 Rejected price revision`.
- Manual steps: propose EGP 650 with a reason; Customer A verifies the
  comparison and rejects; start payment.
- Expected UI: original EGP 500 remains authoritative.
- Expected database: adjustment rejected; no new current price snapshot from
  the rejected proposal; payment amount is 50,000.
- Expected ledger: no amount related to the rejected EGP 650 proposal.
- Expected notification: rejection is visible/auditable without a payment
  posting.
- Result: `NOT RUN`
- Notes:

### C-11 — Warsha-funded promotion

- Preconditions: Customer A; open `C-11 Warsha-funded promotion`.
- Manual steps: verify approved EGP 1,000 and EGP 100 promotion; Pay now;
  process `event wps007-c11-promotion success c11-success-1`; refresh; observe.
- Expected UI: customer pays EGP 900; receipt separates approved price,
  promotion, and amount paid.
- Expected database: customer total 90,000; provider gross 100,000; promotion
  10,000; commission 10,000; provider net 90,000.
- Expected ledger: customer clearing debit 90,000 plus Warsha promotion expense
  debit 10,000 balances provider pending 90,000 and commission 10,000.
- Expected notification: amounts are not misdescribed as provider-funded.
- Result: `NOT RUN`
- Notes:

### C-12 — Receipt display

- Preconditions: complete C-01, C-08, and C-11.
- Manual steps: compare their receipt cards.
- Expected UI: reference, approved price, promotion when present, amount paid,
  method, status, refunded amount, and relevant timestamp are readable.
- Expected database: receipt values match the current payment and immutable
  snapshot exactly.
- Expected ledger: displayed totals reconcile to the observed ledger; no ledger
  field is presented as a bank balance or escrow.
- Expected notification: receipt state is consistent with the most recent
  payment/refund notification.
- Result: `NOT RUN`
- Notes:

### C-13 — Arabic financial UI

- Preconditions: at least C-01 and C-11 have visible receipts.
- Manual steps: use the header language control to switch to Arabic; inspect
  customer payment, receipt, notification, provider earnings, destination, and
  withdrawal screens; switch back to English.
- Expected UI: natural Egyptian Arabic, RTL layout, localized EGP formatting,
  no clipping, encoding corruption, mojibake, or reversed amount signs.
- Expected database: language changes no financial state.
- Expected ledger: no new transactions.
- Expected notification: Arabic title/body and amount wording remain accurate.
- Result: `NOT RUN`
- Notes:

## Provider cases

### P-01 — Pending earnings

- Preconditions: complete C-01 success without release; sign in Provider A >
  Earnings.
- Manual steps: locate C-01.
- Expected UI: EGP 1,000 gross basis, EGP 100 Warsha fee, EGP 900 net, pending
  release; no bank, escrow, salary, or employment language.
- Expected database: earning `pending_release`.
- Expected ledger: 90,000 remains in provider pending, not provider available.
- Expected notification: pending earnings notification.
- Result: `NOT RUN`
- Notes:

### P-02 — Six-hour eligibility and trusted local scheduler

- Preconditions: pay and succeed `P-02 Six-hour release`; do not customer
  confirm.
- Manual steps: Provider A verifies the displayed eligibility is completion plus
  six hours; run `scheduler wps007-p02-six-hour-release`; refresh Earnings.
- Expected UI: pending before the command, available after it; automatic
  scheduler warning remains because no persistent scheduler is deployed.
- Expected database: original eligibility interval is six hours; one trusted
  simulation releases it; scheduler flag ends false.
- Expected ledger: exactly one pending-to-available transfer.
- Expected notification: one earnings-available notification.
- Result: `NOT RUN`
- Notes:

### P-03 — Immediate customer-confirmed release

- Preconditions: pay and succeed `P-03 Customer-confirmed release`.
- Manual steps: Customer A presses Confirm successful completion; repeat/refresh;
  Provider A checks Earnings.
- Expected UI: completion confirmation and available earning appear once.
- Expected database: `customer_confirmed_at` set; earning available exactly
  once.
- Expected ledger: one customer-release transaction.
- Expected notification: one earnings-available notification.
- Result: `NOT RUN`
- Notes:

### P-04 — Dispute hold

- Preconditions: pay and succeed `P-04 Dispute hold`; do not release.
- Manual steps: run `dispute wps007-p04-dispute-hold open`; refresh Customer A
  and Provider A views; attempt no release; observe.
- Expected UI: disputed/held state; no available balance increase.
- Expected database: active dispute and earning `held_for_dispute`.
- Expected ledger: no pending-to-available transfer.
- Expected notification: dispute/hold state is visible without a payment claim.
- Result: `NOT RUN`
- Notes:

### P-05 — Available earnings with no rolling reserve

- Preconditions: P-02 and P-03 available; no active staff hold or withdrawal
  reservation on them.
- Manual steps: inspect Provider A Earnings and add the net amounts.
- Expected UI: all released net is available; no generic percentage holdback.
- Expected database: rolling reserve configuration is zero; only explicit holds
  have nonzero `held_minor`.
- Expected ledger: available balance equals released net less debt offsets,
  explicit holds, and withdrawal reservations.
- Expected notification: no reserve notification or reserve terminology.
- Result: `NOT RUN`
- Notes:

### P-06 — Minimum withdrawal

- Preconditions: Provider A has at least EGP 200 available; modes on; save a
  fictional mobile-wallet destination in Earnings.
- Manual steps: enter 199.99 and submit; then enter 200 and submit.
- Expected UI: 199.99 rejected; 200 accepted when sufficient funds exist;
  minimum EGP 200 and zero fee are visible.
- Expected database: no request for 19,999 piastres; one request for 20,000.
- Expected ledger: accepted request reserves exactly 20,000 transactionally.
- Expected notification: one withdrawal-requested notification.
- Result: `NOT RUN`
- Notes:

### P-07 — Successful mock withdrawal

- Preconditions: fund and release `P-07 Successful mock withdrawal funding`;
  Provider A has a preferred masked destination.
- Manual steps: request EGP 200 in the app; run `withdrawal under_review
  p07-review-1 a`, `withdrawal processing p07-processing-1 a`, and `withdrawal
  paid p07-paid-1 a`; repeat the final command with the same key; refresh.
- Expected UI: development-only payout warning, masked destination, requested
  through paid states, and reduced available amount.
- Expected database: one withdrawal; final paid status once; no raw destination.
- Expected ledger: one reservation and one external-payout accounting transfer;
  no duplicate final posting and no real external call.
- Expected notification: requested and paid updates, once each.
- Result: `NOT RUN`
- Notes:

### P-08 — Failed mock withdrawal

- Preconditions: fund/release `P-08 Failed mock withdrawal funding`; request EGP
  200.
- Manual steps: run `withdrawal failed p08-failed-1 a` twice; refresh.
- Expected UI: failed status and restored available amount.
- Expected database: one failed withdrawal; reservation released once.
- Expected ledger: one reservation release; no paid posting.
- Expected notification: one failure update.
- Result: `NOT RUN`
- Notes:

### P-09 — Cash commission debt

- Preconditions: `P-09/P-10 Cash debt exactly EGP 500`; no prior Provider A cash
  debt, or perform a full reset first.
- Manual steps: Customer A selects cash; Provider A reports collection; Customer
  A confirms.
- Expected UI: Provider A sees EGP 500 commission due on EGP 5,000 cash work.
- Expected database: one cash commission record, gross 500,000 and outstanding
  50,000 piastres.
- Expected ledger: exactly 50,000 cash commission debt; no clearing funds.
- Expected notification: dual confirmation notifications once.
- Result: `NOT RUN`
- Notes:

### P-10 — Cash restriction threshold

- Preconditions: P-09 produced exactly EGP 500 debt.
- Manual steps: verify Cash remains offered on an unstarted Provider A fixture;
  complete the EGP 1 cash flow on `P-10 Cash debt above EGP 500`; then open an
  unstarted Provider A fixture such as P-11.
- Expected UI: exactly EGP 500 does not restrict; EGP 500.10 hides/disables only
  cash with a clear explanation; online mock payment remains available.
- Expected database: debt moves from 50,000 to 50,010 piastres; threshold check
  is strictly greater-than.
- Expected ledger: second cash confirmation adds exactly 10 piastres.
- Expected notification: no cancellation or destructive booking notification.
- Result: `NOT RUN`
- Notes:

### P-11 — Online earnings debt offset

- Preconditions: P-10 leaves Provider A debt above EGP 500.
- Manual steps: Customer A pays and succeeds `P-11 Online debt offset`, then
  confirms completion; Provider A refreshes Earnings.
- Expected UI: online job remains usable; debt clears; only the residual net is
  available and the explicit offset is shown.
- Expected database: cash records settle oldest first; earning
  `debt_offset_minor=50010`; cash debt zero.
- Expected ledger: released EGP 900 net first offsets EGP 500.10 debt and makes
  EGP 399.90 available.
- Expected notification: earnings release wording mentions an authorized
  financial adjustment, not an external debit.
- Result: `NOT RUN`
- Notes:

### P-12 — Payout destination masking

- Preconditions: modes on; Provider A Earnings.
- Manual steps: save fictional wallet `01000000001`; then save fictional bank
  `EG00WARSHASMOKE0001`; inspect list and observation output.
- Expected UI: only `•••• 0001`-style masks and chosen labels; explicit
  development-only payout warning.
- Expected database: public row contains type, label, mask, status, and
  preference only; no raw credential.
- Expected ledger: none.
- Expected notification: none required for destination storage.
- Result: `NOT RUN`
- Notes:

### P-13 — Reviewed post-release refund recovery

- Preconditions: Provider B; pay/succeed `P-13 Post-release recovery`; Customer
  A confirms completion so EGP 900 is available.
- Manual steps: run `case create wps007-p13-recovery 1000 p13-case-1`; run `case
  decide wps007-p13-recovery 1000 p13-decision-1`; observe. Then pay/succeed
  `P-13 Future recovery offset`, confirm completion, and observe both fixtures.
- Expected UI: Provider B sees a reviewed adjustment/debt, then an explicit
  future-earning offset; no bank/wallet debit claim.
- Expected database: 90,000 recovered from available earnings, 10,000 provider
  recovery debt, zero external provider debit; future earning offsets debt.
- Expected ledger: reviewed recovery and later debt-offset transactions balance;
  any remainder is available only after the offset.
- Expected notification: reviewed adjustment and release copy are factual.
- Result: `NOT RUN`
- Notes:

## Staff and developer cases

### S-01 — Place and remove an earning hold

- Preconditions: pay/succeed and release `S-01 Explicit earning hold`.
- Manual steps: run `hold wps007-s01-earning-hold hold 100 s01-hold-1`; refresh
  Provider A; run `hold wps007-s01-earning-hold release 100 s01-release-1`;
  refresh and observe.
- Expected UI: EGP 100 explicitly held only for the named earning, then restored.
- Expected database: one active then released hold with staff actor and reasons.
- Expected ledger: equal 10,000-piastre available/pending transfers each way.
- Expected notification: one held and one released update.
- Result: `NOT RUN`
- Notes:

### S-02 — Review a withdrawal

- Preconditions: P-07 requested withdrawal.
- Manual steps: use the guarded `withdrawal` commands for `under_review`,
  `processing`, and `paid`; try an invalid backward/final transition.
- Expected UI: Provider A sees valid transitions only.
- Expected database: Staff/Admin is the actor; final state cannot transition
  again except idempotently to itself.
- Expected ledger: reservation finalizes once.
- Expected notification: final outcome once.
- Result: `NOT RUN`
- Notes:

### S-03 — Create a partial refund

- Preconditions: C-08 paid and unreleased.
- Manual steps: use two distinct partial-refund commands, repeat one key, and
  observe.
- Expected UI: cumulative refunded amount is exact.
- Expected database: one row per distinct key; duplicate key returns existing
  result.
- Expected ledger: cumulative floor component allocation; immutable balanced
  reversals.
- Expected notification: one per distinct refund.
- Result: `NOT RUN`
- Notes:

### S-04 — Duplicate trusted event

- Preconditions: C-03.
- Manual steps: send the identical trusted event ID twice.
- Expected UI: one visible success.
- Expected database: second result `duplicate=true`.
- Expected ledger: one posting.
- Expected notification: one customer and one provider notification.
- Result: `NOT RUN`
- Notes:

### S-05 — Account isolation

- Preconditions: generate at least one Provider A and one Provider B earning;
  save at least one Provider A destination.
- Manual steps: sign in as each persona and attempt normal navigation; then run
  `npm.cmd run smoke:wps007 -- probes`.
- Expected UI: Customer A has no provider earnings/destinations; Provider A
  cannot see Provider B; Provider B cannot see Provider A; signed-out users
  have no financial data.
- Expected database: every probe `visible_rows=0`; every anonymous/private ACL
  probe `allowed=false`.
- Expected ledger: private ledger remains unreadable to authenticated clients.
- Expected notification: each persona sees only notifications addressed to its
  user ID.
- Result: `NOT RUN`
- Notes:

### S-06 — Live mode fail-closed

- Preconditions: finish other cases; run `modes off`.
- Manual steps: verify `modes status`; Customer A confirms online card is
  hidden; Provider A confirms withdrawals disabled. Optionally run `intent
  wps007-c01-online-success online s06-disabled-intent` and confirm the expected
  `Live payment provider is not configured` failure. Run `destination a
  mobile_wallet s06-disabled-destination` and confirm the expected payout-mode
  failure. Run `probes`.
- Expected UI: no usable online or payout action; cash remains truthful.
- Expected database: gateway disabled, payout disabled, scheduler false; failed
  attempts create no new money state.
- Expected ledger: no live payment, refund transfer, payout, webhook, or
  scheduled release. Staff refund commands record only internal reviewed
  accounting and do not execute an external refund.
- Expected notification: no success notification from a failed-closed action.
- Result: `NOT RUN`
- Notes:

## Full reset and reseed

The reliable reset strategy is a full local reset. It invalidates local test
sessions, removes all smoke financial state, reapplies migrations, and reseeds:

```powershell
npm.cmd run smoke:wps007 -- modes off
npx.cmd supabase db reset
npm.cmd run smoke:wps007 -- prepare
npm.cmd run smoke:wps007 -- modes on
```

Sign in again after the reset. The command targets the local CLI stack only.
Never add `--linked`, a hosted database URL, or `db push` to this procedure.

## Final restoration checklist

- [ ] Every executed case has `PASS`, `FAIL`, or `BLOCKED` plus notes.
- [ ] Failures include fixture key, device/platform, screenshot, observed SQL,
  and exact reproduction steps.
- [ ] `npm.cmd run smoke:wps007 -- modes off` completed.
- [ ] `modes status` shows gateway disabled.
- [ ] `modes status` shows payout disabled.
- [ ] `modes status` shows automatic scheduler false.
- [ ] No service-role key was copied into an Expo variable or document.
- [ ] No real card, bank, wallet, webhook, payout, or refund credential was used.
- [ ] No hosted migration or real `supabase db push` ran.
- [ ] Android and iOS results are entered in the results document.
- [ ] Deployment recommendation is completed only after reviewing every manual
  result and known defect.
