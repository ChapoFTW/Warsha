# WPS-001 - Foundation & Authentication

## Document metadata

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** |
| Authority | Warsha Constitution |
| Source | Existing repository, migrations, tests, and implemented behavior |

## 1. Purpose and authority

This document records the foundation and authentication behavior present in the repository on 2026-07-31. It does not override the Constitution, WPS-007, or WPS-008. A later locked correction governs wherever this baseline records older behavior.

Primary evidence includes `app/_layout.tsx`, `src/auth`, `src/config/environment.ts`, `src/lib/supabase.ts`, `src/i18n`, migrations `202607200001` through `202607200006`, `202607200009`, and `202607310001`, plus the RLS and repository-alignment pgTAP suites.

## 2. Application foundation

- The client is an Expo SDK 54 React Native application using Expo Router and the `expo-router/entry` entry point.
- The root stack contains customer tabs plus search, category, worker profile, booking, conversation, notification, worker-mode, verification, earnings, worker-job, and password-reset routes.
- Shared context providers own localization, authentication, marketplace data, local migration, preferences, addresses, bookings, worker foundation, verification, worker jobs, payments, reviews, chat, and notifications.
- English and Arabic are supported. `LocalizationProvider` controls direction, translated strings, and RTL-aware layouts. The current Arabic source still contains known legacy mojibake in some files; no document may claim visual Arabic QA has passed until the check and manual inspection pass.

## 3. Data modes and isolation

- `EXPO_PUBLIC_DATA_MODE=supabase` selects Supabase. Any other or absent value selects Mock mode.
- Supabase mode requires a URL and anonymous/publishable key. Missing values fail closed through `assertSupabaseConfiguration`; the app does not fall back to Mock data.
- Mock adapters use device-local SQLite key/value storage and in-process mock Realtime invalidations. They do not instantiate the Supabase client.
- Supabase adapters use database RPCs, RLS-protected reads, private Storage buckets, signed URLs, and Supabase Realtime.
- Account-scoped contexts clear visible state and invalidate outstanding loads when the authenticated identity changes.

## 4. Customer authentication

- Customers can register with display name, email, password, preferred language, and recorded terms/privacy acceptance metadata.
- Customers sign in with email and password through Supabase Auth.
- Email confirmation is honored when Supabase returns no session after registration.
- Raw provider/database authentication errors are mapped to a limited localized error taxonomy before display.
- Mock mode treats auth operations as local no-ops and exposes the documented demo identity.

## 5. Independent-worker authentication

- Current aligned behavior is phone-first SMS OTP registration and sign-in for an independent worker.
- Phone values are normalized to E.164-like form and OTP values must be six digits.
- Registration stores worker role metadata and, after successful OTP verification, calls `activate_provider_role(text)`.
- `activate_provider_role` requires a Supabase-confirmed phone for a new worker profile. It does not require email.
- Existing provider accounts are grandfathered by the forward alignment migration; the phone requirement is enforced when a new worker role is activated.
- A signed-in customer account can add/verify a phone before activating worker mode. This is a role addition on the same account, not a separate employer or staff account.
- Worker email is optional. There is no worker-facing feature that makes email a prerequisite after phone verification.

## 6. Session and recovery behavior

- Native sessions persist in `expo-secure-store` with `AFTER_FIRST_UNLOCK`; web sessions use browser local storage.
- Supabase Auth auto-refreshes and persists sessions, uses `processLock`, and does not rely on automatic URL-session detection.
- The auth provider loads the initial session, subscribes to auth changes, and unsubscribes on unmount.
- Password reset sends a Supabase recovery email to the Expo deep link for `/reset-password`.
- Query and fragment recovery tokens are parsed explicitly, set as a session, and route to the reset screen. Invalid or expired callbacks enter a safe invalid state.
- After a successful password change, the recovery flow performs a global sign-out so old sessions are invalidated.

## 7. Profiles, roles, and account switching

- `profiles` is the shared authenticated profile; `customer_profiles` and `provider_profiles` hold role-specific state.
- `ensure_customer_profile()` idempotently creates the customer profile, customer role, and notification preferences for a valid Auth user.
- Provider mode is an in-app role/mode switch for a user who owns a provider profile. It does not switch Supabase Auth identities.
- Switching between different real personas requires sign-out and sign-in. There is no multi-account selector or simultaneous account storage.
- Mock mode has fixed demo customer/worker namespaces rather than real account selection.

## 8. Access-control principles

- RLS is enabled on relevant public tables. User identity and worker ownership are resolved from `auth.uid()` rather than trusted client-supplied actor IDs.
- Sensitive mutations use guarded `SECURITY DEFINER` RPCs with explicit grants, fixed empty search paths, validation, idempotency where relevant, and sanitized errors.
- Private schemas and verification/financial internals are not normal-client readable.
- Public marketplace discovery uses a sanitized catalog RPC; base-table RLS is not used as column-level privacy.
- Verification documents, booking/chat/review attachments, financial internals, and private identity material are owner/participant/staff scoped.

## 9. Local-development behavior

- Local Supabase is supported through `supabase/config.toml`, migrations, seed data, and pgTAP suites.
- With no local SMS provider configured, local Supabase disables phone login. This is an environment limitation, not permission to weaken the production phone-first rule.
- Development scripts can create local email personas for testing existing customer and grandfathered-provider flows.
- Mock mode remains the phone-flow UI development path when SMS is unavailable, but it is not evidence of real OTP delivery.

## 10. Deletion and deactivation

- Soft-deletion columns and account-scoped cleanup exist in several domain tables.
- No complete customer-facing account deletion, Auth-user erasure, export, retention, or legal deletion workflow is implemented.
- Provider suspension and publication fields exist and are staff-controlled, but the mobile app does not implement a self-service worker-account deactivation workflow beyond Available/Unavailable and sign-out.
- Full account deletion is **FUTURE / DEFERRED** pending a retention and legal policy; it must not be represented as available.

## 11. Known limitations

- Local SMS OTP requires an external/local SMS provider configuration not present in the checked-in setup.
- No social login, passkey, MFA, admin authentication UI, or multi-account picker is implemented.
- No background push token registration is implemented.
- Manual authentication, recovery-link, Arabic/RTL, and account-isolation testing is not recorded as passed.

