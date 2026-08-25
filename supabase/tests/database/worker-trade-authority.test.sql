begin;
select no_plan();

-- Step 3's server contract. These tests execute the same security-definer RPC
-- used by Android, iOS and web; they do not restate its validation in test code.

select has_table('public', 'professions', 'worker professions are server-authoritative');
select has_table('public', 'profession_service_categories', 'profession category scope is server-authoritative');
select has_table('public', 'profession_services', 'exact profession service scope is server-authoritative');
select is(
  (select count(*)::integer from public.professions where is_selectable),
  34,
  'exactly 34 professions are selectable'
);
select set_eq(
  $$select id from public.professions where not is_selectable$$,
  $$values ('handyman'), ('generalMaintenance')$$,
  'withdrawn catch-all professions remain resolvable and unselectable'
);
select is(
  (select count(*)::integer from public.professions p
   where p.is_selectable and not exists (
     select 1 from public.profession_services ps where ps.profession_id = p.id
   )),
  0,
  'every selectable profession has at least one intentional service'
);
select is(
  (select count(*)::integer
   from public.profession_services ps
   join public.services s on s.id = ps.service_id
   where ps.profession_id = 'poolTechnician'
     and s.translation_key = 'plumbing-toilet-repair'),
  0,
  'pool technicians are not widened to unrelated bathroom plumbing'
);

insert into auth.users(
  instance_id,id,aud,role,email,phone,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'a2600000-0000-4000-8000-000000000001',
  'authenticated','authenticated',null,'+201000000126','',now(),
  '{}','{"display_name":"Trade Contract Worker"}',now(),now()
);
insert into public.user_roles(user_id,role)
values('a2600000-0000-4000-8000-000000000001','provider');
insert into public.provider_profiles(
  user_id,display_name,profession_key,experience_years,service_radius_km
) values (
  'a2600000-0000-4000-8000-000000000001','Trade Contract Worker','',5,15
);

create function pg_temp.trade_payload(
  p_profession text,
  p_specialties text[],
  p_categories text[],
  p_service_keys text[]
) returns jsonb language sql stable as $fn$
  select jsonb_build_object(
    'displayName', 'Trade Contract Worker',
    'profession', p_profession,
    'about', '',
    'experienceYears', 5,
    'experienceSummary', '',
    'specialties', to_jsonb(p_specialties),
    'languages', '[]'::jsonb,
    'categoryIds', to_jsonb(p_categories),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'serviceId', s.id,
        'translationKey', s.translation_key,
        'name', s.name
      ) order by array_position(p_service_keys, s.translation_key))
      from public.services s
      where s.translation_key = any(p_service_keys)
    ), '[]'::jsonb),
    'areas', '[]'::jsonb,
    'serviceRadiusKm', 15,
    'isAvailable', false,
    'emergencyAvailable', false,
    'agreementAccepted', false
  );
$fn$;

set local role authenticated;
select set_config('request.jwt.claim.sub','a2600000-0000-4000-8000-000000000001',true);

-- A. Plumber + Leak repair + Blocked drain.
select lives_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload(
    'plumbing', array['profession:plumbing'], array['plumbing'],
    array['plumbing-leak-repair','plumbing-blocked-drain']
  )
), 'plumber with leak repair and blocked drain saves');
select set_eq(
  $$select s.translation_key from public.provider_services ps
    join public.services s on s.id=ps.service_id
    join public.provider_profiles p on p.id=ps.provider_id
    where p.user_id='a2600000-0000-4000-8000-000000000001'$$,
  $$values ('plumbing-leak-repair'), ('plumbing-blocked-drain')$$,
  'plumber service UUID relationships are persisted'
);

-- B. Electrician + Socket repair.
select lives_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload(
    'electrical', array['profession:electrical'], array['electrical'],
    array['electrical-socket-repair']
  )
), 'electrician with socket repair saves');
select is(
  (select p.profession_key from public.provider_profiles p
   where p.user_id='a2600000-0000-4000-8000-000000000001'),
  'electrical',
  'the selected primary profession is persisted'
);

