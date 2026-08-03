# Incident Response Runbook

Authority: Warsha Constitution → WPS-018.
Companion: `incident-command-runbook.md` (how to *run* an incident once it is
open). This document covers who responds, how they find out, and what happens in
the first fifteen minutes.

## The honest starting position

**Nothing detects anything.** Warsha has no monitoring, no alerting, and no
paging. Every incident to date would begin with a person noticing. That is gap
G25 and it blocks private beta.

Until detection exists, response depends entirely on a rostered human looking.
Say that out loud in every planning conversation rather than assuming a system
is watching.

## The roster

Before any environment carries real users:

| Role | Responsibility | Hours |
| --- | --- | --- |
| Primary responder | First look, triage, open the incident | Support hours |
| Incident commander | Runs the incident once opened | On call |
| Security Administrator | Any security or data incident | On call |
| Financial Operations | Any money incident | Support hours |
| Owner | Restore decisions, launch stops, external communication | Always |

A day with nobody rostered is a day the platform does not run. A roster with
"the team" in it is not a roster.

## How an incident starts

| Source | Reality today |
| --- | --- |
| A participant tells support | The primary path. Works. |
| Staff notice a queue growing | Works — the operations home shows backlog and overdue counts |
| A reconciliation exception appears | Works — it lands in the financial queue |
| A payment provider notifies us | No provider yet |
| Automated alerting | **Does not exist** |

The structured event log exists and is redacted at write time, so alerting can be
built on it later. It is a foundation, not a monitor.

## First fifteen minutes

1. **Believe the report.** Do not spend the first ten minutes deciding whether
   it is real.
2. **Confirm the environment.** The badge, not memory.
3. **Is anyone being harmed right now?** Money wrong, data exposed, safety at
   risk. If yes, activate the kill switch before diagnosing.
4. **Open the incident** with the category, a severity, and what you actually
   observed — not what you think it means.
5. **Name the commander.** If you are also fixing, hand command over.
6. **Tell support** what participants will see and what to say.

## Severity

| | Meaning | Response |
| --- | --- | --- |
| sev1 | Money or safety at risk, or platform down | Everything stops; Owner informed immediately |
| sev2 | A core flow broken for many | Work now, update hourly |
| sev3 | Degraded with a workaround | Today |
| sev4 | Contained, low impact | This week |

sev1 and sev2 notify every incident-capable staff member through the WPS-014
staff audience. **Push is disabled**, so that notification is in-app only —
somebody has to be looking. Plan the roster accordingly.

## The classes we expect

| Class | First move | Owner |
| --- | --- | --- |
| Payment provider outage | `payments_maintenance` | Financial Operations |
| Supabase outage | Confirm status, communicate, wait — there is no failover | Operations Manager |
| Notification outage | Assess; push is already off so impact is in-app | Operations Manager |
| Marketplace matching failure | `new_marketplace_requests` | Marketplace Operations |
| Storage failure | Stop uploads; existing rows are unaffected | Operations Manager |
| Authentication incident | Security Administrator leads; consider session revocation | Security Administrator |
| Security incident | See below | Security Administrator |
| Data integrity | Do not "fix" rows; open a data-integrity incident | Owner |
| Migration failure | See `deployment-runbook.md`; forward correction only | Operations Manager |

## Security incidents

A suspected compromise is treated as real until proven otherwise.

1. Revoke the affected staff sessions. Revocation beats a valid token.
2. Revoke the affected role grants. Capabilities resolve live; there is no cache.
3. Rotate the credentials in `secret-rotation-runbook.md`.
4. Read the immutable staff audit and access log for what was reached. They
   cannot have been altered — that is what makes them useful here.
5. Do not delete anything. Evidence first.
6. The Owner decides on external communication.

## Communication

- **Participants**: plain Egyptian Arabic, what is affected, what to do,
  when we will next update. No blame, no jargon, no promise we cannot keep.
- **Staff**: the internal summary and the timeline.
- **Nothing automated.** Every message is written by a person.

## Closing

Resolved means the harm stopped. Closed means resolved and followed up. Say which
one you mean.

sev1 and sev2 require a blameless postmortem within a week, and the most useful
line in most of ours will be *nobody was watching this*. Write it when it is
true, and let it drive the decision about building detection.

## What this runbook cannot do

It cannot make anyone notice. Until monitoring exists, the honest mitigation is a
small beta with a staffed roster and participants who have a phone number for a
human — which is exactly what `PRIVATE-BETA-PLAN.md` specifies.
