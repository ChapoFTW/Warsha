# Runbook — legal and operational holds

**Owner:** Security administrator
**Capability:** `manage_legal_holds` (high risk · dual control · re-auth)

---

## 1. What a hold is, and is not

A hold **suspends a person's ability to have their data removed** while a
documented matter is open. That is a serious act, which is why the capability
sits with the security administrator and not with case work.

A hold is **not** a retention policy. It is not a way to keep data "just in
case", and it is not a substitute for answering a retention question. Three
constraints enforce that:

- a hold **requires a future review date**;
- a hold may not run **more than a year** without review;
- **the person who created a hold cannot release it** while dual control is on.

## 2. Scopes

| Scope | Blocks |
| --- | --- |
| `account` | Everything about the person |
| `identity_documents` | Verification documents and certificates |
| `financial_records` | Financial rows and payout data |
| `communications` | Messages and attachments |
| `dispute_evidence` | Dispute files |
| `trust_evidence` | Safety reports and evidence |
| `support_records` | Support cases and attachments |

An `account` hold covers every narrower scope. Use the narrowest scope that
covers the matter — a hold on the whole person to preserve one dispute file is
disproportionate and will show up as such at review.

## 3. Reason categories

`active_investigation` · `fraud_review` · `payment_dispute` ·
`regulatory_request` · `litigation` · `safety_investigation`

If the matter does not fit one of these, it probably is not a hold.

## 4. Creating a hold

```sql
select public.staff_create_legal_hold(
  '<subject_user_id>',
  'dispute_evidence',
  'active_investigation',
  'Free text, 10-2000 characters. State the matter, not the conclusion.',
  now() + interval '90 days'
);
```

The function requires the capability, applies the `staff_privileged_action`
rate limit, refuses a null or past review date, refuses a review date more than
a year out, writes an immutable `created` event, and records a staff audit entry
carrying the scope and reason category.

**Write the note as if the subject will read it one day.** State what matter is
open. Do not state a conclusion, an accusation, or a name.

## 5. Releasing a hold

```sql
select public.staff_release_legal_hold('<hold_id>', 'Reason, 10+ characters.');
```

- Refuses if the actor **created** the hold and dual control is enabled.
- Returns `false` — not an error — if already released. Idempotent by design.
- Writes an immutable `released` event and a staff audit entry.

Releasing unblocks deletion of the evidence in scope. That is why it needs a
second person: the same individual should not be able to both freeze and
un-freeze the record of a matter they are involved in.

## 6. Review

Every hold carries `review_due_at`. Reviewing means answering one question:
**is the matter still open?**

- Still open → extend, with a new review date and a note saying why.
- Closed → release, with a reason.
- Cannot tell → escalate. Do not extend by default.

```sql
-- Holds due for review. Run as DBA; the table has no client grant.
select id, subject_user_id, scope, reason_category, created_at, review_due_at
from private.privacy_legal_holds
where released_at is null and review_due_at <= now() + interval '7 days'
order by review_due_at;
```

An unreviewed hold past its date is a defect. It means data is being retained
by neglect rather than by decision — exactly what the review date exists to
prevent.

## 7. The subject is never told

There is deliberately **no `privacy_legal_hold` notification event**, and pgTAP
asserts its absence.

If a held account requests deletion they see the `legal_hold` state and this
sentence:

> *"We have to keep your information for now. We cannot say more, and nothing
> you do will change it. Support can help if you have questions."*

It says three true things: the data is kept, Warsha will not elaborate, and
nothing they do will help. It names no reason, no matter, and no person. It also
does not pretend the request is progressing.

**Support must not elaborate on this.** The sentence is the whole answer.

## 8. Immutability

`private.privacy_legal_hold_events` refuses `UPDATE` and `DELETE`
unconditionally. Both creation and release are recorded, retained 3650 days, and
never pruned automatically.

## 9. Audit

Every create and release writes to `private.staff_audit_events` with the actor,
capability, entity, and reason. That table is immutable and staff themselves
hold no grant on it — staff can be audited, and cannot read the audit by holding
a capability.
