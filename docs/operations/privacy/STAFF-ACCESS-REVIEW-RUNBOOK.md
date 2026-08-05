# Runbook — staff access review

**Owner:** Security administrator
**Capability:** `view_audit_logs` · `view_data_inventory`
**Cadence:** `staff_platform_configuration.access_review_interval_days`

---

## 1. What is being reviewed

Two questions, and they are different:

1. **Does each staff member still need the capabilities they hold?**
2. **Was each sensitive read they performed legitimate?**

The first is about standing permission. The second is about what was actually
done with it. A review that only answers the first is not a review.

## 2. Privacy capabilities

| Capability | Domain | Grants | High risk |
| --- | --- | --- | --- |
| `review_privacy_requests` | accounts | Request **state**, never contents | No |
| `manage_legal_holds` | security | Create and release holds | **Yes** — dual control, re-auth |
| `review_retention` | audit | Dry runs and orphan previews | No |
| `view_data_inventory` | audit | Inventory and classification | No |
| `review_privacy_incidents` | incidents | Privacy facts on an incident | No |

**There is no capability that reads the contents of somebody's export.** No RPC
returns one to staff. If someone asks for that capability, the answer is that it
does not exist — an export is built for one person.

## 3. Who should hold what

| Role | Privacy capabilities |
| --- | --- |
| `security_administrator` | All five |
| `operations_manager` | `review_privacy_requests`, `review_retention` |
| `super_administrator` | All five (break glass) |
| Everyone else | **None** |

If a support agent or dispute reviewer holds any privacy capability, that is a
finding. Support answers privacy questions from the runbooks, not from the data.

## 4. Reviewing the reads

```sql
-- Privacy reads in the review window.
select actor_id, query_shape, count(*), max(created_at)
from private.staff_access_log
where surface = 'audit_explorer'
  and query_shape like 'privacy_%'
  and created_at > now() - interval '90 days'
group by actor_id, query_shape
order by count(*) desc;
```

Two shapes exist: `privacy_deletion_requests` and `privacy_data_inventory`.

What to look for:

- **Volume out of keeping with the role.** Reading the deletion queue daily is
  normal for operations; hundreds of reads by one actor is not.
- **Reads with no corresponding case.** A privacy read should be traceable to a
  support case or an incident.
- **Reads by someone who has changed role.** Capability removal is immediate,
  but a review looks backwards.

The log stores a **fixed shape**, never a phrase anybody typed. Any row where
`query_shape` looks like free text is itself a finding — WPS-018 requires shapes,
not queries, and pgTAP asserts it.

## 5. Reviewing hold actions

```sql
select actor_id, action, entity_id, reason, created_at
from private.staff_audit_events
where capability_key = 'manage_legal_holds'
  and created_at > now() - interval '90 days'
order by created_at desc;
```

Check each: was the scope the narrowest that covered the matter? Was the review
date proportionate? Was the release performed by somebody other than the
creator? Dual control enforces the last one, but confirm it was not disabled.

## 6. Holds past review

```sql
select id, subject_user_id, scope, reason_category, created_at, review_due_at
from private.privacy_legal_holds
where released_at is null and review_due_at <= now()
order by review_due_at;
```

**Any row here is a finding.** It means data is being retained by neglect rather
than by decision.

## 7. Capability drift

```sql
select g.user_id, g.role_key, rc.capability_key
from public.staff_role_grants g
join public.staff_role_capabilities rc on rc.role_key = g.role_key
where rc.capability_key in ('review_privacy_requests','manage_legal_holds',
      'review_retention','view_data_inventory','review_privacy_incidents')
  and (g.expires_at is null or g.expires_at > now())
order by g.user_id;
```

Compare against §3. Anything outside that table needs a written reason or
removal.

## 8. Recording the review

Use `private.staff_access_reviews` (WPS-018). Record the window, the reviewer,
the findings, and the actions taken.

A review that finds nothing is still recorded. "Reviewed, no findings" is
evidence; silence is not.

## 9. What staff can never do, by construction

- Read the contents of an export.
- See why somebody asked to delete their account.
- See which blockers an account hit.
- Read `private.staff_access_log` or `private.staff_audit_events` through any
  capability — those tables have no client grant at all, so staff can be
  audited but cannot read the audit.
- Create and release the same hold, while dual control is on.
