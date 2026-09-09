# Owner decision backlog

Decisions that belong to the owner, recorded here so the programme continues
around them rather than stopping at them.

A thing only lands here if it is a genuine product, cost, legal or account-owner
decision with more than one defensible answer. Ordinary engineering judgement —
spacing, hierarchy, copy, picking the right shared primitive, fixing a harness —
is made and moved past, not queued.

Each entry says what is blocked **and what is not**, because the second half is
what lets work continue.

---

## OD-001 — Production backup capability

| | |
| --- | --- |
| **Date** | 2026-09-09 |
| **Area** | Infrastructure / release readiness |
| **Status** | **DEFERRED_OWNER_DECISION** — owner deferred 2026-09-09 |

**Decision required.** Whether to buy Supabase Pro so Production has managed
backups and PITR.

**Why it is the owner's.** It is recurring spend, and the standing rule is that
new paid products need an explicit decision.

**Evidence.** Queried through the Management API with the deployment credential:

```
plan          : free
pitr_enabled  : false
backups       : 0 listed
```

G22 is therefore not "unverified" — the current plan provides **no** backup
capability at all.

**Options.** Upgrade to Pro (~$25/mo, managed daily backups plus PITR); stay on
Free and continue the guarded per-migration exception model; or build a free
logical-dump process, which is real insurance but is **not** managed backup and
must never be described as one.

**Recommendation.** Stay on Free until Production carries real customer data,
then upgrade before private beta. The exception mechanism is honest and narrow,
and Warsha is `pre_beta` with no real users to lose.

**Blocked by this.** Closing G22. Describing Production as restore-capable.

**Not blocked.** Everything else. Migrations deploy through the guarded
migration-specific exception, which pins content hashes and prints that G22
remains open on every acceptance.

**Reversible.** Entirely — a plan change either way.

---

## OD-002 — Production staff identity for push activation

| | |
| --- | --- |
| **Date** | 2026-09-09 |
| **Area** | Notifications / governed activation |
| **Status** | **DEFERRED_OWNER_DECISION** |

**Decision required.** How a Production staff session with `super_administrator`
and satisfied MFA comes into being, so push configuration can be executed
through the governed path.

**Why it is the owner's.** `staff_set_push_configuration` requires
`manage_notification_configuration`, which only `super_administrator` carries,
behind `require_staff_capability` — MFA satisfied, session not revoked, and
fresh authentication to enable. Automation cannot substitute:
`private.automation_principals.environment` is CHECK-constrained to
`development`, so a Production automation principal cannot be stored. That is a
deliberate boundary and is not being weakened.

**Options.** The owner signs in to Production admin and hands over a session for
the activation window; or a dedicated staff identity is provisioned for
operations with MFA enrolled, which automation could then hold legitimately; or
push activation waits.

**Recommendation.** Provision a dedicated operations staff identity with real
MFA. It is auditable, attributable, and does not require the owner present for
each change. It is a real security decision, which is why it is here.

**Blocked by this.** Push Phase A and B, and the end-to-end push proof.

**Not blocked.** The authority itself is deployed and verified in Production
(404 before, 403 after — the gate chain runs). Configuration is untouched:
provider `disabled`, zero devices, delivery and registration off.

**Reversible.** Yes. A staff grant can be revoked; the configuration switches
move in both directions, and disabling is deliberately easier than enabling.

---

## OD-003 — Professional role mark

| | |
| --- | --- |
| **Date** | 2026-09-09 |
| **Area** | Brand / icon language |
| **Status** | **RESOLVED** 2026-09-09 — owner accepted `engineering` |

Kept for the record. The two role marks were both tools, so the cards read as
two kinds of tradesperson. Now a house for the customer and a person for the
professional. The owner accepted the hard-hat cue as adequate for Warsha's
current service scope and asked that it not be churned again without rendered
evidence of a comprehension problem.

---

## How to add one

Copy an entry, keep the same fields, and be specific about what is *not*
blocked. An entry that blocks everything is either wrong or an emergency, and
either way it should be raised immediately rather than filed.
