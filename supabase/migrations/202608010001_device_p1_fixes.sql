-- Device P1 fixes: make local address conflicts inferable and import supported
-- device data in one authenticated, idempotent database transaction.

drop index if exists public.addresses_customer_local_source_unique;
create unique index addresses_customer_local_source_unique
on public.addresses(customer_id, local_source_id);

create or replace function public.import_local_customer_data(
  p_expected_user_id uuid,
  p_addresses jsonb,
  p_favourite_provider_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  address_count integer := 0;
  favourite_count integer := 0;
  requested_favourite_count integer := 0;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_expected_user_id is null or p_expected_user_id <> uid then
    raise exception 'Migration account changed' using errcode = '42501';
  end if;
  if p_addresses is null or pg_catalog.jsonb_typeof(p_addresses) <> 'array'
     or pg_catalog.jsonb_array_length(p_addresses) > 100
     or coalesce(pg_catalog.cardinality(p_favourite_provider_ids), 0) > 100 then
    raise exception 'Invalid migration payload' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_addresses) item
    where pg_catalog.jsonb_typeof(item) is distinct from 'object'
       or pg_catalog.jsonb_typeof(item->'local_source_id') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(item->>'local_source_id')) not between 1 and 120
       or pg_catalog.jsonb_typeof(item->'label') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(item->>'label')) not between 1 and 120
       or pg_catalog.jsonb_typeof(item->'address_line') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(item->>'address_line')) not between 1 and 500
       or pg_catalog.jsonb_typeof(item->'governorate') is distinct from 'string'
       or pg_catalog.length(pg_catalog.btrim(item->>'governorate')) not between 1 and 120
       or not coalesce((
         pg_catalog.jsonb_typeof(item->'district') = 'string'
         or pg_catalog.jsonb_typeof(item->'district') = 'null'
       ), false)
       or pg_catalog.length(coalesce(item->>'district', '')) > 120
       or pg_catalog.jsonb_typeof(item->'is_default') is distinct from 'boolean'
  ) then
    raise exception 'Invalid migration payload' using errcode = '22023';
  end if;

  perform public.ensure_customer_profile();

  insert into public.addresses(
    customer_id, local_source_id, label, address_line, governorate,
    district, is_default, deleted_at
  )
  select
    uid,
    pg_catalog.btrim(item->>'local_source_id'),
    pg_catalog.btrim(item->>'label'),
    pg_catalog.btrim(item->>'address_line'),
    pg_catalog.btrim(item->>'governorate'),
    nullif(pg_catalog.btrim(item->>'district'), ''),
    (item->>'is_default')::boolean,
    null
  from (
    select distinct on (value->>'local_source_id') value as item
    from pg_catalog.jsonb_array_elements(p_addresses)
    order by value->>'local_source_id'
  ) normalized
  on conflict(customer_id, local_source_id) do update
  set label = excluded.label,
      address_line = excluded.address_line,
      governorate = excluded.governorate,
      district = excluded.district,
      is_default = excluded.is_default,
      deleted_at = null,
      updated_at = pg_catalog.now();

  select pg_catalog.count(*)::integer into address_count
  from (
    select distinct value->>'local_source_id'
    from pg_catalog.jsonb_array_elements(p_addresses)
  ) imported_addresses;

  with requested as (
    select distinct provider_id
    from pg_catalog.unnest(coalesce(p_favourite_provider_ids, '{}'::uuid[])) provider_id
  )
  insert into public.favourites(customer_id, provider_id)
  select uid, requested.provider_id
  from requested
  where private.is_provider_publicly_discoverable(requested.provider_id)
  on conflict(customer_id, provider_id) do nothing;

  select pg_catalog.count(*)::integer into requested_favourite_count
  from (
    select distinct provider_id
    from pg_catalog.unnest(coalesce(p_favourite_provider_ids, '{}'::uuid[])) provider_id
  ) requested;

  select pg_catalog.count(*)::integer into favourite_count
  from (
    select distinct provider_id
    from pg_catalog.unnest(coalesce(p_favourite_provider_ids, '{}'::uuid[])) provider_id
  ) requested
  where private.is_provider_publicly_discoverable(requested.provider_id)
    and exists (
      select 1 from public.favourites favourite
      where favourite.customer_id = uid
        and favourite.provider_id = requested.provider_id
    );

  return pg_catalog.jsonb_build_object(
    'address_count', address_count,
    'favourite_count', favourite_count,
    'skipped_favourite_count', requested_favourite_count - favourite_count
  );
end;
$$;

revoke all on function public.import_local_customer_data(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.import_local_customer_data(uuid, jsonb, uuid[]) to authenticated;
