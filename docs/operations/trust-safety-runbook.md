# Trust & Safety Runbook

| Field | Value |
| --- | --- |
| Authority | Constitution → WPS-016 |
| Owner | Sief Abdelghfar |
| Scope | Day-to-day report triage and moderation |

**Every decision in WPS-016 is made by a human.** There is no external moderation
provider and no AI moderation. Nothing in this runbook may be automated into an
enforcement action.

## 1. Queue

```
select public.get_staff_trust_queue_summary();
```

Returns open reports, investigating count, open appeals, active restrictions, and
high-severity signal count.

## 2. Triage

Move every new report out of `submitted` promptly:

```
select public.staff_transition_trust_report(<report_id>, 'triage');
```

Then classify:

| Outcome | Status | Notes |
| --- | --- | --- |
| Needs investigation | `investigating` | Required before any permanent ban |
| Already reported | `duplicate` | Link the original in the audit reason |
| No violation | `dismissed` | Dismissal is a legitimate, common outcome |
| Violation confirmed | `actioned` | Record the enforcement action separately |

A report is **not** evidence of guilt. Repeated reports from one reporter about
one subject are one signal, not proof.

## 3. Routing to the correct authority

WPS-016 does not moderate content that another system owns. Route as follows:

| Report subject | Route to |
| --- | --- |
| Review content | WPS-011 `moderate_review` |
| Chat message | WPS-009 `booking_abuse_reports` flow |
| Service quality or money dispute | WPS-013 disputes |
| Payment-provider chargeback | WPS-015 chargeback intake |
| Identity, documents, certificates | WPS-006 verification review |
| Earnings/payout money movement | WPS-007 hold and case RPCs |

Record the WPS-016 report outcome once the owning authority has decided.

## 4. Enforcement

```
select public.staff_record_enforcement_action(
  <subject_user_id>, <action_type>, <reason_code>,
  <public_reason>, <evidence_summary>, <idempotency_key>,
  <report_id>, <expires_at>);
```

Requirements:

- **Evidence is mandatory.** The database rejects an action without it.
- The public reason is what the account sees. Write it plainly, without
  accusation, and without naming the reporter.
- Prefer the least restrictive measure that addresses the risk.
- Use `investigation` when reviewing — it is explicitly not punitive and must be
  communicated that way.
- Set `expires_at` on every time-bounded measure. An expired restriction lifts
  automatically.

### Escalation ladder

warning → temporary restriction → targeted restriction (communication, review,
marketplace, profile, payment, withdrawal) → suspension → permanent ban

Skipping steps requires a documented reason in the evidence summary. Severity of
harm, not report volume, drives escalation.

## 5. Permanent bans

A permanent ban requires **all** of:

- [ ] A report that reached `investigating` or `actioned`
- [ ] A human staff actor
- [ ] An evidence summary that would stand up to review
- [ ] A second staff reviewer for irreversible cases
- [ ] Confirmation that an appeal route was communicated

The database refuses a ban without an investigated report and forbids a system
actor from issuing one. **Never** script or schedule a ban.

## 6. Restoration

Restoration is always its own audited action:

```
select public.staff_record_enforcement_action(
  <subject_user_id>, 'restoration', 'appeal_upheld',
  <public_reason>, <evidence_summary>, <idempotency_key>);
```

It clears every restriction flag and returns the account to `good_standing`.

## 7. Privacy rules

- Never disclose who reported an account, in any channel.
- Never share evidence, staff notes, or fraud signals with either party.
- Never explain internal thresholds or signal logic.
- Public reasons describe the behaviour and the consequence, nothing else.

## 8. Prohibited

- Automating any enforcement action
- Issuing a permanent ban without an investigated report
- Enforcing on a fraud signal alone
- Deleting or editing a report, enforcement action, or audit row
- Using trust actions to influence ranking or reputation
- Punishing a good-faith reporter
