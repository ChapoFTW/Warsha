-- Take back the privileges Supabase hands every new object in `public`.
--
-- ## What was wrong
--
-- Supabase's bootstrap sets, for the `public` schema:
--
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated, service_role;
--     alter default privileges in schema public
--       grant all on functions to anon, authenticated, service_role;
--
-- so every table Warsha has ever created arrived with INSERT, SELECT, UPDATE
-- and DELETE already held by `anon` and `authenticated`, and every function
-- arrived EXECUTE-able by both. Granting narrowly afterwards does not undo it:
-- `202608010002_profile_self_access.sql` granted `select` and
-- `update (display_name, preferred_language)` on `public.profiles`, which was
-- exactly right and entirely inert, because the table already carried `arwd`
-- for both roles. `202608260002_profession_table_grants.sql` is the only
-- migration that got the order right — `revoke all` first, then grant — and it
-- says so in its own comment. This migration applies that order to everything
-- else.
--
-- The result was that `anon` held INSERT/UPDATE/DELETE on `admin_roles`,
-- `admin_permissions`, `admin_role_assignments`, `user_roles`, `audit_logs`,
-- `payments`, `payment_transactions`, `refunds`, `provider_earnings`,
-- `provider_payouts` and twenty more, and EXECUTE on fourteen functions beyond
-- the nine the public read surface is allowed to reach — including
-- `staff_publish_legal_version`, `staff_sync_provider_status` and
-- `submit_my_criminal_record`.
--
-- ## What was NOT wrong
--
-- Nothing was reachable. Every one of those tables has RLS enabled, and RLS
-- with no policy for a command denies that command outright, so a surplus
-- grant could not be exercised. Every surplus function is SECURITY DEFINER
-- with its own `require_staff_capability` or `auth.uid()` guard, and each was
-- confirmed to answer an anonymous caller with `42501 Authentication
-- required`. Both facts were checked against the running database before this
-- migration was written, and neither is a reason to keep the grants: a
-- privilege that is only harmless because a second control happens to hold is
-- the definition of a control with no depth behind it.
--
-- ## What this migration does
--
-- 1. Fixes the source, so the next table does not arrive the same way.
-- 2. Revokes every client-role privilege on every table in `public`, then
--    grants back one explicit manifest. The manifest is not invented: a
--    privilege is granted only where an RLS policy actually permits that
--    command for that role, which is the difference between a privilege that
--    does something and a privilege that merely exists.
-- 3. Restores `profiles.update` to the two columns it was always meant to
--    cover, so the authoritative `phone` column stops being writable by its
--    owner.
-- 4. Reduces the anon-executable function surface to the nine reads that
--    `authentication-role-onboarding-vetting.test.sql` names as sanctioned.
--
-- Two deliberate departures from "keep whatever a policy allows":
--
--   * `anon` loses SELECT on `provider_profiles`. A `providers_public_read`
--     policy does admit anon, but no client reads that table directly —
--     discovery is `get_discovery_home`, `search_providers` and their
--     siblings, all SECURITY DEFINER — and `profile-self-access.test.sql`
--     states the rule as "anonymous browsing keeps using the guarded catalog
--     RPC". The policy is left in place; it still serves `authenticated`.
--   * `profiles.update` is column-scoped rather than table-wide, per above.
--
-- Idempotent, and correct whatever the starting state: the revoke is
-- unconditional and the grants are absolute, so a clean database, a drifted
-- Development database and a second application all converge on the same end
-- state.

-- 1. The source.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- A limitation worth stating rather than papering over.
--
-- The two lines above genuinely close the table and sequence defaults: a table
-- created in `public` after this migration arrives with nothing for either
-- client role, which was checked by creating one. FUNCTIONS cannot be closed
-- the same way. PostgreSQL grants EXECUTE on every new function to PUBLIC as a
-- built-in, and merges that with `pg_default_acl` rather than being overridden
-- by it, so `alter default privileges ... revoke execute on functions from
-- public` stores nothing and changes nothing — verified, not assumed.
--
-- So the next function written in `public` WILL be anon-callable the moment it
-- exists, and the guard has to live somewhere else. It lives in two places:
-- the `revoke execute ... from public` line that Warsha migrations already
-- write by convention, and `client-role-authority.test.sql`, which asserts the
-- anon-executable set is exactly the nine sanctioned reads BY NAME. A function
-- that arrives holding more fails there, in CI, on the commit that adds it.
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- 2. Clear every client-role privilege in `public`, including the TRUNCATE,
--    REFERENCES, TRIGGER and MAINTAIN bits that `information_schema` hides and
--    that no application has ever needed.
do $$
declare
  target record;
begin
  for target in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
    order by c.relname
  loop
    execute format('revoke all on public.%I from anon, authenticated', target.relname);
  end loop;
end $$;

-- 3. The manifest: every client-role table privilege Warsha actually uses.

