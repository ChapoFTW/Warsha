# Rollback Plan

Authority: Warsha Constitution → WPS-018.

## The uncomfortable truth first

**A migration cannot be rolled back.** Warsha's migrations are forward-only by
design: there are no down migrations, and there never will be. Once a schema
change is applied to a hosted project, the only ways back are:

1. a **new forward migration** that corrects it, or
2. a **restore from backup**, which loses every write since the restore point.

Everything else in this document exists so that option 2 is never needed.

## The four things that can be rolled back, and how

| Layer | Rollback | Time | Data loss |
| --- | --- | --- | --- |
| Feature | Turn the flag off | Seconds | None |
| Surface | Activate a kill switch | Seconds | None |
| Client | Ship the previous build / previous web deploy | Minutes to days | None |
| Schema | Forward correction, or restore | Hours | None / everything since the restore point |

Always reach for the top of that table first.

## Layer 1 — feature flag

Every risky capability is behind a server-authoritative flag that is off by
default. Turning one off takes effect on the next client call; there is no cache
to wait out and no build to ship.

Owner: Security Administrator. Reason mandatory. Change recorded in immutable
history.

## Layer 2 — kill switch

Nine switches. A switch **only ever restricts** — it never enables anything,
never deletes a row, and never touches immutable history. Where the owning
domain has its own control, the switch operates that control rather than
shadowing it, and clearing restores exactly the recorded prior value.

| Situation | Switch | What it does |
| --- | --- | --- |
| Card payments failing | `online_payment_methods` | Disables every non-cash method through the WPS-015 availability table |
| Provider incident | `payments_maintenance` | Sets the WPS-015 maintenance control |
| Payout problem | `payouts` | Forces the WPS-015 payout mode to disabled |
| Marketplace producing bad matches | `new_marketplace_requests` | Sets the WPS-008 activation flag to false |
| Something broadly wrong | `read_only_maintenance` | Surfaces the read-only banner |

**Existing bookings, conversations, disputes, and ledger entries are unaffected
by every switch.** A customer mid-booking keeps their booking; a worker mid-job
keeps their job. That is the design, and it is what makes a switch safe to use
early rather than late.

## Layer 3 — client rollback

**Web.** Redeploy the previous build. Fast, complete, no user action.

**Mobile.** Slower and partial, and this must be understood before launch:

- A phased rollout can be **halted** on both stores, which stops new users
  receiving the bad build. Users who already have it keep it.
- Google Play permits a rollback to a previous release for new installs.
- Apple does not, in general. The route back is a new build through review,
  which is hours to days.
- Over-the-air updates are **not enabled**, so there is no instant client fix.

The practical consequence: **a mobile client bug is mitigated server-side, not by
shipping.** Kill switches and flags exist precisely because the mobile rollback
path is slow. Any client change that cannot be neutralised from the server is a
change that needs more care before it ships.

## Layer 4 — schema

### Preferred: forward correction

Write a new migration that fixes the problem. Never edit an applied migration —
the ledger records what was applied, and editing it makes the two disagree
permanently.

A forward correction must be backward compatible with the client already in
users' hands. A mobile client that cannot be rolled back is a client whose schema
must keep working.

### Sequencing that keeps forward correction possible

1. Add the new column, table, or function. Do not remove anything.
2. Ship the client that uses it.
3. Wait until the old client is out of use.
4. Only then, in a much later migration, retire the old path.

Skipping step 3 is what turns a schema change into an outage.

### Last resort: restore

See `docs/operations/restore-runbook.md`. Restoring loses every write since the
restore point: bookings, messages, payments, disputes, and audit. It is the right
call only for data corruption or a security compromise, and it is a decision for
the Owner.

## What can never be rolled back

Be explicit about this, because pretending otherwise leads to bad decisions
under pressure:

| | Why |
| --- | --- |
| An immutable audit record | It raises on update and delete for the table owner too |
| A ledger posting | WPS-007 corrects with a compensating entry, never a deletion |
| An enforcement action | WPS-016 requires an explicit, audited restoration |
| A sent notification | It has been read |
| A published review | WPS-011 soft-hides; it never destroys evidence |
| A store submission under review | It can be withdrawn, not un-submitted |

## Decision order under pressure

```
Is anyone being harmed right now?
  └─ yes ─► kill switch, immediately. Explain afterwards.
  └─ no  ─► Is it one feature?
             └─ yes ─► turn the flag off
             └─ no  ─► Is it the client?
                        └─ web    ─► redeploy the previous build
                        └─ mobile ─► halt the rollout, mitigate server-side
                        └─ schema ─► forward correction; restore only for
                                     corruption or compromise
```

Open an incident for every one of these. A rollback with no incident record is a
rollback nobody can learn from.

## Rehearsal

The rollback is rehearsed on staging before any launch:

1. Activate each server-enforced kill switch and confirm the domain control moved.
2. Clear each one and confirm the prior state was restored exactly.
3. Halt a phased rollout on both stores.
4. Redeploy a previous web build.
5. Perform a restore on staging and confirm the data.

**Status: NOT REHEARSED.** This blocks private beta (criterion P18).
