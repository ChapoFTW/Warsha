# Connect Warsha to Supabase

## Values required by the mobile app

Open your Supabase project dashboard and select **Connect** (or **Project Settings → API**). Obtain exactly:

1. **Project URL** — looks like `https://abcdefghijk.supabase.co`.
2. **Publishable key** — the client-safe key usually beginning with `sb_publishable_`. Older projects may show an `anon` key; prefer the publishable key when available.

Create `.env.local` in the Warsha project root, beside `package.json`:

```env
EXPO_PUBLIC_DATA_MODE=supabase
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Do not quote the values. Stop and restart Expo after changing them because Expo reads public environment variables when bundling.

## Values that must never be placed here

Do not copy the Supabase `service_role` secret, secret key, database password, access token, or JWT signing secret into `.env.local`, `app.json`, or any `EXPO_PUBLIC_` variable. A service-role key bypasses RLS. Future trusted server code must receive secrets through Supabase Edge Function secrets or its hosting platform’s server-only secret manager.

## Dashboard configuration

1. In **Authentication → Providers → Email**, enable Email authentication.
2. Choose whether **Confirm email** is enabled. When enabled, new users must click the emailed confirmation link before signing in.
3. Configure the mobile authentication redirect URLs as described below. Customer signup and password recovery both supply explicit callbacks into the app.
4. Apply migrations with `npx supabase login`, `npx supabase link --project-ref YOUR_PROJECT_REF`, then `npx supabase db push`.
5. Load the idempotent fictional development seed with `npx supabase db reset` locally, or `npx supabase db execute --file supabase/seed.sql --linked` against a disposable development project.
5. Populate approved providers and their services. Only provider rows with `is_published = true` are visible in Supabase mode.

## Switching back to local data

Set `EXPO_PUBLIC_DATA_MODE=mock` and restart Expo. No Supabase values are required in mock mode.

## Local-data import strategy

After authentication, detect locally stored addresses, favourites, and bookings before changing either store. Show an explicit import prompt, upsert deterministic records, and record migrated local identifiers. Keep every local record until the complete server transaction succeeds. Local Expo file URIs are intentionally excluded until private Storage upload, retry, and cleanup are implemented.

## Reset and security

Use `npx supabase db reset` only for local development; it destroys the local database and reapplies migrations and seed data. All mobile access uses the anon key plus RLS. Never bundle a service-role key. `profile-images` and `provider-portfolios` are public media buckets; `booking-attachments` is private and participant access must be mediated by database authorization or signed URLs.

## Development Auth accounts

The SQL seed creates fictional public provider listings only. It does not write to `auth.users`, `auth.identities`, `auth.sessions`, or any other Supabase-managed Auth table. Seeded marketplace providers are not login accounts.

The preferred test flow is to register normally in the app and confirm the email if confirmation is enabled. For a confirmed server-created development user, run the Admin API script from a trusted terminal:

```powershell
$env:SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVER_ONLY_SERVICE_ROLE_KEY'
$env:DEV_AUTH_EMAIL='your-test-address@example.com'
$env:DEV_AUTH_PASSWORD='choose-a-development-password'
$env:DEV_AUTH_NAME='Warsha Test Customer'
$env:DEV_AUTH_ROLE='customer'
npm.cmd run auth:create-dev-user
```

The service-role value is used only by the Node process and must never be placed in `.env`, `.env.local`, `app.json`, an `EXPO_PUBLIC_*` variable, or mobile code.

Projects that previously ran the malformed `provider1@example.invalid` seed should first apply migration `202607200006_decouple_provider_auth.sql`, then remove only those deterministic fixtures through the supported Admin API:

```powershell
$env:SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVER_ONLY_SERVICE_ROLE_KEY'
npm.cmd run auth:cleanup-seed
```

The cleanup script verifies both the exact fictional email and its deterministic seed UUID before deletion. It does not match normally registered users.

## Mobile password-recovery redirects

Open **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**.

For Expo Go development, add:

```text
exp://**
```

This wildcard is development-only. `Linking.createURL('reset-password')` generates the active Expo Go development address, such as `exp://192.168.x.x:8081/--/reset-password`. The address varies with the development machine and network.

For Warsha development builds and production native builds, add:

```text
warsha://**
```

The Expo configuration already declares `"scheme": "warsha"` in `app.json`. A custom-scheme change requires a new development/native build because schemes are compiled into the native application. Expo Go continues to use its generated `exp://` address and does not require a custom Warsha build.

The app always supplies the generated callback as `redirectTo` when requesting a reset. Do not rely on `http://localhost:3000`: the hosted Supabase Site URL is not changed by the mobile app, and localhost is only an unsuitable fallback when a mobile reset request omits its explicit redirect. Configure the hosted Site URL separately for any real website that may be added later.

After changing the dashboard allow-list, restart Expo, request a new password-reset email, and use only the newest link. Previously issued or already-used recovery links can be rejected as expired.

## Customer confirmation delivery

Customer signup keeps **Confirm email** enabled. Warsha supplies
`Linking.createURL('auth/confirm')` as `emailRedirectTo`, so development and
production native builds return through `warsha://auth/confirm`; Expo Go uses
its generated `exp://` URL; web uses the current web origin and
`/auth/confirm`. Keep `warsha://**` and development-only `exp://**` in the
hosted Redirect URLs list. Add each real web origin explicitly when Warsha has
one, and make the production web origin the hosted Site URL.

The confirmation template must use `{{ .ConfirmationURL }}` (or a correctly
constructed `{{ .RedirectTo }}` link). A template hard-coded to
`{{ .SiteURL }}` ignores the callback supplied by the app.

Supabase's default SMTP service is only a setup aid. It sends only to addresses
belonging to members of the project's team, is currently limited to two
messages per hour, is best-effort, and has no delivery SLA. Warsha development
and production customer authentication therefore require custom SMTP before
email delivery can pass acceptance. Configure it in **Supabase Dashboard →
Project Settings → Authentication → SMTP Settings**, using a dedicated
authentication sending domain with SPF, DKIM, and DMARC. Never place the SMTP
password in this repository or an `EXPO_PUBLIC_*` variable.

The public signup response cannot prove account creation, sending, or delivery:
Supabase can return an obfuscated user (including plausible timestamps) for a
duplicate signup to prevent account enumeration. Warsha therefore reports only
that confirmation is required. An actual inbox test remains required after
SMTP and redirect configuration.
