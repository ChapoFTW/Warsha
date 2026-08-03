# Launch Checklist

Authority: Warsha Constitution → WPS-018.
Companion to `GO-NO-GO-CRITERIA.md` (whether to launch) — this is *how*, in order.

Every step names an owner and an evidence artefact. A step with no recorded
evidence has not been done.

## Phase 0 — before anything is scheduled

- [ ] Read the readiness gap register; confirm no new blocker has appeared.
- [ ] Confirm every Go/No-Go criterion for the target phase is GO.
- [ ] Confirm the target environment row and `expected_project_ref` are correct.
- [ ] Confirm who is rostered for the launch window and the 48 hours after it.
- [ ] Confirm the rollback has been rehearsed on staging.

## Phase 1 — validate the candidate

Run on the exact commit being launched. Not a similar one.

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run check:mojibake`
- [ ] `git diff --check`
- [ ] `npm run audit:secrets`
- [ ] `npm run audit:migrations`
- [ ] `npm run audit:environment`
- [ ] Every regression suite
- [ ] `supabase db reset` from empty, then `supabase test db`
- [ ] `npx expo-doctor`
- [ ] Cache-cleared Android, iOS, and web exports
- [ ] CI green on the same commit

## Phase 2 — schema deployment

**This phase deploys schema and nothing else.**

- [ ] `supabase migration list --linked` — record the pending chain
- [ ] `supabase db push --linked --dry-run` — confirm the pending set matches
- [ ] **Take a backup and record its reference.** A deployment without a
      recorded restore point does not proceed.
- [ ] Confirm the backup is restorable (see the restore runbook; on a first
      production deployment, restore it on staging first)
- [ ] Announce the window to whoever is on support
- [ ] `supabase db push --linked`
- [ ] Run `public.verify_platform_release()` as a staff member holding
      `view_audit_logs`
- [ ] Confirm the failure set matches expectation exactly — an *unexpected*
      failure stops the launch
- [ ] Record the applied chain, the actor, and the timestamp

## Phase 3 — Edge Function deployment

- [ ] Confirm which functions are being deployed (today: **none**)
- [ ] Confirm no function carries a credential in its source
- [ ] Deploy, then verify each responds
- [ ] Confirm no webhook endpoint is publicly reachable before its provider
      gate is satisfied

## Phase 4 — web deployment

- [ ] Build with the target environment variables
- [ ] Confirm no credential shape appears in the output bundle
- [ ] Confirm `EXPO_PUBLIC_ADMIN_SURFACE` is unset for a customer-facing deploy
- [ ] Confirm CSP, security headers, and cache policy
- [ ] Confirm auth callback URLs match the Supabase project
- [ ] Confirm privacy policy and terms URLs resolve
- [ ] Confirm indexing rules
- [ ] Deploy, smoke test sign-in, and keep the previous deployment available

## Phase 5 — mobile build

- [ ] Confirm the bundle identifier and application id
- [ ] Confirm the build profile and channel
- [ ] Confirm build-number increment
- [ ] Build with EAS
- [ ] Install on a real iOS device and a real Android device
- [ ] Smoke test: sign in, request, quote, book, chat, complete, review
- [ ] Confirm the app points at the intended environment
- [ ] Submit to the internal testing track
- [ ] Do **not** promote to production review until the store checklist passes

## Phase 6 — provider activation

Each provider is a separate, individually approved decision. **None is approved
today.**

- [ ] Payment gateway — provider selected, contracted, credentials bound to the
      production environment only, webhook verified, reconciliation run
- [ ] Payouts — licensing established
- [ ] SMS — sender registered
- [ ] Push — APNs and FCM credentials installed
- [ ] After each: confirm the mode in the owning domain configuration, not in a
      feature flag

## Phase 7 — configuration activation

- [ ] Draft each change, with a written reason
- [ ] A **second person** approves and activates
- [ ] Confirm the value took effect in the owning domain
- [ ] Confirm the immutable history records it

Order matters: **marketplace activation is last.** Everything else must be
working before demand is allowed in.

## Phase 8 — after

- [ ] Watch for the first hour; do not disperse
- [ ] Confirm the first real booking end to end, personally
- [ ] Confirm the first real payment reconciles
- [ ] Re-run `verify_platform_release()`
- [ ] Record the deployment: what, when, who, what was verified
- [ ] Schedule the 48-hour review

## Abort criteria

Stop and roll back, without debate:

- `verify_platform_release()` reports an unexpected failure
- The migration ledgers disagree after the push
- Any credential appears in any log or bundle
- Sign-in fails for any account type
- Money is wrong in any observed case
- Nobody rostered is reachable

## Evidence

Every checked box needs a recorded artefact: command output, a screenshot
reference, an approval reference, or a signature with a date. This checklist is
the record, not a memory aid.
