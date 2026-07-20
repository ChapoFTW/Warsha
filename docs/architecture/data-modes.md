# Switching data modes

Copy `.env.example` to `.env.local`. Expo automatically loads `EXPO_PUBLIC_` variables.

## Mock mode (default)

```env
EXPO_PUBLIC_DATA_MODE=mock
```

No credentials or database are required. Existing fictional data stays available through `mockDataAdapter`.

## Supabase mode

```env
EXPO_PUBLIC_DATA_MODE=supabase
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Restart Expo after changing environment variables. `dataAdapter` will select `supabaseDataAdapter`. Supabase booking writes require an authenticated user because RLS blocks guest writes. Never add the service-role key to the mobile environment.