-- C. Plumber + Electrician, with a valid service for each.
select lives_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload(
    'plumbing', array['profession:plumbing','profession:electrical'],
    array['plumbing','electrical'],
    array['plumbing-leak-repair','electrical-socket-repair']
  )
), 'multi-profession selection with valid services saves');
select set_eq(
  $$select unnest(p.specialties) from public.provider_profiles p
    where p.user_id='a2600000-0000-4000-8000-000000000001'$$,
  $$values ('profession:plumbing'), ('profession:electrical')$$,
  'multi-profession stable IDs are persisted'
);

-- D/E/F. Ordinary omissions are specific; malformed relationships and
-- withdrawn catch-alls are rejected at the server boundary.
select throws_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload('plumbing', array['profession:plumbing'], array['plumbing'], array[]::text[])
), '22023', 'Service required', 'a selected profession requires at least one service');
select throws_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload(
    'plumbing', array['profession:plumbing'], array['plumbing'],
    array['electrical-socket-repair']
  )
), '22023', 'Service outside profession', 'cross-profession service injection is rejected');
select throws_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload(
    'plumbing', array['profession:plumbing'], array['plumbing','cleaning'],
    array['plumbing-leak-repair']
  )
), '22023', 'Service outside profession', 'unrelated discovery category injection is rejected');
select throws_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload('handyman', array[]::text[], array[]::text[], array[]::text[])
), '22023', 'Withdrawn profession', 'Handyman cannot be selected for a new profile');
select throws_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload(
    'plumbing', array['profession:plumbing','profession:generalMaintenance'],
    array['plumbing'], array['plumbing-leak-repair']
  )
), '22023', 'Withdrawn profession', 'General maintenance cannot be injected as a second profession');

select throws_ok(
  $$select public.save_provider_foundation(jsonb_build_object(
    'displayName','Trade Contract Worker','profession','plumbing','about','',
    'experienceYears',5,'experienceSummary','',
    'specialties',jsonb_build_array('profession:plumbing'),
    'languages','[]'::jsonb,'categoryIds',jsonb_build_array('plumbing'),
    'services',jsonb_build_array(jsonb_build_object('serviceId','not-a-uuid','name','Bad')),
    'areas','[]'::jsonb,'serviceRadiusKm',15,'isAvailable',false,
    'emergencyAvailable',false,'agreementAccepted',false
  ), false)$$,
  '22023', 'Invalid service', 'malformed service identity is rejected specifically'
);

-- Compatibility: a row created by the former global catalogue remains
-- readable and saveable while its historical profession is unchanged.
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.provider_profiles
set profession_key='handyman', specialties='{}',
    primary_category_id='general-maintenance', category_ids=array['general-maintenance']
where user_id='a2600000-0000-4000-8000-000000000001';
delete from public.provider_services
where provider_id=(select id from public.provider_profiles
  where user_id='a2600000-0000-4000-8000-000000000001');
insert into public.provider_services(provider_id,service_id,is_active)
select p.id,s.id,true from public.provider_profiles p
join public.services s on s.translation_key='hair-bridal'
where p.user_id='a2600000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','a2600000-0000-4000-8000-000000000001',true);
select lives_ok(format(
  'select public.save_provider_foundation(%L::jsonb, false)',
  pg_temp.trade_payload(
    'handyman', array[]::text[], array['general-maintenance'], array['hair-bridal']
  )
), 'an unchanged historical catch-all profile remains saveable');
select is(
  (select s.translation_key from public.provider_services ps
   join public.services s on s.id=ps.service_id
   join public.provider_profiles p on p.id=ps.provider_id
   where p.user_id='a2600000-0000-4000-8000-000000000001'),
  'hair-bridal',
  'the historical service relationship remains readable and persisted'
);

reset role;
select set_config('request.jwt.claim.sub','',true);
select * from finish();
rollback;
