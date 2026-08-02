# Account Enforcement Runbook

| Field | Value |
| --- | --- |
| Authority | Constitution → WPS-016 |
| Owner | Sief Abdelghfar |
| Core rule | **Least restrictive measure that addresses the risk** |

## 1. Measures

| Measure | Reversible | Time-bounded | Appealable |
| --- | --- | --- | --- |
| Warning | Yes | No | Yes |
| Temporary restriction | Yes | Yes | Yes |
| Investigation | Yes | Yes | No — not punitive |
| Marketplace removal | Yes | Yes | Yes |
| Hidden profile | Yes | Yes | Yes |
| Payment hold | Yes | Yes | Yes |
| Withdrawal hold | Yes | Yes | Yes |
| Communication restriction | Yes | Yes | Yes |
| Review restriction | Yes | Yes | Yes |
| Suspension | Yes | Yes | Yes |
| Permanent ban | Only by appeal | **No** | Yes |
| Restoration | — | — | No |

## 2. Choosing a measure

Ask, in order:

1. What specific harm is occurring?
2. What is the narrowest measure that stops it?
3. Is the evidence strong enough to survive an appeal?
4. Is this a first occurrence, or a pattern?
5. Could there be an innocent explanation?

A single incident rarely justifies more than a warning or a targeted
restriction. The Constitution forbids arbitrary punishment for an isolated
incident and requires that patterns and context outweigh one-off mistakes.

Prefer a targeted restriction over a suspension: restricting communication for
harassment keeps a worker earning while stopping the harm.

## 3. Applying an action

```
select public.staff_record_enforcement_action(
  <subject_user_id>, <action_type>, <reason_code>,
  <public_reason>, <evidence_summary>, <idempotency_key>,
  <report_id>, <expires_at>);
```

Checklist:

- [ ] Evidence summary describes what was actually observed
- [ ] Public reason is plain, non-accusatory, and names no reporter
- [ ] `expires_at` set for every time-bounded measure
- [ ] `report_id` linked where a report drove the decision
- [ ] Idempotency key is unique to this decision

The action is written to an immutable ledger and audited automatically.

## 4. Permanent bans

Reserved for severe or repeated harm: confirmed fraud, credible threats, illegal
activity, or repeated serious violations after prior enforcement.

Requirements enforced by the database:

- A report that reached `investigating` or `actioned`
- A human staff actor — a `system` actor is structurally forbidden from issuing
  anything except a non-punitive investigation
- No expiry (a ban is terminal)

Requirements enforced by process:

- Second staff reviewer
- Appeal route communicated in the public reason
- Owner notification

**No automated process may ever issue a ban.**

## 5. Communicating a decision

The account sees the trust level, the applicable restrictions, the public reason,
the expiry where one exists, and the appeal route. It never sees the reporter,
the evidence, staff notes, or fraud signals.

Copy rules: explain the restriction, do not accuse; state that a review does not
mean wrongdoing; always offer the appeal where one exists. English and Egyptian
Arabic both required, with RTL.

## 6. Expiry and restoration

Time-bounded measures lift automatically at `expires_at` — no job required, since
the capability gate treats an expired restriction as lifted.

Early restoration is an explicit audited action, never a silent edit:

```
select public.staff_record_enforcement_action(
  <subject_user_id>, 'restoration', <reason_code>,
  <public_reason>, <evidence_summary>, <idempotency_key>);
```

## 7. Interaction with other systems

- Trust restrictions are an **additional** gate. They never replace WPS-008
  marketplace eligibility or WPS-006 verification.
- A payment or withdrawal hold is a trust restriction, not a ledger posting. Use
  WPS-007 for money.
- Enforcement never alters ranking or reputation directly.

## 8. Prohibited

- Automating any enforcement
- Enforcing without evidence
- Editing or deleting enforcement history
- Suspending an account to "buy time" instead of opening an investigation
- Using enforcement to resolve a service dispute — that is WPS-013