-- authenticated: the signed-in surface.
grant select on public.account_deletion_requests to authenticated;
grant select on public.account_onboarding to authenticated;
grant delete, insert, select, update on public.addresses to authenticated;
grant delete, insert, select, update on public.admin_permissions to authenticated;
grant delete, insert, select, update on public.admin_role_assignments to authenticated;
grant delete, insert, select, update on public.admin_roles to authenticated;
grant select on public.app_settings to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.booking_abuse_reports to authenticated;
grant select on public.booking_additional_work_requests to authenticated;
grant delete, insert, select on public.booking_attachments to authenticated;
grant select on public.booking_benefit_redemptions to authenticated;
grant select on public.booking_operation_events to authenticated;
grant select on public.booking_operations to authenticated;
grant select on public.booking_price_adjustments to authenticated;
grant select on public.booking_price_snapshots to authenticated;
grant select on public.booking_return_visits to authenticated;
grant select on public.booking_status_history to authenticated;
grant select on public.bookings to authenticated;
grant select on public.conversation_members to authenticated;
grant select on public.conversation_typing to authenticated;
grant select on public.conversations to authenticated;
grant delete, insert, select, update on public.customer_profiles to authenticated;
grant delete, insert, select, update on public.favourites to authenticated;
grant select on public.financial_booking_payments to authenticated;
grant select on public.financial_refunds to authenticated;
grant select on public.help_article_feedback to authenticated;
grant select on public.help_article_translations to authenticated;
grant select on public.help_article_versions to authenticated;
grant select on public.help_articles to authenticated;
grant select on public.help_categories to authenticated;
grant select on public.job_progress_media to authenticated;
grant select on public.legal_acceptances to authenticated;
grant select on public.legal_document_versions to authenticated;
grant select on public.legal_documents to authenticated;
grant select on public.marketplace_requests to authenticated;
grant select on public.message_attachments to authenticated;
grant select on public.messages to authenticated;
grant select on public.notification_preferences to authenticated;
grant select on public.notifications to authenticated;
grant select on public.operational_assignment_events to authenticated;
grant select on public.operational_assignments to authenticated;
grant select on public.operational_incident_events to authenticated;
grant select on public.operational_incidents to authenticated;
grant select on public.privacy_consent_purposes to authenticated;
grant select on public.privacy_consent_records to authenticated;
grant select on public.privacy_export_requests to authenticated;
grant select on public.profession_service_categories to authenticated;
grant select on public.profession_services to authenticated;
grant select on public.professions to authenticated;
grant select on public.profiles to authenticated;
grant select on public.provider_cash_commission_records to authenticated;
grant select on public.provider_certifications to authenticated;
grant select on public.provider_earning_holds to authenticated;
grant select on public.provider_earnings_ledger to authenticated;
grant select on public.provider_emergency_categories to authenticated;
grant select on public.provider_financial_cases to authenticated;
grant select on public.provider_payout_destinations to authenticated;
grant delete, insert, select, update on public.provider_portfolio to authenticated;
grant delete, insert, select, update on public.provider_portfolio_images to authenticated;
grant select on public.provider_profiles to authenticated;
grant select on public.provider_service_areas to authenticated;
grant select on public.provider_services to authenticated;
grant select on public.provider_verification_documents to authenticated;
grant select on public.provider_verifications to authenticated;
grant select on public.provider_withdrawal_requests to authenticated;
grant select on public.quote_invitations to authenticated;
grant select on public.referral_attributions to authenticated;
grant select on public.referral_codes to authenticated;
grant select on public.referral_rewards to authenticated;
grant select on public.review_attachments to authenticated;
grant select on public.review_edit_events to authenticated;
grant select on public.review_helpfulness_votes to authenticated;
grant select on public.review_moderation_events to authenticated;
grant select on public.review_report_events to authenticated;
grant select on public.review_reports to authenticated;
grant select on public.review_responses to authenticated;
grant select on public.service_categories to authenticated;
grant select on public.services to authenticated;
grant select on public.staff_capabilities to authenticated;
grant select on public.staff_queues to authenticated;
grant select on public.staff_role_capabilities to authenticated;
grant select on public.staff_role_grants to authenticated;
grant select on public.staff_roles to authenticated;
grant select on public.support_messages to authenticated;
grant select on public.support_ticket_attachments to authenticated;
grant select on public.support_ticket_events to authenticated;
grant select on public.support_tickets to authenticated;
grant select on public.trust_account_state to authenticated;
grant select on public.trust_appeals to authenticated;
grant select on public.trust_enforcement_actions to authenticated;
grant select on public.trust_report_events to authenticated;
grant select on public.trust_reports to authenticated;
grant delete, insert, select, update on public.user_display_preferences to authenticated;
grant delete, insert, select, update on public.user_recent_searches to authenticated;
grant delete, insert, select, update on public.user_recently_viewed_providers to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.worker_criminal_record_submissions to authenticated;
grant select on public.worker_onboarding_events to authenticated;
grant select on public.worker_quotes to authenticated;

