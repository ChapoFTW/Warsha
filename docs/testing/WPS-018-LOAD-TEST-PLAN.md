# WPS-018 Load Test Plan

| Field | Value |
| --- | --- |
| Specification | WPS-018 v1.0 |
| Status | **NO LOAD TEST HAS BEEN EXECUTED** |
| Measurements | None |
| Production percentiles claimed | **None** |

## The honest position

Warsha has no production traffic and no hosted staging project. Every number in
this document is a **budget to test against**, not a measurement. No p95 exists.
Nothing here may be quoted as evidence of performance.

Local timings are not predictive: a developer machine has no network latency, a
warm cache, one connection, and a database with a few hundred rows. Publishing a
local number as a performance result would be worse than publishing nothing.

## What must exist before any load test

| # | Prerequisite | State |
| --- | --- | --- |
| L01 | A hosted staging project on the intended plan | **Missing** (G20) |
| L02 | A production-shaped dataset at the sizes below | Missing |
| L03 | A load tool and a runner outside the database region | Missing |
| L04 | An agreed measurement window and a named owner | Missing |

## Dataset sizes

Two profiles. Test both: a system that is fast at beta size and collapses at
public-beta size has told you nothing useful.

| Entity | Private beta | Public beta |
| --- | --- | --- |
| Customers | 100 | 5,000 |
| Workers | 30 | 800 |
| Published worker profiles | 25 | 600 |
| Marketplace requests | 500 | 40,000 |
| Quote invitations | 3,000 | 300,000 |
| Worker quotes | 1,500 | 120,000 |
| Bookings | 300 | 25,000 |
| Booking messages | 4,000 | 400,000 |
| Reviews | 200 | 15,000 |
| Notifications | 8,000 | 700,000 |
| Ledger transactions | 1,200 | 100,000 |
| Disputes | 20 | 900 |
| Trust reports | 30 | 1,500 |
| Operational assignments | 100 | 6,000 |
| Staff audit events | 2,000 | 150,000 |

Generate synthetically, with realistic distributions: most customers have one
booking, a few have twenty; most requests get three quotes, some get none.
Uniform data hides exactly the queries that will hurt.

## Budgets

Server time, measured at the API, p95, on the public-beta dataset.

### Customer and worker surfaces

| Surface | Budget |
| --- | --- |
| Marketplace candidate selection (matching run) | 800 ms |
| Invitation wave dispatch | 500 ms |
| Quote listing for a request | 250 ms |
| Booking detail with timeline | 300 ms |
| Chat page load | 250 ms |
| Chat message send | 150 ms |
| Notification inbox page | 250 ms |
| Worker discovery listing | 300 ms |
| Worker profile | 250 ms |
| Timeline load (job operations) | 300 ms |

### Staff surfaces

| Surface | Budget |
| --- | --- |
| Staff session resolution | 50 ms |
| Operations home | 400 ms |
| Staff queue page | 300 ms |
| Case detail | 150 ms |
| Safe search | 200 ms |
| Analytics dashboard | 1,500 ms |
| Audit explorer page | 500 ms |
| Financial reconciliation run | 5,000 ms per 1,000 settlement lines |
| Export preview | 2,000 ms |

### Client-perceived

| Measure | Budget | Device |
| --- | --- | --- |
| Screen interaction readiness | 1,500 ms | Mid-range Android, 3G-class |
| Image loading (worker card) | 800 ms | Same |
| Realtime reconnect after network loss | 3,000 ms | Same |
| Cold start to first meaningful screen | 3,500 ms | Same |

### Payload and pagination

| Rule | Value |
| --- | --- |
| Maximum response payload | 256 KB |
| Queue page size | 25, capped at 100 |
| Audit page size | 50, capped at 200 |
| Analytics range | Capped at 366 days |
| Export rows | Capped at 500 |

Every one of these caps is already enforced server-side, so a load test cannot
accidentally measure an unbounded query — that is the point of enforcing them
before measuring.

## Scenarios

| # | Scenario | Shape | Passes when |
| --- | --- | --- | --- |
| S1 | Marketplace burst | 50 concurrent requests created in 60 s, each triggering matching and waves | Matching within budget; no request left unmatched by contention |
| S2 | Quote storm | 200 workers quoting 20 requests within 5 minutes | Quote submission within budget; fairness distribution unchanged |
| S3 | Chat concurrency | 100 concurrent conversations, 5 messages/minute each | Send within budget; Realtime delivery under 2 s |
| S4 | Notification fan-out | One marketplace event notifying 50 workers | No write amplification; dedup and grouping hold |
| S5 | Staff queue under backlog | 6,000 assignments, 5 concurrent staff | Queue page within budget |
| S6 | Analytics at a year | Every dashboard over 366 days | Within budget; suppression still correct |
| S7 | Reconciliation | 10,000 settlement lines | Within budget; exceptions correct |
| S8 | Rate-limit behaviour under load | Honest traffic at 80% of every limit | No honest request refused |
| S9 | Sustained soak | 4 hours at beta-level traffic | No connection exhaustion, no memory growth, no slow degradation |

## Known hot spots to measure first

1. **`private.is_staff()` in RLS.** It is evaluated by many existing policies and
   WPS-018 added a second indexed lookup for non-staff callers. This is the only
   change to a hot customer path and must be measured before anything else.
2. **`get_staff_home` backlog probes** — one bounded probe per visible queue.
3. **`get_staff_analytics('marketplace')`** — a lateral per request over
   `worker_quotes`; the first dashboard expected to need attention.
4. **`staff_audit_search('payment_audit')`** — filters across four nullable
   identifier columns.
5. **The rate limiter** — a count and an insert on every limited call. Verify the
   opportunistic prune keeps the counter table bounded without a scheduler.
6. **Marketplace candidate selection** — the most complex query in the product.

## Method

1. Record the dataset row counts in the results file. Without them a timing is
   meaningless.
2. Warm up, then measure. Report p50, p95, p99 — never a mean.
3. Run each scenario three times; report the worst.
4. `EXPLAIN (ANALYZE, BUFFERS)` anything over budget.
5. Fix in order: index, query shape, narrower projection, pagination, aggregate
   table, materialized view. Stop at the first that works.
6. Record what was measured, on what data, on what date. A measurement without
   its dataset is a rumour.

## Reporting rules

- Never quote a local number as a performance result.
- Never quote a staging number as a production number; say "staging p95".
- A budget missed is recorded, not rounded.
- A scenario not run is recorded as not run, never as passed.

## Status

| | |
| --- | --- |
| Scenarios executed | **0 of 9** |
| Surfaces measured | **0** |
| Datasets generated | **0** |
| p95 values recorded | **0** |

This is gap G30 and it blocks production.
