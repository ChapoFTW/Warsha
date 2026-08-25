-- Catalogue identity must survive every projection that presents structured
-- work. Stored English names remain historical fallbacks, never the normal UI
-- path for a keyed service.
--
-- This also removes the pre-expansion category allow-list from worker profile
-- saves. The database catalogue's active state is the authority: all nineteen
-- active categories are valid, while withdrawn `general-maintenance` remains
-- resolvable in history and cannot be selected for new work.

-- Re-home existing worker identity too. The shared profession taxonomy already
-- uses these targets for new edits; leaving stored profiles on the withdrawn
-- catch-all would make those workers disappear from their real trade until
-- they happened to edit their profile.
with rehomed as (
  select p.id, case p.profession_key
    when 'locksmith' then 'locksmithing'
    when 'aluminumWorker' then 'alumetal'
    when 'glassWorker' then 'alumetal'
    when 'welder' then 'alumetal'
    when 'tiler' then 'flooring-tiling'
    when 'flooringSpecialist' then 'flooring-tiling'
    when 'mason' then 'renovation-finishing'
    when 'constructionWorker' then 'renovation-finishing'
    when 'renovationWorker' then 'renovation-finishing'
    when 'gypsumWorker' then 'renovation-finishing'
    when 'gardener' then 'gardening'
    when 'landscaper' then 'gardening'
    when 'pestControlWorker' then 'pest-control'
    when 'waterHeaterTechnician' then 'water-heater-repair'
  end as category_id
  from public.provider_profiles p
  where p.profession_key in (
    'locksmith','aluminumWorker','glassWorker','welder','tiler',
    'flooringSpecialist','mason','constructionWorker','renovationWorker',
    'gypsumWorker','gardener','landscaper','pestControlWorker',
    'waterHeaterTechnician'
  )
)
update public.provider_profiles p
set primary_category_id = case
      when p.primary_category_id = 'general-maintenance' then r.category_id
      else p.primary_category_id end,
    category_ids = case
      when 'general-maintenance' = any(p.category_ids) then
        array[r.category_id] || array(
          select category_id from pg_catalog.unnest(p.category_ids) category_id
          where category_id not in ('general-maintenance', r.category_id)
        )
      else p.category_ids end
from rehomed r
where r.id = p.id
  and (p.primary_category_id = 'general-maintenance'
    or 'general-maintenance' = any(p.category_ids));

create or replace function public.get_my_worker_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pg_catalog.jsonb_build_object(
      'id', p.id,
      'status', p.onboarding_status,
      'displayName', p.display_name,
      'avatarPath', p.avatar_url,
      'profession', p.profession_key,
      'about', p.about,
      'experienceYears', p.experience_years,
      'experienceSummary', p.experience_summary,
      'specialties', p.specialties,
      'ratingAverage', p.rating_average,
      'languages', p.languages,
      'categoryIds', p.category_ids,
      'serviceRadiusKm', p.service_radius_km,
      'isAvailable', p.is_available,
      'emergencyAvailable', p.emergency_available,
      'temporaryUnavailableUntil', p.temporary_unavailable_until,
      'agreementAccepted', p.provider_agreement_accepted_at is not null,
      'services', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'serviceId', ps.service_id,
          'translationKey', s.translation_key,
          'name', s.name
        ) order by s.name, s.id)
        from public.provider_services ps join public.services s on s.id = ps.service_id
        where ps.provider_id = p.id
      ), '[]'::jsonb),
      'areas', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'governorate', a.governorate, 'district', coalesce(a.district, ''),
          'radiusKm', a.radius_km
        ) order by a.governorate, a.district, a.id)
        from public.provider_service_areas a where a.provider_id = p.id
      ), '[]'::jsonb)
    )
    from public.provider_profiles p
    where p.user_id = (select auth.uid()) and p.deleted_at is null
  ), '{}'::jsonb)
$$;

