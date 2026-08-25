-- Take back the default privileges Supabase hands every new public table.
--
-- `202608260001` created `professions`, `profession_service_categories` and
-- `profession_services` and granted `select` to `anon` and `authenticated`,
-- which is all a client needs to render the relationship between a trade and
-- its work. Granting is not the whole job: a new table in `public` arrives with
-- Supabase's default privileges already attached, so those two roles also held
-- TRUNCATE, REFERENCES and TRIGGER on all three before anything was granted.
--
-- Nothing could be reached through them — every one of these tables has RLS on
-- and a select-only policy, and TRUNCATE is refused to a role that cannot
-- bypass RLS. But `privacy-data-lifecycle.test.sql` asserts the count is zero
-- rather than reasoning about reachability, which is the right way round: the
-- next table to be added should not depend on somebody re-deriving why a
-- surplus privilege happens to be harmless today.
--
-- `revoke all` then `grant select` is the order that works, because revoking
-- after granting would take the select back with it.

revoke all on public.professions from anon, authenticated;
revoke all on public.profession_service_categories from anon, authenticated;
revoke all on public.profession_services from anon, authenticated;

grant select on public.professions to anon, authenticated;
grant select on public.profession_service_categories to anon, authenticated;
grant select on public.profession_services to anon, authenticated;
