# Rollback Runbook

Authority: Warsha Constitution → WPS-018.
Strategy and rationale: `docs/launch/ROLLBACK-PLAN.md`. This is the procedure.

## Decide in this order

```
Is anyone being harmed right now?      ─► kill switch. Now. Explain after.
Is it one feature?                     ─► turn the flag off
Is it the web client?                  ─► redeploy the previous build
Is it the mobile client?               ─► halt the rollout, mitigate server-side
Is it schema?                          ─► forward correction
Is the data corrupt or compromised?    ─► restore (Owner decides)
```

Open an incident for every rollback. A rollback with no record teaches nobody.

## Feature flag

1. Open the operations platform, confirm the environment badge.
2. Re-authenticate (flags are high risk).
3. Turn the flag off with a written reason.
4. Confirm on a real client that the capability is gone.

Effective on the next call. No build, no cache, no wait.

## Kill switch

1. Confirm the environment badge.
2. Re-authenticate.
3. Activate the switch with a written reason and confirm.
4. **Confirm the domain control actually moved** — for a server-enforced switch,
   check the owning domain's own value, not the switch row.
5. Tell support what customers and workers will now see.

Clearing restores exactly the recorded prior state, nothing more. Existing
bookings, conversations, disputes, and ledger entries are untouched.

| Symptom | Switch |
| --- | --- |
| Card payments failing | `online_payment_methods` |
| Provider incident | `payments_maintenance` |
| Payout problem | `payouts` |
| Bad matches or a matching outage | `new_marketplace_requests` |
| Something broadly wrong | `read_only_maintenance` |

## Web client

1. Redeploy the previous deployment.
2. Smoke test sign-in.
3. Confirm the correct environment is served.
4. Keep the bad build's reference in the incident record.

## Mobile client

Slow and partial. Plan for it before shipping, not during.

1. **Halt the phased rollout** on both stores. This stops new users receiving
   the build; it does not remove it from anyone who has it.
2. Google Play: roll back to the previous release for new installs.
3. Apple: there is no rollback. The route back is a new build through review.
4. **Mitigate server-side in the meantime.** This is the real fix: turn off the
   flag or activate the switch that neutralises the bad behaviour.
5. Over-the-air updates are not enabled, so there is no instant client patch.

If a client change cannot be neutralised from the server, it needed more care
before it shipped. Record that in the postmortem.

## Schema

**Never edit an applied migration.** Write a new forward migration.

1. Reproduce the problem on local from a clean reset.
2. Write the correction. It must work with the client already installed.
3. Full validation: reset, pgTAP, regressions, audits, exports.
4. Deploy per `deployment-runbook.md`, including a fresh restore point.
5. Run `verify_platform_release()`.

If the schema change destroyed data, a forward migration cannot bring it back.
That is a restore decision.

## Restore

See `restore-runbook.md`. Owner decision only.

## Provider activation

Deactivate through the owning domain's control — the payment mode, the payout
mode, the method availability row. Not by deleting credentials: an activation
that is switched off can be switched back on, whereas deleted credentials mean a
re-issue under pressure.

## Configuration

Never edit history. Prepare a rollback, which creates a **new corrective
version** carrying the older payload, and let it follow the same approval path
with a second person. If it is too urgent to wait for an approver, it is an
incident and a kill switch, not a configuration change.

## After every rollback

- [ ] The incident timeline records what was rolled back and when
- [ ] Support knows what users now see
- [ ] Affected users are told, in Egyptian Arabic, if they noticed
- [ ] The cause is understood before anything is rolled forward again
- [ ] The postmortem asks whether the rollback path was fast enough