create or replace function public.save_provider_foundation(
  p_profile jsonb,
  p_submit boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pid uuid;
  item jsonb;
  radius numeric;
  area_radius numeric;
  next_status text;
  bio text;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_profile is null or pg_catalog.jsonb_typeof(p_profile) <> 'object'
    then raise exception 'Invalid provider information' using errcode = '22023'; end if;
  select id, onboarding_status into pid, next_status
  from public.provider_profiles where user_id = uid and deleted_at is null for update;
  if pid is null then raise exception 'Provider profile not found' using errcode = '42501'; end if;
  bio := pg_catalog.btrim(coalesce(p_profile->>'about', ''));
  radius := coalesce((p_profile->>'serviceRadiusKm')::numeric, 0);
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'displayName', ''))) not between 2 and 100
    or pg_catalog.length(pg_catalog.btrim(coalesce(p_profile->>'profession', ''))) not between 2 and 100
    or pg_catalog.length(bio) > 500
    or pg_catalog.length(coalesce(p_profile->>'experienceSummary', '')) > 500
    or coalesce((p_profile->>'experienceYears')::integer, -1) not between 0 and 80
    or radius not between 1 and 250
  then raise exception 'Invalid provider information' using errcode = '22023'; end if;
  if pg_catalog.jsonb_array_length(coalesce(p_profile->'specialties', '[]'::jsonb)) > 10
    or exists (
      select 1 from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties', '[]'::jsonb)) s
      where pg_catalog.length(pg_catalog.btrim(s.value)) not between 1 and 50
    )
  then raise exception 'Invalid specialties' using errcode = '22023'; end if;
  if p_submit and (
    not coalesce((p_profile->>'agreementAccepted')::boolean, false)
    or pg_catalog.length(bio) < 20
    or not exists (select 1 from storage.objects o where o.bucket_id = 'profile-images' and o.name = (
      select avatar_url from public.provider_profiles where id = pid
    ))
  ) then raise exception 'Complete the required profile details' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds', '[]'::jsonb)) c
    where not exists (
      select 1 from public.service_categories sc
      where sc.id = c.value and sc.is_active and sc.deleted_at is null
    )
  ) then raise exception 'Invalid service category' using errcode = '22023'; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)))
    <> (select pg_catalog.count(distinct value->>'serviceId') from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)))
  then raise exception 'Duplicate provider service' using errcode = '22023'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::jsonb)) a
    group by a.value->>'governorate', a.value->>'district' having pg_catalog.count(*) > 1
  ) then raise exception 'Duplicate service area' using errcode = '22023'; end if;
  if p_submit and next_status in ('draft','more_information_required','rejected') then next_status := 'submitted'; end if;

  update public.provider_profiles set
    display_name = pg_catalog.btrim(p_profile->>'displayName'),
    profession_key = pg_catalog.btrim(p_profile->>'profession'),
    about = bio,
    experience_years = (p_profile->>'experienceYears')::integer,
    experience_summary = pg_catalog.btrim(coalesce(p_profile->>'experienceSummary', '')),
    specialties = coalesce(array(
      select pg_catalog.btrim(value) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties','[]'::jsonb))
    ), '{}'),
    languages = coalesce(array(
      select pg_catalog.left(pg_catalog.btrim(value), 50) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'languages','[]'::jsonb))
      where pg_catalog.length(pg_catalog.btrim(value)) > 0 limit 10
    ), '{}'),
    skills = coalesce(array(
      select pg_catalog.btrim(value) from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'specialties','[]'::jsonb))
    ), '{}'),
    category_ids = coalesce(array(
      select value from pg_catalog.jsonb_array_elements_text(coalesce(p_profile->'categoryIds','[]'::jsonb)) limit 10
    ), '{}'),
    primary_category_id = nullif(p_profile->'categoryIds'->>0, ''),
    service_radius_km = radius,
    is_available = coalesce((p_profile->>'isAvailable')::boolean, false),
    emergency_available = coalesce((p_profile->>'emergencyAvailable')::boolean, false),
    temporary_unavailable_until = nullif(p_profile->>'temporaryUnavailableUntil', '')::timestamptz,
    provider_agreement_accepted_at = case
      when coalesce((p_profile->>'agreementAccepted')::boolean, false)
        then coalesce(provider_agreement_accepted_at, pg_catalog.now())
      else provider_agreement_accepted_at end,
    onboarding_status = next_status
  where id = pid and user_id = uid;

  delete from public.provider_services where provider_id = pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'services','[]'::jsonb)) loop
    insert into public.provider_services(
      provider_id, service_id, custom_price_egp, pricing_type,
      transportation_fee_egp, emergency_surcharge_egp, is_active
    )
    select pid, s.id, null, s.pricing_type, 0, 0, true
    from public.services s join public.service_categories c on c.id = s.category_id
    where s.id = (item->>'serviceId')::uuid and s.is_active and s.deleted_at is null
      and c.is_active and c.deleted_at is null;
    if not found then raise exception 'Invalid service' using errcode = '22023'; end if;
  end loop;

  delete from public.provider_service_areas where provider_id = pid;
  for item in select * from pg_catalog.jsonb_array_elements(coalesce(p_profile->'areas','[]'::jsonb)) loop
    area_radius := coalesce((item->>'radiusKm')::numeric, radius);
    if area_radius not between 1 and 250
      or pg_catalog.length(pg_catalog.btrim(coalesce(item->>'governorate',''))) not between 1 and 100
      or pg_catalog.length(pg_catalog.btrim(coalesce(item->>'district',''))) > 100
    then raise exception 'Invalid service area' using errcode = '22023'; end if;
    insert into public.provider_service_areas(provider_id, governorate, district, latitude, longitude, radius_km)
    values (
      pid, pg_catalog.btrim(item->>'governorate'),
      nullif(pg_catalog.btrim(coalesce(item->>'district','')), ''), null, null, area_radius
    );
  end loop;
  if p_submit and (
    not exists (select 1 from public.provider_services where provider_id = pid and is_active)
    or not exists (select 1 from public.provider_service_areas where provider_id = pid)
  ) then raise exception 'Add a service and work area' using errcode = '22023'; end if;
