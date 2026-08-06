# Runbook — worker appeal

Authority: WPS-023, reusing WPS-016. Capability required: `review_appeals`.

---

## The separation rule is enforced, not requested

```sql
private.worker_appeal_reviewer_is_independent(p_user_id, p_reviewer)
```

If you made **any** adverse decision on this account — a rejection or a
suspension — the server refuses your appeal decision with `42501`.

This is in SQL rather than in this runbook on purpose. A runbook rule saying "a
different person must review appeals" is a rule that gets skipped at 2am on a
busy queue by somebody who means well.

Do not look for a way around it. If you are the only reviewer available, the
appeal waits.

---

## Who can appeal, and when

Only from `rejected`. The RPC raises `22023` — *No decision is open to appeal* —
from any other state.

A suspended worker does not appeal here; suspension is a WPS-016 enforcement
action with its own appeal path.

The appeal statement must be 10–2,000 characters. It is stored as private
evidence attached to the transition, not as a public field.

---

## Procedure

1. Read the full lifecycle history for the account:
   `public.worker_onboarding_events`, which is immutable and complete.
2. Read the private evidence behind the adverse decision:
   `private.worker_onboarding_evidence` and, for a certificate,
   `private.worker_criminal_record_review`.
3. Read the appellant's statement.
4. Re-examine the documents yourself if the appeal turns on them. That is a
   fresh, separately logged access under the relevant capability.
5. Decide.

---

## Outcomes

```
staff_decide_vetting_appeal(user_id, outcome, safe_reason, private_note)
```

| Outcome | Resulting state | When |
| --- | --- | --- |
| `upheld` | `rejected` | The original decision was right |
| `overturned` | `approved` | The original decision was wrong |
| `correction_required` | `correction_required` | Resolvable with a better document |
| `manual_review` | `manual_review` | Needs more than you can settle |

`private_note` must be at least ten characters. The server refuses less.

`overturned` moves the account to `approved`, **not** `active`. Activation
remains a separate decision under `activate_worker` with all gates re-checked —
overturning a rejection does not skip the evidence.

---

## Writing the safe reason

It goes to the worker. It should say what was decided and, where possible, what
happens next.

Good: *"We looked at your application again and approved it."*
Good: *"Please send a clearer copy of the certificate and we will review it
again."*
Bad: anything quoting the private evidence, naming the original reviewer, or
naming an offence.

---

## Never

- Decide an appeal against your own adverse decision.
- Let an AI or any automated rule decide an appeal outcome.
- Disclose the private evidence, the original reviewer's identity, or offence
  detail to the appellant.
- Treat a second rejection as final policy — an appeal that reveals the twelve
  policy factors are insufficient to reach a defensible decision is a trigger to
  revisit
  [worker-criminal-record-model](../../decisions/worker-criminal-record-model.md),
  not a reason to reject harder.
