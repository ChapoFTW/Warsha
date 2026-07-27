# Full Application Production-Readiness Audit

Audit date: 2026-07-27

## Overall health score

**83 / 100 — conditionally ready for the next feature milestone, not yet release-ready.**

## Executive summary

The Expo application type-checks, lints, passes the mojibake guard, and exports production bundles for Android and iOS. Customer booking, provider job management, password recovery, account-scoped storage, and notification/realtime contexts have explicit loading/error state and cleanup guards. The pending `202607200012_production_audit_hardening.sql` migration closes previously identified direct-booking and privilege gaps, but it has not been applied to the hosted Supabase project during this audit.

The audit added a retryable provider-service catalog failure state and localized provider pricing labels. No destructive migration or hosted database operation was performed.

## P0 findings

### Pending production security migration — unresolved until deployment

`supabase/migrations/202607200012_production_audit_hardening.sql` removes the legacy direct `INSERT` route to `public.bookings`, replaces booking creation with a validated idempotent RPC, and hardens related grants and attachment controls. Until this pending migration is applied to the linked production database, the known legacy policy risk remains in that database.

**Required release action:** review the migration, run database tests in CI/local Supabase, then apply it through the normal controlled deployment process. This audit did not apply a hosted migration.

## P1 findings

None confirmed in the audited source and bundle paths.

## P2 findings

### Fixed: provider service catalog failure was silent

The provider profile setup previously swallowed failures from `listProviderServiceOptions()`, leaving a provider with an empty service list and no retry. `app/provider-mode.tsx` now renders a loading state and retry action.

### Fixed: provider pricing models exposed internal values

Provider service pricing chips previously rendered raw values such as `hourly` and `quote`. `app/provider-mode.tsx` now maps all pricing models to English and Arabic labels.

### Remaining: local Supabase database tests are unavailable in this checkout

`npm.cmd run db:test` cannot execute because the `supabase` executable is not installed on `PATH` as a project dependency. Install/pin the Supabase CLI for CI and run `supabase test db` against a local stack before release.

### Remaining: hosted migration state cannot be proven from this environment

The requested migration-list and push-dry-run commands completed without applying anything, but their output was empty in this environment. Confirm the linked project migration history in a deployment-capable CI shell before release.

## P3 findings

- Native-device E2E coverage is absent; bundle exports cannot validate permissions, deep-link handoff, image picking, native notification delivery, or background session refresh.
- The customer chat tab and provider messages section are intentional placeholders and should remain outside this stability pass.
- Existing generated/legacy dirty worktree changes are substantial; review and commit them as focused units before release.
- Expo export emitted `NO_COLOR`/`FORCE_COLOR` environment warnings only; bundling still completed.

## Scope reviewed

- Expo SDK 54 configuration, Router routes, root provider ordering, secure session persistence, password-recovery deep links, and platform bundle export.
- Customer categories, search, provider view, booking creation/attachments, addresses, orders, cancellation, rescheduling, local preferences, and notifications.
- Provider activation, onboarding, service/availability/pricing setup, job transitions, completion evidence, and provider notifications.
- Mock/Supabase repository boundaries, account-scoped state resets, realtime cleanup/debouncing, notification reconciliation, RTL/localization paths, and brand assets.
- All Supabase migrations, RLS policies, `SECURITY DEFINER` functions, `search_path` hardening, RPC grants, storage policies, realtime migration, and pgTAP test files.

## Files changed by this audit

- `app/provider-mode.tsx` — provider service option loading/retry state and localized pricing labels.
- `docs/audits/full-app-audit.md` — this audit report.

## New migrations

None created by this audit.

Pending pre-existing migration requiring deployment review:

- `supabase/migrations/202607200012_production_audit_hardening.sql`

## Tests added

None. Existing pgTAP tests in `supabase/tests/database/` cover RLS/RPC grants and provider booking transitions, but could not run locally without the Supabase CLI.

## Validation results

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd run check:mojibake` | Passed |
| `git diff --check` | Passed (line-ending warnings only) |
| `npx.cmd expo-doctor` | Passed (exit code 0) |
| `npx.cmd expo export --platform android` | Passed |
| `npx.cmd expo export --platform ios` | Passed |
| `npx.cmd supabase migration list` | Completed without mutation; verify linked-project output in CI |
| `npx.cmd supabase db push --dry-run` | Completed without mutation; verify linked-project output in CI |
| `npm.cmd run db:test` | Blocked: `supabase` CLI unavailable on PATH |

## Known limitations

- No physical-device or emulator test was performed in this audit.
- No hosted Supabase migration was applied, by instruction.
- RLS pgTAP execution requires a local Supabase CLI/Docker-capable environment.

## Recommended next milestone

Before release, deploy and verify migration `202607200012`, run the pgTAP suite in CI, and add a small authenticated device smoke suite for sign-in, password recovery deep links, booking creation with an attachment, provider acceptance, and notification navigation.

After those gates are in place, begin the Chat milestone behind the existing conversation/message RLS model and add the corresponding realtime/device tests.

## Is Warsha stable enough to begin the Chat milestone?

**Yes, for feature development; no, as a production release candidate until the pending security migration is deployed and database tests run.** The TypeScript, lint, encoding, Android export, and iOS export gates pass, and the reviewed client contexts have cleanup and account-isolation guards. The remaining release risk is measurable and externalized: migration `202607200012` has not yet been applied to the hosted database, and local pgTAP validation is blocked by the missing CLI.