exception
  when sqlstate '42501' or sqlstate '22023' then raise;
  when others then raise exception 'Unable to save provider profile' using errcode = 'P0001';
end;
$$;

create or replace function public.get_search_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid());
begin
  return pg_catalog.jsonb_build_object(
    'recentSearches', case when v_uid is null then '[]'::jsonb else coalesce((
      select pg_catalog.jsonb_agg(r.query order by r.searched_at desc)
      from (select query, searched_at from public.user_recent_searches
            where user_id = v_uid order by searched_at desc limit 10) r
    ), '[]'::jsonb) end,
    'suggestedCategories', coalesce((
      select pg_catalog.jsonb_agg(entry order by ordinal)
      from (
        select pg_catalog.jsonb_build_object(
          'id', c.id, 'translationKey', c.translation_key, 'iconName', c.icon_name) as entry,
          row_number() over (order by c.demand_rank nulls last, c.sort_order, c.id) as ordinal
        from public.service_categories c
        where c.is_active and c.deleted_at is null
          and exists (select 1 from public.provider_profiles p
            where p.primary_category_id = c.id and private.is_provider_publicly_discoverable(p.id))
        order by c.demand_rank nulls last, c.sort_order, c.id limit 8
      ) categories
    ), '[]'::jsonb),
    'commonServices', coalesce((
      select pg_catalog.jsonb_agg(entry order by ordinal)
      from (
        select pg_catalog.jsonb_build_object(
          'id', s.id, 'name', s.name, 'translationKey', s.translation_key,
          'categoryId', s.category_id, 'providerCount', pg_catalog.count(*)) as entry,
          row_number() over (order by pg_catalog.count(*) desc, s.name) as ordinal
        from public.services s
        join public.provider_services ps on ps.service_id = s.id and ps.is_active
        join public.provider_profiles p on p.id = ps.provider_id
        where s.is_active and s.deleted_at is null
          and private.is_provider_publicly_discoverable(p.id)
        group by s.id, s.name, s.translation_key, s.category_id
        order by pg_catalog.count(*) desc, s.name limit 8
      ) services
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_my_booking_conversations()
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'bookingId', b.id,
    'serviceId', b.service_id,
    'serviceTranslationKey', service.translation_key,
    'serviceName', b.service_name_snapshot,
    'status', b.status,
    'counterpartName', case when b.customer_id = (select auth.uid())
      then provider_profile.display_name else customer_profile.display_name end,
    'lastMessageAt', last_message.created_at,
    'lastMessageKind', last_message.message_type,
    'unreadCount', coalesce(unread.unread_count, 0),
    'writable', private.is_booking_chat_writable(b.id, pg_catalog.now()),
    'writableUntil', completion.completed_at + interval '48 hours'
  )
  from public.bookings b
  join public.provider_profiles provider_profile on provider_profile.id = b.provider_id
  left join public.profiles customer_profile on customer_profile.id = b.customer_id
  left join public.services service on service.id = b.service_id
  left join public.conversations c on c.booking_id = b.id
  left join public.conversation_members cm
    on cm.conversation_id = c.id and cm.user_id = (select auth.uid())
  left join lateral (
    select m.created_at, m.message_type
    from public.messages m
    where m.booking_id = b.id and m.deleted_at is null
    order by m.created_at desc, m.id desc limit 1
  ) last_message on true
  left join lateral (
    select pg_catalog.count(*)::integer as unread_count
    from public.messages m
    where m.booking_id = b.id
      and m.deleted_at is null
      and m.sender_id is distinct from (select auth.uid())
      and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
  ) unread on true
  left join lateral (
    select min(h.created_at) as completed_at
    from public.booking_status_history h
    where h.booking_id = b.id and h.status = 'completed'
  ) completion on true
  where (b.customer_id = (select auth.uid()) or provider_profile.user_id = (select auth.uid()))
    and b.deleted_at is null
    and private.booking_chat_is_activated(b.id)
  order by coalesce(last_message.created_at, b.updated_at, b.created_at) desc
  limit 100
$$;

-- Earnings are booking history too. Keep the immutable snapshot for an
-- unkeyed/deleted service, but give both worker clients the booking's stable
-- service identity so changing the interface language relabels the row.
create or replace function public.get_my_provider_earnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  provider_uuid uuid;
  available_amount bigint;
  cash_debt bigint;
  recovery_debt bigint;
  config private.payment_configuration%rowtype;
  result jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select p.id into provider_uuid
  from public.provider_profiles p
  where p.user_id = uid and p.deleted_at is null;
  if provider_uuid is null then
    raise exception 'Provider profile not found' using errcode = '42501';
  end if;

  available_amount := greatest(
    private.available_earnings_balance(provider_uuid),
    0
  );
  cash_debt := greatest(
    private.financial_debt_balance(
      provider_uuid,
      'provider_cash_commission_debt'
    ),
    0
  );
  recovery_debt := greatest(
    private.financial_debt_balance(
      provider_uuid,
      'provider_recovery_debt'
    ),
    0
  );
  select * into config from private.payment_configuration where id;

  select jsonb_build_object(
    'providerId', provider_uuid,
    'currency', 'EGP',
    'availableMinor', available_amount::text,
    'pendingMinor', coalesce(sum(
      greatest(e.net_minor - e.debt_offset_minor, 0)
    ) filter (
      where e.status in (
        'pending_job_completion',
        'pending_release',
        'held_for_dispute'
      )
    ), 0)::text,
    'paidOutMinor', coalesce((
      select sum(w.amount_minor)
      from public.provider_withdrawal_requests w
      where w.provider_id = provider_uuid and w.status = 'paid'
    ), 0)::text,
    'heldMinor', coalesce(sum(e.held_minor), 0)::text,
    'cashCommissionDueMinor', cash_debt::text,
    'recoverableAdjustmentMinor', recovery_debt::text,
    'cashDebtRestrictionThresholdMinor',
      config.cash_debt_restriction_threshold_minor::text,
    'cashPaymentsRestricted',
      cash_debt > config.cash_debt_restriction_threshold_minor,
    'minimumWithdrawalMinor', config.minimum_withdrawal_minor::text,
    'withdrawalFeeMinor', config.withdrawal_fee_minor::text,
    'withdrawalsEnabled', config.payout_mode = 'mock',
    'releaseDelaySeconds', config.earnings_release_delay_seconds::text,
    'automaticReleaseSchedulerEnabled',
      config.automatic_release_scheduler_enabled,
    'transactions', coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'bookingId', e.booking_id,
      'serviceId', b.service_id,
      'serviceTranslationKey', service.translation_key,
      'service', b.service_name_snapshot,
      'date', e.created_at,
      'grossMinor', e.gross_minor::text,
      'commissionMinor', e.commission_minor::text,
      'netMinor', e.net_minor::text,
      'debtOffsetMinor', e.debt_offset_minor::text,
      'heldMinor', e.held_minor::text,
      'currency', e.currency,
      'status', e.status,
      'releaseEligibleAt', e.release_eligible_at,
      'customerConfirmedAt', e.customer_confirmed_at
    ) order by e.created_at desc) filter (where e.id is not null), '[]'::jsonb)
  ) into result
  from public.provider_earnings_ledger e
  join public.bookings b on b.id = e.booking_id
  left join public.services service on service.id = b.service_id
  where e.provider_id = provider_uuid;
  return result;
