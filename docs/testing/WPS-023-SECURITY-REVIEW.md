# WPS-023 — Security review

Authority: WPS-023. Companion to
[worker-vetting-threat-model](../security/worker-vetting-threat-model.md).

> **No penetration testing was performed and none is claimed.** This is a
> control-by-control review against the implemented code, written by the
> implementer. An independent assessment has not happened.

---

## Summary

One real defect was found and fixed. It was found by querying the running
database rather than reading the migration source — the source said the surface
was closed, and the database said otherwise.

---

## Finding 1 — fifteen `public` functions reachable by `anon`

**Severity:** medium. **Status:** fixed in `202608080001` §0.

The Phase 1 audit ran:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and has_function_privilege('anon', p.oid, 'execute');
```

24 rows. Nine were the deliberate WPS-020 / WPS-006 / WPS-011 sanitized reads.
The other fifteen were every WPS-022 privacy mutation and every WPS-022 staff
function, including `staff_create_legal_hold`, `staff_release_legal_hold` and
`staff_data_inventory`.

### Root cause

WPS-022 wrote, for each of them:

```sql
grant execute on function public.<fn> to authenticated;
revoke all on function public.<fn> from anon;   -- no-op
```

`anon` never held a direct grant. Postgres grants `EXECUTE` to `PUBLIC` by
default on every new function, and `anon` inherited it from there. `REVOKE ...
FROM anon` removes a grant made **to** `anon`; it cannot remove what `anon`
inherits **from** `PUBLIC`. The ACLs still read `=X/postgres` — the leading `=`
being the PUBLIC grant.

All fifteen revokes were no-ops, and the code that produced them looks correct.

### Exploitability

Low on its own. Every one of the fifteen opens with an `auth.uid() is null`
check or `private.require_staff_capability(...)`, so an anonymous call reaches a
`42501` before touching anything.

It was still a genuine defect. The privilege surface did not match the intent,
and `anon` reaching `staff_create_legal_hold` at all is one missing internal
check away from an anonymous caller suspending somebody's right to erasure.

### Why the existing tests missed it

WPS-022's suite asserted **behaviour**:

```sql
select throws_ok($$select public.request_account_deletion(null,null)$$, '42501', ...)
```

That passes whether or not `anon` holds the grant, because the function raises
either way. The test was correct and could not see the problem.

### Fix

A `DO` block revokes `EXECUTE` from `PUBLIC` on every anon-executable `public`
function outside a nine-name allowlist, guarded by an `aclexplode` check that
`authenticated` already holds an explicit grant of its own — so a function
reaching `authenticated` only through `PUBLIC` is left alone rather than broken.

**Measured: 24 → 9.**

WPS-023 asserts the **privilege**, not the behaviour, and bounds the surface as
a property rather than a list:

```sql
select is((select count(*) from pg_proc p ...
           where has_function_privilege('anon', p.oid, 'execute')
             and p.proname not in (<nine names>)),
  0, 'NO FUNCTION OUTSIDE THE SANCTIONED READ SURFACE IS ANON EXECUTABLE');
```

Any future function repeating the mistake fails that assertion.

---

## Finding 2 — a test that asserted prose instead of behaviour

**Severity:** low (test quality). **Status:** fixed.

A client regression check searched the migration for `automatic reject`. It
**failed** — because the seeded vetting-policy `notes` say *"No automatic
rejection rule is implemented"*, and that sentence satisfied the check for the
thing it described.

This is the same failure mode `codeOf()` exists to prevent for comments, one
level further out: **a string asserting an absence is not evidence of that
absence**.

Replaced with checks for the machinery such a rule would need: no
`interval '<n> month|year|day'` arithmetic in the vetting path, no comparison
deriving an outcome from document recency, and a positive assertion that every
write of `'rejected'` sits inside a function opening with
`require_staff_capability` and refusing without recorded evidence.

Four further structural checks were failing for the ordinary comment reason and
now run through `codeOf()`.

---

## Control review

### Authentication and session

| Control | State |
| --- | --- |
| Server-derived identity in every RPC | ✅ `auth.uid()`, never a client parameter |
| Signed-out route protection | ✅ `AuthGate`, plus RLS underneath |
| Signed-out RPC reach | ✅ bounded to nine sanitized reads, asserted |
| Session freshness on high-risk actions | ✅ `requires_reauth` on three capabilities |
| Stale session / revoked role | ✅ server-authoritative refresh; late responses discarded |
| Client-only authorization | ✅ none — the gate is cosmetic by design |

### Role and lifecycle

| Control | State |
| --- | --- |
| Client-forged worker role | ✅ `intended_role` is not read by any gate |
| Direct state mutation | ✅ `SELECT`-only grants; sole writer is `private` |
| Invalid transitions | ✅ explicit edge list, actor-scoped |
| Idempotency | ✅ re-issuing the current state is a no-op |
| Row locking | ✅ `for update` in `worker_transition` |
| Immutable history | ✅ trigger raises on `UPDATE` and `DELETE` |
| History ordering | ✅ `clock_timestamp()`, not `now()` |

### Documents

| Control | State |
| --- | --- |
| Private buckets | ✅ both, `public = false` |
| Path ownership | ✅ checked in the RPC **and** the storage policy |
| MIME and size validation | ✅ bucket, RPC and client |
| Dedicated capability | ✅ `review_criminal_records`, not `is_staff()` |
| Signed-URL lifetime | ✅ 300s — a judgement, not a measurement |
| Access audit | ✅ logged before a path is returned |
| Duplicate detection | ✅ recorded, never auto-actioned |
| Malware scanning | ❌ not implemented, accepted risk |

### Decisions

| Control | State |
| --- | --- |
| Capability per decision weight | ✅ approve ≠ reject |
| Dual control on rejection | ✅ `reject_worker_application` |
| Evidence required | ✅ server refuses a note < 10 chars |
| Appeal independence | ✅ enforced in SQL, not in a runbook |
| Automated adverse decisions | ✅ none possible — asserted three ways |
| Staff audit | ✅ every decision |

### Data exposure

| Control | State |
| --- | --- |
| Offence detail | ✅ no column exists; asserted against `information_schema` |
| Notification payloads | ✅ asserted free of offence, identifier, filename |
| Realtime | ✅ no WPS-023 table published |
| Privacy export | ✅ no sensitive vetting record included |
| Staff queue | ✅ opaque reference only |
| Full National ID | ✅ never stored; masked to last four in transit |
| Extraction confidence | ✅ never crosses a boundary |
| Cross-account leakage | ✅ generation guard; fails closed |

### Configuration

| Control | State |
| --- | --- |
| Empty `search_path` | ✅ every function, asserted |
| Minimal grants | ✅ `SELECT`-only public tables; no client grant on private |
| Fail-closed missing config | ✅ location and extraction boundaries throw |
| Service-role key in client | ✅ absent — `audit:secrets` clean |
| Feature flags | ✅ all four ship `enabled = false, audience = 'none'` |

---

## Accepted risks

1. A signed URL is a bearer token for 300 seconds.
2. No malware scanning or image re-encoding on upload.
3. No anomaly alerting on high-volume certificate access.
4. Certificate authenticity cannot be confirmed — Q-08 is open.
5. Somebody uploading another person's genuine documents is caught only by human
   review.
6. The nine anonymous read RPCs have not had a WPS-018 rate-limit review.

---

## Not performed

Penetration testing · independent code review · dependency vulnerability scan ·
runtime traffic analysis · physical device testing.
