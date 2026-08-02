# Fraud Response Runbook

| Field | Value |
| --- | --- |
| Authority | Constitution → WPS-016 |
| Owner | Sief Abdelghfar |
| Core rule | **A signal is not a verdict** |

Fraud signals are advisory. They direct human attention and never punish. No
signal, and no combination of signals, may automatically restrict, suspend, or
ban an account.

## 1. Signal catalogue

| Signal | Typically indicates | Common innocent explanation |
| --- | --- | --- |
| `excessive_cancellations` | Booking abuse | Illness, family emergency, seasonal disruption |
| `duplicate_identity` | Multiple accounts | Shared household device or phone number reuse |
| `repeated_failed_verification` | Document fraud | Poor photo quality, low literacy, damaged ID |
| `abnormal_payment_behavior` | Payment fraud | A genuine large or unusual job |
| `repeated_chargebacks` | Chargeback abuse | A real service failure the customer disputed |
| `suspicious_review_activity` | Review manipulation | A genuine burst of completed jobs |
| `fake_portfolio_attempt` | Portfolio fraud | Stock photos used out of inexperience |
| `certificate_abuse` | Credential fraud | A genuine certificate that scans badly |
| `repeated_abuse_reports` | Harassment pattern | A worker targeted by one hostile customer |
| `account_farming` | Coordinated abuse | A workshop where several workers share an address |

The innocent column is not decoration. The Constitution requires that patterns,
context, and rates matter more than one-off events, and that no worker is
punished arbitrarily.

## 2. Response flow

1. **Observe.** Read the signal, its severity, its count, and its window.
2. **Corroborate.** A signal alone is never actionable. Look for a report, a
   dispute, a verification failure, or a financial case that independently
   supports it.
3. **Open an investigation** if corroborated. This is non-punitive and must be
   communicated as such.
4. **Contact the account** where safe and appropriate. Many signals resolve with
   one question.
5. **Decide** using the trust-safety runbook escalation ladder.
6. **Record** the evidence summary describing what actually corroborated the
   signal — never "flagged by system".

## 3. Severity guidance

| Severity | Meaning | Expected response |
| --- | --- | --- |
| `info` | Worth knowing | No action; review in aggregate |
| `low` | Weak pattern | Monitor |
| `medium` | Pattern worth checking | Corroborate before contact |
| `high` | Strong pattern | Investigate promptly |

`high` still does not authorize enforcement without corroboration.

## 4. Financial fraud

Money movement stays with WPS-007 and WPS-015:

- A payment or withdrawal hold under WPS-016 is a **trust restriction**, not a
  ledger posting. It does not move money.
- Any actual financial recovery goes through the WPS-007 staff-reviewed case,
  which records `externalProviderDebit: false`.
- **Never externally debit a worker after payout**, under any circumstance.
- Chargeback handling follows the WPS-015 incident runbook.

## 5. Coordinated abuse

When several accounts show correlated signals:

1. Do not mass-enforce. Each account is decided on its own evidence.
2. Open individual investigations.
3. Record the correlation in each evidence summary.
4. Escalate to the owner before any action affecting more than a handful of
   accounts.

## 6. Prohibited

- Enforcing on a signal alone
- Any automatic permanent ban
- Treating `duplicate_identity` as proof of fraud
- Treating `repeated_abuse_reports` as proof the subject is at fault — the
  subject may be the person being targeted
- Exposing signal logic, thresholds, or existence to any user
- Letting signals influence ranking, reputation, or discoverability