end;
$$;

-- Receipts retain their historical string, but the structured response also
-- carries identity for any present or future localized receipt presentation.
create or replace function public.get_my_booking_receipt(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  result jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'transactionReference', p.customer_reference,
    'bookingReference', b.id,
    'serviceId', b.service_id,
    'serviceTranslationKey', service.translation_key,
    'service', b.service_name_snapshot,
    'providerName', provider.display_name,
    'timestamp', p.paid_at,
    'approvedJobPriceMinor', s.provider_gross_minor::text,
    'promotionMinor', s.promotion_minor::text,
    'amountMinor', p.amount_minor::text,
    'currency', p.currency,
    'paymentMethod', p.payment_method,
    'paymentStatus', p.status,
    'refundedMinor', p.refunded_minor::text
  ) into result
  from public.financial_booking_payments p
  join public.booking_price_snapshots s on s.id = p.price_snapshot_id
  join public.bookings b on b.id = p.booking_id
  left join public.services service on service.id = b.service_id
  join public.provider_profiles provider on provider.id = p.provider_id
  where p.booking_id = p_booking_id
    and p.customer_id = uid
    and p.status in ('paid', 'partially_refunded', 'refunded');
  return result;
end;
$$;

-- Replacing a function preserves its grants, but keep the intended surface
-- explicit for local resets and drift review.
revoke all on function public.get_my_worker_profile() from public, anon;
grant execute on function public.get_my_worker_profile() to authenticated;
revoke all on function public.save_provider_foundation(jsonb, boolean) from public, anon;
grant execute on function public.save_provider_foundation(jsonb, boolean) to authenticated;
revoke all on function public.get_search_suggestions() from public, anon, authenticated;
grant execute on function public.get_search_suggestions() to anon, authenticated;
revoke all on function public.get_my_booking_conversations() from public, anon;
grant execute on function public.get_my_booking_conversations() to authenticated;
revoke all on function public.get_my_provider_earnings() from public, anon;
grant execute on function public.get_my_provider_earnings() to authenticated;
revoke all on function public.get_my_booking_receipt(uuid) from public, anon;
grant execute on function public.get_my_booking_receipt(uuid) to authenticated;
