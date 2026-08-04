# WPS-018 Manual Results — Production Readiness, Reliability & Launch Operations

| Field | Value |
| --- | --- |
| Specification | WPS-018 v1.0 |
| Overall status | **NOT RUN** |
| Planned cases | 44 |
| Passed | 0 |
| Failed | 0 |
| Blocked | 2 (M36, M44 — no staging project exists) |
| Not run | 44 |
| Device acceptance | **Not claimed** |

## Result

Cases `WPS018-M01` through `WPS018-M44`: **NOT RUN**.

No manual session has been executed for WPS-018. Automated evidence is recorded
separately in `WPS-018-ACCEPTANCE-EVIDENCE.md` and is never converted into a
manual pass.

Two cases are **structurally blocked** rather than merely unrun: M36
(cross-environment isolation) and M44 (the restore drill) both require a hosted
staging project, and only a local environment exists. That is gap G20.

## What automated evidence does and does not cover

The 136-assertion WPS-018 pgTAP suite proves the **server refuses** correctly:
a stale token, an unverifiable token, a single-factor session when MFA is
required, a revoked session, a cross-domain capability, a self-approval, a
self-review, and a caller over their rate limit are all refused, and every
disabled provider stays disabled.

It proves nothing about:

- whether a staff member **understands** why they were refused;
- whether the freshness window is workable in a real shift, or so short that
  people start leaving sessions open to avoid it;
- whether the rate limits are invisible to honest use and only bite abuse;
- whether a real restore actually works, or how long it takes;
- whether the environment badge is noticed before someone acts.

Those are the questions this suite exists to answer, and none of them has been
asked yet.

## Sign-off

| Role | Name | Date | Verdict |
| --- | --- | --- | --- |
| Operations Manager | — | — | Not run |
| Security Administrator | — | — | Not run |
| Owner | — | — | Not run |
