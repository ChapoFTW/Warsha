# Connect Warsha to Supabase

## Values required by the mobile app

Open your Supabase project dashboard and select **Connect** (or **Project Settings → API**). Obtain exactly:

1. **Project URL** — looks like `https://abcdefghijk.supabase.co`.
2. **Publishable key** — the client-safe key usually beginning with `sb_publishable_`. Older projects may show an `anon` key; prefer the publishable key when available.

Create `.env.local` in the Warsha project root, beside `package.json`:

```env
EXPO_PUBLIC_DATA_MODE=supabase
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Do not quote the values. Stop and restart Expo after changing them because Expo reads public environment variables when bundling.

## Values that must never be placed here

Do not copy the Supabase `service_role` secret, secret key, database password, access token, or JWT signing secret into `.env.local`, `app.json`, or any `EXPO_PUBLIC_` variable. A service-role key bypasses RLS. Future trusted server code must receive secrets through Supabase Edge Function secrets or its hosting platform’s server-only secret manager.

## Dashboard configuration

1. In **Authentication → Providers → Email**, enable Email authentication.
2. Choose whether **Confirm email** is enabled. When enabled, new users must click the emailed confirmation link before signing in.
3. In **Authentication → URL Configuration**, set the Site URL for development as appropriate for your Expo environment. Password signup/sign-in works without a mobile redirect; magic links require a configured `warsha://` redirect later.
4. Apply migrations with the Supabase CLI: `npx supabase link`, then `npx supabase db push`.
5. Populate approved providers and their services. Only provider rows with `is_published = true` are visible in Supabase mode.

## Switching back to local data

Set `EXPO_PUBLIC_DATA_MODE=mock` and restart Expo. No Supabase values are required in mock mode.