-- Column-scoped reads, restored exactly as they were.
--
-- These four tables never had a table-level SELECT. They carry COLUMN grants,
-- which `information_schema.role_table_grants` does not report and which a
-- `revoke all` silently destroys - the trap this migration nearly fell into.
-- The narrowing IS the security control:
--
--   * `reviews` exposes 19 of its 23 columns to both client roles.
--     `202607270001_reviews_ratings.sql` withholds the moderation reason, actor
--     and timestamps, because a reader may see THAT a review was moderated and
--     never who decided it or why.
--   * `disputes` exposes 20 of 26 columns, `dispute_events` 10 of 12 and
--     `dispute_evidence` 7 of 11, on the same principle: a participant sees
--     their own case, not the internal handling of it.
--
-- `disputes` is load-bearing well beyond its own table. The
-- `dispute_evidence_upload` policy on `storage.objects` runs
-- `exists (select 1 from public.disputes ...)` as the CALLER, so without this
-- grant every authenticated upload to every bucket fails with "permission
-- denied for table disputes" before RLS is ever consulted.

grant select (id, dispute_id, booking_id, state, event_type, actor_class,
  visibility, note, metadata, created_at)
  on public.dispute_events to authenticated;

grant select (id, dispute_id, created_at, booking_id, mime_type, byte_size,
  file_name)
  on public.dispute_evidence to authenticated;

grant select (id, booking_id, opened_by, reason, status, description,
  created_at, updated_at, opened_by_role, policy_version, eligible_until,
  submitted_at, review_started_at, resolution_type, resolution_summary,
  resolution_financial_action, return_visit_id, resolved_at, closed_at,
  cancelled_at)
  on public.disputes to authenticated;

grant select (id, booking_id, customer_id, provider_id, rating, comment,
  is_anonymous, created_at, updated_at, deleted_at, moderation_status,
  professionalism_rating, quality_rating, punctuality_rating,
  communication_rating, value_rating, edit_deadline_at, edited_at, revision)
  on public.reviews to anon;

grant select (id, booking_id, customer_id, provider_id, rating, comment,
  is_anonymous, created_at, updated_at, deleted_at, moderation_status,
  professionalism_rating, quality_rating, punctuality_rating,
  communication_rating, value_rating, edit_deadline_at, edited_at, revision)
  on public.reviews to authenticated;

-- anon: the signed-out public surface, and nothing else.
grant select on public.profession_service_categories to anon;
grant select on public.profession_services to anon;
grant select on public.professions to anon;
grant select on public.profiles to anon;
grant select on public.provider_portfolio to anon;
grant select on public.provider_services to anon;
grant select on public.review_responses to anon;
grant select on public.service_categories to anon;
grant select on public.services to anon;

-- 4. The two columns a customer owns on their own profile.
--
-- `202608010002_profile_self_access.sql` intended exactly this and was
-- overruled by the default privileges it never revoked. `phone` is the
-- authoritative identity column, written by the verification path and never by
-- its owner, which is why `profile-self-access.test.sql` expects `42501` when
-- an account tries.
grant update (display_name, preferred_language) on public.profiles to authenticated;

-- 5. The anon-executable function surface.
--
-- `authentication-role-onboarding-vetting.test.sql` names nine sanctioned
-- reads and asserts nothing outside them is anon-executable. Fourteen others
-- were reachable, all of them guarded, none of them intended: the "my"
-- surfaces and the capability probes need an account by construction, and the
-- `staff_*` functions are staff surfaces whose only barrier was the guard
-- inside them.
--
-- `authenticated` keeps EXECUTE throughout — every one of these is called from
-- a signed-in repository — and `private` is untouched, because the anon read
-- policies evaluate `private.is_provider_publicly_discoverable(uuid)` and stop
-- working without it.
do $$
declare
  target record;
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname not in (
        'get_marketplace_catalog', 'get_marketplace_catalog_v2', 'get_discovery_home',
        'get_discovery_filters', 'get_search_suggestions', 'search_providers',
        'get_provider_rating_summary', 'get_provider_reputation_summary',
        'get_provider_trust_indicators')
  loop
    execute format('revoke execute on function %s from anon', target.signature);
  end loop;
end $$;

-- Granted by name so an overload added later is covered by the same rule that
-- sanctioned the function, rather than silently missing the grant.
do $$
declare
  target record;
begin
  for target in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'get_marketplace_catalog', 'get_marketplace_catalog_v2', 'get_discovery_home',
        'get_discovery_filters', 'get_search_suggestions', 'search_providers',
        'get_provider_rating_summary', 'get_provider_reputation_summary',
        'get_provider_trust_indicators')
  loop
    execute format('grant execute on function %s to anon', target.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
