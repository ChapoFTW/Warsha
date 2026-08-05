# Warsha open privacy and legal questions

> **Warsha does not claim legal compliance.** Nothing in this repository has
> been reviewed by an Egyptian lawyer, accountant, or data-protection
> specialist. This document does not claim legal compliance, does not assert
> that any duration is lawful, and does not substitute for professional advice.
>
> Every question below is **unresolved**. Where a duration appears in
> `private.privacy_retention_rules`, it is a **product proposal** carrying
> `legal_review_status = 'pending'`, and the execution guard refuses to run it.

## How to read this

| Field | Meaning |
| --- | --- |
| **Blocks** | What cannot safely proceed until it is answered |
| **Current behaviour** | What the code does today, in the absence of an answer |
| **Who should answer** | The kind of professional required |

## The questions

| ID | Question | Blocks | Current behaviour | Who should answer |
| --- | --- | --- | --- | --- |
| **Q-01** | How long must worker identity documents be retained after a verification decision, and must they be retained at all once a decision is recorded? | `identity_documents` retention rule; storage cleanup for `verification-documents` | Placeholder 1825 days, action `manual_review`, never automatic. Files are not deleted | Egyptian data-protection and employment counsel |
| **Q-02** | How long must financial records — ledger entries, payments, refunds, payouts — be retained for tax and accounting purposes? | `financial_records` rule; any minimization of financial identifiers | Placeholder 3650 days, action `retain`. Never deleted, never minimized | Egyptian tax adviser and chartered accountant |
| **Q-03** | Must an invoice or receipt retain the customer's name and address, or may those be reduced to an account reference after settlement? | Whether anonymization may minimize financial rows | Financial rows are untouched by anonymization | Egyptian tax adviser |
| **Q-04** | How long must dispute and consumer-complaint evidence be retained? | `dispute_evidence` rule; `support_attachments` rule | Placeholders 730 / 365 days, action `manual_review` | Egyptian consumer-protection counsel |
| **Q-05** | Does Egyptian law grant a data-subject right to erasure, and if so what are its limits and response deadline? | Whether the cooling-off period, blockers, and preservation set are lawful | 168-hour cooling-off (a product choice); nine blockers; documented preservation set | Egyptian data-protection counsel |
| **Q-06** | Does Egyptian law grant a right to data portability, and in what format and timeframe? | Export scope, format, and deadline | Manifest generated; no file produced; no deadline claimed | Egyptian data-protection counsel |
| **Q-07** | Is a worker on Warsha an independent contractor or an employee, and does that change what Warsha must retain about them? | Identity-document retention; payout records; whether employment records apply | Treated as independent throughout; no employment-record retention exists | Egyptian employment counsel |
| **Q-08** | Does Warsha need a written data-processing agreement with Supabase or Expo, and what must it contain? | The subprocessor register's legal standing | Register records technical facts only | Egyptian data-protection counsel |
| **Q-09** | Are there data-residency requirements that constrain which Supabase region may be used? | Hosting region selection | All data in the project's configured region; no independent transfer | Egyptian data-protection counsel |
| **Q-10** | Is there a mandatory breach-notification duty, to whom, and within what period? | The privacy-incident external-notification decision | Recorded as a decision; **never performed automatically**; no regulator is contacted by any code | Egyptian data-protection counsel |
| **Q-11** | What consent standard applies to optional processing, and is a recorded acknowledgement sufficient for a privacy notice? | The consent model's required/optional split | Eight purposes; three required; immutable ledger with document versions | Egyptian data-protection counsel |
| **Q-12** | May Warsha retain a pseudonymous account row indefinitely after deletion, given it is needed for referential integrity? | The entire anonymization model | Account UUID retained; documented as pseudonymization, never as anonymity | Egyptian data-protection counsel |
| **Q-13** | How long may communication history be retained after a booking closes, and does one participant's deletion affect the other's copy? | `chat_messages` rule | Placeholder 1095 days, action `manual_review`. One party's deletion does not remove the other's record | Egyptian data-protection counsel |
| **Q-14** | Must a legal hold be disclosed to its subject, and may Warsha decline to say why? | Hold notification behaviour | A hold is **never** notified. The blocked-deletion copy says Warsha must keep the data, that nothing the account does will change it, and points to support | Egyptian counsel |
| **Q-15** | What are the obligations around minors, and must Warsha verify age? | Whether an age gate is required | No age collection and no age gate exist | Egyptian counsel |
| **Q-16** | Does the referral programme's permanent attribution record — retained specifically to prevent delete-and-recreate fraud — survive an erasure request? | `referral_attributions` preservation | Preserved. Documented as fraud prevention | Egyptian data-protection counsel |

## What is safe to say today

Warsha can accurately state:

- what it collects and why, per class and per object;
- who can read each class, and under which capability;
- what a deletion request removes and what it preserves, with reasons;
- that pseudonymized data is **not** anonymous;
- that no personal data reaches any third party beyond Supabase and Expo;
- that no live payment, SMS, email, analytics or advertising provider exists.

## What Warsha must not say until these are answered

- that it complies with any statute;
- that any retention duration is legally required or legally sufficient;
- that a deletion is complete in a legal sense;
- that data is anonymous;
- that a regulator has been notified of anything.

The client regression suite asserts that **no user-facing string** contains
`complian`, `legally required`, `by law`, `regulat`, or `statutor`.

## Until answers arrive

1. Retention rules stay `pending` and remain non-executable.
2. Production retention execution stays disabled.
3. Identity documents and financial records are never deleted automatically.
4. Deletion and export ship behind flags that are off.
5. Every user-facing string stays free of legal claims.
