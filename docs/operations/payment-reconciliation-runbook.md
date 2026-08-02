# Payment Reconciliation Runbook

| Field | Value |
| --- | --- |
| Authority | Constitution → WPS-007 → WPS-015 |
| Status | Baseline — reconciliation is disabled by default |
| Owner | Sief Abdelghfar |

**Reconciliation detects differences. It never conceals them.** No step in this
runbook silently adjusts a figure to make two systems agree.

## 1. Scope

A reconciliation run compares, for one business date:

- Warsha payment attempts and payments
- provider payment transactions and settlement lines
- gateway fees
- refunds
- chargebacks
- payouts and payout failures
- ledger postings

## 2. Enabling

Reconciliation runs only when `reconciliation_enabled = true` **and** the gateway
surface is not `disabled`. While disabled, a run returns
`{"status":"disabled"}` and fabricates nothing — no run row, no exception.

## 3. Daily job contract

```
select private.run_payment_reconciliation(<business_date>, 'daily', <idempotency_key>);
```

- Idempotent by `idempotency_key`; a repeat returns `{"status":"duplicate"}`.
- Creates one `reconciliation_runs` row and typed `reconciliation_exceptions`.
- Performs an explicit debit/credit balancing check across the ledger for the date
  and records `ledger_balanced`.
- Never mutates a payment, an earning, or a ledger entry.

Statement import populates `payment_settlements` and `payment_settlement_lines`
through the provider's statement export or API. Import is idempotent per
`(provider_key, environment, provider_settlement_reference)`.

## 4. Exception types and first response

| Type | Meaning | First response |
| --- | --- | --- |
| `unmatched_provider_record` | Provider has a transaction Warsha does not | Find the attempt by provider reference; if none exists, treat as an orphan and investigate intent creation |
| `unmatched_warsha_record` | Warsha has a payment the provider does not | Confirm with the provider's inquiry API before any refund or release |
| `amount_mismatch` | Provider amount ≠ immutable snapshot | Snapshot is authoritative. See the incident runbook. Never accept the provider figure |
| `currency_mismatch` | Non-EGP record | Always an incident. EGP is the only currency |
| `duplicate_record` | Provider reported the same transaction twice | Confirm only one ledger posting exists |
| `missing_webhook` | Attempt succeeded, payment not paid | Replay the provider event; processing is idempotent |
| `late_webhook` | Event arrived after the attempt was terminal | Confirm the terminal state is correct; late events never move it backwards |
| `orphan_provider_event` | Quarantined event with no attempt | Investigate provider configuration and environment matching |
| `ledger_imbalance` | Debits ≠ credits for the date | **SEV1.** Stop and follow the incident runbook |
| `payout_mismatch` | Payout records disagree | Verify the reservation released exactly once |

## 5. Staff resolution

```
select public.review_reconciliation_exception(<exception_id>, <status>, <note>);
```

`status` is `investigating`, `resolved`, or `accepted_difference`. A note of 3–500
characters is mandatory.

Resolution is an **audit record**. It does not change money, does not rewrite
ledger history, and does not perform an automatic destructive correction. Where a
financial correction is genuinely required, it is made through the existing
WPS-007 refund, hold, or post-release case RPCs, which post new balanced entries.

`accepted_difference` is reserved for differences that are real, understood, and
deliberately tolerated — for example a provider fee timing difference. It must
never be used to dismiss an unexplained discrepancy.

## 6. Balancing checks

Every run asserts that debits equal credits across the authoritative ledger for
the date. Additionally verify periodically that:

- commission equals `floor(gross × 10% )` per payment;
- promotion expense never reduces worker gross or the commission basis;
- gateway fees appear only as Warsha expense and never alter the customer total or
  worker earnings;
- cash records post no clearing entry;
- refunds reverse components cumulatively and proportionally with exact final rounding;
- no worker available balance is unrestrictedly negative.

## 7. Retention and audit

Runs, exceptions, quarantine rows, settlements, and settlement lines are immutable
operational history. They are never deleted to clear a queue. Reports expose
counts, typed reasons, and safe references only — never a raw provider payload,
credential, PAN, or personal contact detail.
