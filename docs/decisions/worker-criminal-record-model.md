# Decision — worker criminal-record model

Authority: WPS-023. Status: **LOCKED (Model A)**. Legal review: **not performed**.

> This document records a product decision. It is **not legal advice**, claims
> **no legal compliance or approval**, and invents **no statutory requirement**.

---

## Decision

**Model A.** The worker obtains the official فيش وتشبيه certificate themselves
from the relevant authorities and uploads it to Warsha.

Warsha does not retrieve it, and does not claim to.

Specifically, Warsha does not claim and no schema column records: direct
Ministry integration, Ministry API access, automatic government lookup,
privileged government access, or automatic authenticity confirmation.

---

## Alternatives considered

**Model B — Warsha requests the certificate on the worker's behalf.** Rejected.
No integration exists, none is known to be available to a private platform, and
building a UI implying one would leave workers waiting for something that will
never arrive. This is the failure mode the copy is written to prevent: the
certificate screen states, before anything else, that the worker obtains it
themselves.

**Model C — no criminal-record check.** Rejected. Warsha sends people into
strangers' homes. Whether the check is lawful and what it may consider are open
questions (Q-01, Q-05); whether *some* safety check belongs in the product is
not.

**Model D — third-party background-check vendor.** Deferred. No vendor is
selected, none is contracted, and sending identity documents to a third party
requires a privacy assessment nobody has done. The extraction boundary is
provider-neutral so this stays open.

---

## The rule that was explicitly not implemented

> "Any offence within the previous 12 months automatically rejects the worker."

Rejected outright, for reasons that hold regardless of what a lawyer later says:

- It cannot distinguish an **accusation** from a **final conviction**.
- It cannot distinguish an offence **relevant to entering somebody's home** from
  one that is not.
- It cannot recognise **mistaken identity**, which is exactly the case where an
  automatic permanent rejection does the most harm.
- It cannot see a **pending appeal**, a **rehabilitation**, or a legally relevant
  correction.
- A twelve-month window is a number with no stated basis. Adopting it would have
  been inventing a statutory-looking rule.

**No AI decides criminal eligibility. No extraction decides it. No automatic
adverse decision follows from a low-confidence extraction or an ambiguous
record. Human confirmation is required for every adverse decision.**

---

## What exists instead

`private.worker_vetting_policies` — a versioned record whose criteria are **data
a human reads**, not logic anything executes.

```
policy_version      wps023-v1
legal_review_status pending
assessment_criteria 12 factors, each weighting = 'reviewer_judgement'
notes               ILLUSTRATIVE ONLY. Drafted for professional legal review,
                    not approved. No automatic rejection rule is implemented.
```

The twelve factors: offence category · severity · relevance to entering homes ·
conviction versus accusation · judgment finality · recency · pending appeal ·
mistaken identity · document authenticity · rehabilitation or legal correction ·
repeat pattern · staff evidence.

Every factor carries `weighting: 'reviewer_judgement'` — none is numeric and
none is automatic, asserted directly.

No code path reads `assessment_criteria` to produce an outcome. Asserted against
the bodies of `staff_record_certificate_outcome`,
`staff_worker_vetting_decision` and `worker_activation_gates`.

### Categories a lawyer-approved policy might treat as serious

Violence · theft · burglary · fraud · sexual offences · kidnapping · serious
weapons offences · drug trafficking · deliberate property damage · offences
directly relevant to customer safety.

**These are illustrative examples for professional review. They are not legally
approved, they are not implemented as rules, and no code path treats them as
such.**

---

## How the absence is tested

The first regression check searched the migration for the words "automatic
reject". It **failed** — because the seeded policy `notes` say *"No automatic
rejection rule is implemented"*, and that sentence satisfied the check for the
thing it described.

A string asserting an absence is not evidence of that absence, exactly as a
comment is not. The check now looks for the **machinery** such a rule would
need:

- no `interval '<n> month|year|day'` arithmetic anywhere in the vetting path
- no comparison deriving an outcome from how recent a document is
- every write of `'rejected'` sits inside a function opening with
  `require_staff_capability` and refusing without recorded evidence

---

## Storage and privacy

| Property | Value |
| --- | --- |
| Bucket | `worker-criminal-records`, private, 8 MB, four MIME types |
| Metadata | `public.worker_criminal_record_submissions` — **no offence column exists** |
| Assessment | `private.worker_criminal_record_review` — no RPC returns it |
| Staff access | `review_criminal_records` only, **not** `private.is_staff()` |
| Every access | logged individually with the capability |
| Customer access | none |
| Other workers | none |
| Notifications | state only, asserted free of offence text |
| Analytics | none |
| Realtime | not published |
| Privacy export | metadata excluded, document never exported |
| Retention | `worker_criminal_records` rule, `pending`, `enabled = false` |
| Deletion | cannot erase evidence under trust, dispute, fraud or legal hold |

The worker sees `safe_outcome_reason` and nothing else. A rejection's sensitive
detail is not exposed beyond what is necessary and safe.

---

## Retention

`proposed_days = 1825` (five years), `action_at_expiry = 'manual_review'`,
`legal_review_status = 'pending'`, `enabled = false`.

**The five years is a placeholder for professional advice, not a finding.** The
column is named `proposed_days` and the `authority` field reads *"Product
proposal. No statutory basis claimed. Unresolved legal question Q-03."*

`action_at_expiry` is `manual_review` rather than `delete` precisely because
nobody has established what the correct period or action is. A rule that
silently deleted evidence on a made-up schedule would be worse than one that
stops and asks.

---

## Open questions

Q-01 through Q-08 in [WPS-023 §18](../wps/WPS-023-authentication-role-onboarding-worker-vetting.md).
Q-01 (lawful to require at all), Q-05 (which offences may lawfully bar work),
Q-06 (accusations without conviction) and Q-08 (any authenticity method at all)
block treating this model as settled.

---

## Review trigger

This decision must be revisited if: a lawyer answers any of Q-01, Q-05, Q-06 or
Q-08; a government verification route becomes available; a background-check
vendor is contracted; or an appeal reveals the policy factors are insufficient
to reach a defensible decision.
