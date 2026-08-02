# Appeals Runbook

| Field | Value |
| --- | --- |
| Authority | Constitution → WPS-016 |
| Owner | Sief Abdelghfar |
| Core rule | **A different reviewer than the one who enforced** |

Every account subject to a warning, restriction, suspension, or ban may appeal.
Fair process is a constitutional requirement, not a courtesy.

## 1. Eligibility

| Action | Appealable |
| --- | --- |
| Warning, temporary restriction, targeted restriction, suspension, permanent ban | Yes |
| Investigation | No — it is not punitive |
| Restoration | No — it is favourable |

One appeal per enforcement action per account. A second submission returns the
existing appeal rather than creating a duplicate.

## 2. Intake

The appellant submits a statement of 10–2000 characters through
`public.submit_trust_appeal`. Appeals are private: only the appellant and staff
can read them.

## 3. Review

1. **Reassign.** Wherever staffing allows, the reviewer must not be the staff
   member who issued the action.
2. **Re-read the original evidence.** Judge whether it actually supports the
   measure taken.
3. **Consider the statement on its merits.** An explanation that was never asked
   for is not a lie.
4. **Check proportionality.** Even a correct finding can carry a disproportionate
   measure.
5. **Check context.** First occurrence, rate, pattern, and any innocent
   explanation.

```
select public.staff_decide_trust_appeal(<appeal_id>, <status>, <decision_note>);
```

A decision note is mandatory.

## 4. Outcomes

| Outcome | Meaning | Follow-up |
| --- | --- | --- |
| `under_review` | Assigned, not decided | None |
| `upheld` | Original action stands | Communicate plainly |
| `overturned` | Action was wrong | **Restoration action required** |
| `partially_overturned` | Measure was disproportionate | **Restoration action required**, then apply the lesser measure |
| `withdrawn` | Appellant withdrew | None |

An overturned or partially overturned decision returns
`restorationRequired: true`. Restoration is a **separate audited enforcement
action** so history always records who restored access and why. The appeal
decision alone never silently changes trust state.

## 5. Communicating the outcome

Tell the appellant the outcome, what it means for their account, and what
changes now. Never disclose the reporter, the evidence, staff notes, or fraud
signals. Both English and Egyptian Arabic, with RTL.

Where an appeal is upheld, say so plainly and without lecturing.

## 6. Quality checks

Review periodically:

- Appeal rate by action type — a high rate suggests over-enforcement
- Overturn rate — a high rate suggests weak evidence standards
- Time to decision
- Whether reviewers are genuinely distinct from enforcers

A high overturn rate is a signal about **Warsha's** process, not about the
appellants.

## 7. Prohibited

- Deciding an appeal without reading the original evidence
- Deciding your own enforcement action where another reviewer is available
- Disclosing reporter identity or evidence
- Retaliating against an appellant
- Leaving an appeal undecided indefinitely
- Restoring access without recording a restoration action
