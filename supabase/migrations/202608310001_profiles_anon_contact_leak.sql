-- A published provider's phone number was readable by anybody.
--
-- `profiles_public_provider_select` let `anon` and `authenticated` select any
-- row of `public.profiles` belonging to a publicly discoverable provider, and
-- `anon` held a column grant on every column of that table -- including
-- `phone`. The publishable key is in the client bundle, so "anon" here means
-- anyone at all:
--
--     GET /rest/v1/profiles?select=*
--     [{"display_name":"…","phone":"+2010………","avatar_url":"…", …}]
--
-- Nothing has met this yet only because no provider is published on hosted
-- Development. It would have become live with the first real professional.
--
-- The contradiction is the tell. `search_providers`, `get_marketplace_catalog`
-- and every other public discovery function are careful never to return a
-- contact detail -- `search-discovery-appearance.test.sql` asserts "no result
-- carries a coordinate, a contact, a document" -- and the privacy export
-- deliberately excludes "other participants' contact details". The RPC surface
-- was withholding exactly what the table surface was handing out.
--
-- Nothing reads it. Every client read of `public.profiles` is the caller's own
-- row: `language-repository.ts`, `supabase-user-repositories.ts`,
-- `web/app/app/account/page.tsx` and `web/components/language-account-sync.tsx`
-- all filter on the signed-in id. Provider cards render from
-- `provider_profiles`, which carries its own `display_name` and `avatar_url`
-- for exactly this purpose. The thirty-three functions that read `profiles` are
-- SECURITY DEFINER and the one Edge Function that reads it uses the service
-- role, so none of them depends on this policy.
--
-- So the policy is removed rather than narrowed. A public provider card does
-- not need the account table, and a row that no client reads should not be
-- reachable by everyone on the internet.

drop policy if exists profiles_public_provider_select on public.profiles;

-- Defence in depth. Dropping the policy closes the door; taking the grant back
-- means a policy added later cannot reopen it by accident, which is how this
-- surface acquired the exposure in the first place.
revoke select on public.profiles from anon;

comment on table public.profiles is
  'Account-owned data. Readable only by the account it belongs to, and by the '
  'trusted server-side functions that run as the owner. Public provider display '
  'data lives on public.provider_profiles (display_name, avatar_url) -- do not '
  'add a public read policy here: this table holds phone numbers.';
