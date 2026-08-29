-- Retire three staff RPCs that no surface ever called.
--
-- `get_staff_help_articles(text)`, `staff_preview_campaign_eligibility(uuid, uuid)`
-- and `staff_revoke_referral_code(uuid, text)` were written as part of WPS-019
-- and WPS-021 and were never wired to anything. The repository cleanup on
-- 2026-08-28 found them and left them standing, on the reasoning that a
-- capability-gated governance surface is a control and dropping controls to
-- tidy a repository is a poor trade. That reasoning was wrong in one respect: a
-- control nothing invokes is not protecting anything. It is an unaudited
-- SECURITY DEFINER entry point that every `authenticated` role may call, kept
-- alive by nobody's decision.
--
-- The evidence, gathered before this migration was written:
--
--   * a literal search of every text file in the repository finds them only in
--     the migration that created them — no client, no Edge Function, no test,
--     no script, no document, no CI workflow;
--   * every `.rpc()` call site in the codebase passes a string literal, and
--     none of those literals is one of these three. The generic
--     `rpc(name, parameters)` wrappers in `admin-repository`,
--     `dispute-repository`, `job-operation-repository`,
--     `notification-repository`, `provider-job-repository` and
--     `supabase-marketplace-repository` are all reached with literals from
--     their callers, so the literal search covers them;
--   * no template literal or concatenation anywhere builds an RPC name;
--   * `pg_depend` records nothing depending on them;
--   * no other routine in `public` or `private` names them in its body;
--   * no view, policy or trigger references them.
--
-- What is NOT removed. All three read or write tables that other, live code
-- owns: `help_articles` and `help_article_translations` back the customer help
-- centre, and `referral_codes` backs the growth surfaces. Dropping a function
-- says nothing about the data it read, and this migration touches no table,
-- column, policy or row.
--
-- The capabilities themselves also stay. `manage_support_cases`,
-- `manage_growth_campaigns` and `manage_referral_programs` are held by staff
-- roles and gate other functions that ARE called; only these three doors close.
--
-- Idempotent, and safe on a database where they were never present.

drop function if exists public.get_staff_help_articles(text);
drop function if exists public.staff_preview_campaign_eligibility(uuid, uuid);
drop function if exists public.staff_revoke_referral_code(uuid, text);

notify pgrst, 'reload schema';
