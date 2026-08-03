# WPS-017 Performance Plan — Operations, Analytics & Admin Platform

| Field | Value |
| --- | --- |
| Specification | WPS-017 v1.0 |
| Status | **Plan recorded. No load test executed.** |
| Data volume observed | Development scale only. Nothing here is a production measurement. |

## Honest starting position

Warsha has no production traffic, so this document sets **budgets and a method**,
not measured results. Every number below is a target to test against, not a
claim. When the first real dataset exists, this file records the measurement and
the plan becomes evidence.

## Strategy

Everything computes **on read**. There is no materialized view, no aggregate
table, and no refresh job in WPS-017.

That is a deliberate choice for this stage:

- Staff query volume is tiny — a handful of operators, not thousands of users.
- A materialized view is a second source of truth that can silently go stale, and
  a stale operational number is worse than a slow one.
- Refresh jobs need a scheduler, and no scheduler is enabled anywhere in Warsha.

Materialization becomes justified when a dashboard exceeds its budget on real
data. The trigger and the migration path are recorded below.

## Budgets

| Surface | Budget | Why |
| --- | --- | --- |
| `get_staff_session` | < 50 ms | Called on every screen; four indexed lookups |
| `get_staff_home` | < 400 ms | Per-queue counts plus a backlog probe |
| `get_staff_queue` | < 300 ms | Indexed, paginated, capped at 100 |
| `get_staff_case` | < 150 ms | Single case with its events and notes |
| `staff_safe_search` | < 200 ms | Exact identifier lookups only |
| `get_staff_customer_overview` / `get_staff_worker_overview` | < 400 ms | Several indexed counts |
| `get_staff_analytics` | < 1500 ms | Bounded aggregates over a bounded period |
| `staff_audit_search` | < 500 ms | Indexed, bounded, paginated |
| `staff_export_preview` | < 2000 ms | Capped at the configured row limit |

A surface exceeding its budget twice on real data is a defect, not a tuning task.

## Bounded by construction

Nothing in WPS-017 can trigger an unbounded scan from the client:

- Analytics ranges are capped at 366 days and refuse a wider request.
- Audit ranges are capped at 366 days.
- Export ranges are capped at 366 days and rows at the configured limit.
- Queue reads cap at 100 rows with an offset.
- Audit reads cap at 200 rows with an offset.
- Search accepts exact identifiers only — no `LIKE`, no prefix scan, no wildcard.
- Search is rate limited **before** any read happens.
- The backlog probe caps at 100 rows per queue.

## Indexes added

| Index | Supports |
| --- | --- |
| `staff_role_grants_active_unique_idx` | Uniqueness of an active grant; capability resolution |
| `staff_role_grants_user_idx` | Capability resolution on every call |
| `operational_assignments_queue_open_idx` | Queue listing ordered by priority and age |
| `operational_assignments_assignee_idx` | Personal workload and overdue counts |
| `operational_assignment_events_assignment_idx` | Case timeline |
| `operational_case_notes_assignment_idx` | Private notes on a case |
| `staff_audit_events_actor_idx` / `_entity_idx` | Audit explorer filters |
| `staff_access_log_actor_idx` | Search rate limiting and access review |
| `operational_incidents_open_idx` | Active incident list |
| `operational_incident_events_incident_idx` / `_idempotency_idx` | Incident timeline and idempotency |
| `support_tickets_open_idx` / `support_messages_ticket_idx` | Support queue and thread |
| `staff_configuration_active_unique_idx` | One active version per domain and environment |

Domain-side reads reuse the indexes those specifications already created; WPS-017
added none to their tables.

## Known hot spots to watch first

1. **`private.is_staff()` in RLS.** It is evaluated by many existing policies. It
   now short-circuits on the legacy `user_roles` lookup and only reaches the
   capability path for accounts that hold a grant — so a customer pays one extra
   indexed `EXISTS` and nothing more. Measure this first on real data; it is the
   only change WPS-017 makes to a hot customer path.
2. **`get_staff_home` backlog probes.** One probe per visible queue, each capped.
   With eighteen queues visible to a break-glass account this is eighteen bounded
   queries. If it exceeds budget, drop the probe to a count-only query before
   considering materialization.
3. **`get_staff_analytics('marketplace')`.** A lateral per request over
   `worker_quotes`. This is the first dashboard expected to need attention as
   request volume grows.
4. **`staff_audit_search('payment_audit')`.** Filters across four nullable
   identifier columns; may need a composite index once the table is large.

## Method when real data exists

1. Seed or snapshot a realistic dataset; record its row counts in this file.
2. Run each surface ten times warm, record p50 and p95.
3. `EXPLAIN (ANALYZE, BUFFERS)` anything above budget.
4. Fix in this order: index, query shape, narrower projection, pagination,
   aggregate table, materialized view. Stop at the first that works.
5. Record what was measured, not what was expected.

## Materialization trigger

Introduce an aggregate table only when **all** of these hold:

- a dashboard exceeds its budget at p95 on real data;
- the query shape has already been fixed and is still too slow;
- the metric's definition in `WARSHA-METRIC-CATALOG.md` is stable;
- staleness is acceptable for that metric and the acceptable staleness is written
  into the catalog entry.

Any materialization must state its refresh mechanism. Warsha has no scheduler, so
"refresh on read with a staleness window" is the only currently viable pattern.

## Client performance

- Dashboards render accessible tables rather than charts, so there is no charting
  library and no layout thrash.
- Queue and audit lists are bounded by the server, so no list virtualization is
  required at the volumes WPS-017 permits.
- The admin surface adds no dependency to the project.

## Not done

- No load test executed.
- No production measurement exists.
- No p95 is claimed anywhere in this document.
