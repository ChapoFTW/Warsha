# Deployment Runbook

Authority: Warsha Constitution → WPS-018.
Companion: `docs/launch/LAUNCH-CHECKLIST.md` (the full launch), this runbook (a
routine deployment).

## The six things a deployment can be

They are separate, they are approved separately, and they are never bundled.
Bundling is what turns a small incident into an unattributable one.

| # | Step | Reversible? | Approval |
| --- | --- | --- | --- |
| 1 | Schema deployment | Forward correction only | Two approvers for production |
| 2 | Edge Function deployment | Redeploy previous | Operations Manager |
| 3 | Mobile build | Halt rollout; Apple has no true rollback | Operations Manager |
| 4 | Web deployment | Redeploy previous | Operations Manager |
| 5 | Provider activation | Kill switch | Owner |
| 6 | Configuration activation | New corrective version | Dual control |

Do them in that order. Demand comes last: configuration that activates the
marketplace is the final step of the final step.

## Schema deployment

### Before

1. CI green on the exact commit.
2. `supabase migration list --linked` — record local-only entries. That list is
   the pending chain and it is what you are about to apply.
3. `supabase db push --linked --dry-run` — the plan must match the list exactly.
   If it does not, stop and find out why.
4. **Take a backup and record its reference.** No recorded restore point, no
   deployment.
5. Read the migration. Not skim — read it. Look for: a dropped column, a
   narrowed constraint on existing rows, a `not null` without a default, an
   index build on a large table, and anything that breaks the client already in
   users' hands.

### Backward compatibility

A mobile client cannot be rolled back quickly, so every schema change must work
with the client already installed:

- Add, never remove, in the same release.
- A new column is nullable or has a default.
- A new constraint is validated against existing data first.
- A renamed concept keeps the old name working until the old client is gone.
- A removed path is retired in a much later migration, not this one.

### Apply

```
npx.cmd supabase db push --linked
```

Never edit a migration that has been applied. If it was wrong, the fix is a new
forward migration, and the ledger keeps both — which is the point.

### After

1. `supabase migration list --linked` — local and remote must now agree.
2. Run `public.verify_platform_release()` as a staff member holding
   `view_audit_logs`.
3. Compare the failure set against the expected set. An **unexpected** failure
   is an abort. "The migration applied without error" is not success; the
   verification result is.
4. Record what was applied, by whom, when, and what verification returned.

## Edge Function deployment

Warsha deploys none today. When it does:

- No credential in source; secrets come from project configuration.
- A webhook endpoint is not deployed until its provider gate is satisfied — an
  unauthenticated public endpoint that nothing verifies is worse than none.
- Verify each function responds after deployment.

## Mobile build

- Confirm the profile, channel, and that the build points at the intended
  environment. Confirm it by launching it, not by reading the config.
- Install on a real iOS and a real Android device before any track.
- Internal track first, always.
- Phased rollout for production. A rollout that cannot be halted is not phased.

## Web deployment

- Confirm no credential shape in the output bundle.
- Confirm `EXPO_PUBLIC_ADMIN_SURFACE` is unset for a customer-facing deploy.
- Keep the previous deployment available for immediate rollback.
- Smoke test sign-in before announcing.

## Provider activation

Each provider is its own decision with its own gate. Activating one is not a
deployment step that follows automatically from a successful migration.

## Configuration activation

Draft with a reason, a second person approves, confirm the value took effect in
the **owning domain**, and confirm the immutable history recorded it.

## Never

- Never deploy from an unreviewed branch.
- Never deploy with a failing gate, however small.
- Never use a production service-role credential in CI.
- Never deploy when nobody is available for the next two hours.
- Never bundle schema, client, and provider changes into one window.
- Never declare success without running the verification.
