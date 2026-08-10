begin;

select plan(12);

create function pg_temp.signup_manifest(p_language text default 'en')
returns jsonb language sql stable as $fn$
  select jsonb_agg(jsonb_build_object(
    'documentKey', d.document_key,
    'version', v.version,
    'language', p_language,
    'renderedHash', case when p_language = 'ar'
      then v.content_hash_ar else v.content_hash_en end
  ) order by d.sort_order)
  from public.legal_documents d
  join lateral (select * from private.legal_current_version(d.document_key)) v on true
  where d.active and d.requires_acceptance
    and (d.audience = 'all' or d.audience = 'customer')
$fn$;

select has_function(
  'private', 'handle_customer_email_confirmation', array[]::text[],
  'customer email confirmation handoff exists');
select has_trigger(
  'auth', 'users', 'on_customer_email_confirmed',
  'auth users invokes the customer confirmation handoff');
select is(
  has_function_privilege('anon', 'private.handle_customer_email_confirmation()', 'EXECUTE'),
  false, 'anonymous callers cannot invoke the confirmation handoff');
select is(
  has_function_privilege('authenticated', 'private.handle_customer_email_confirmation()', 'EXECUTE'),
  false, 'authenticated callers cannot invoke the confirmation handoff');
select is(
  has_function_privilege('service_role', 'private.handle_customer_email_confirmation()', 'EXECUTE'),
  false, 'the service role cannot bypass the Auth confirmation transition');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'eb190001-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'customer-confirmation@test.local', '', null,
  '{}',
  jsonb_build_object(
    'display_name','Confirmation Customer',
    'account_role','customer',
    'contact_phone','+201555555501',
    'legal_acceptances',pg_temp.signup_manifest()),
  now(), now()
);

select ok(
  exists (select 1 from public.profiles where id = 'eb190001-0000-4000-8000-000000000001'),
  'customer Auth creation still bootstraps the base profile');
select is(
  (select count(*)::integer from public.account_onboarding
    where user_id = 'eb190001-0000-4000-8000-000000000001'),
  0, 'customer onboarding does not begin before real email confirmation');

update auth.users
set email_confirmed_at = now(), updated_at = now()
where id = 'eb190001-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.account_onboarding
    where user_id = 'eb190001-0000-4000-8000-000000000001'),
  1, 'email confirmation creates exactly one onboarding record');
select is(
  (select intended_role from public.account_onboarding
    where user_id = 'eb190001-0000-4000-8000-000000000001'),
  'customer', 'the confirmed account keeps the customer intent');
select is(
  (select customer_state from public.account_onboarding
    where user_id = 'eb190001-0000-4000-8000-000000000001'),
  'address_required', 'confirmed customer continues to address onboarding');
select is(
  (select worker_state from public.account_onboarding
    where user_id = 'eb190001-0000-4000-8000-000000000001'),
  null, 'customer confirmation creates no worker onboarding state');

update auth.users
set updated_at = now()
where id = 'eb190001-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.account_onboarding
    where user_id = 'eb190001-0000-4000-8000-000000000001'),
  1, 'later Auth updates cannot duplicate customer onboarding');

select * from finish();
rollback;
