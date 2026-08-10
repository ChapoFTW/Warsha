-- Worker signup legal preflight
--
-- The acceptance writer refuses evidence that does not name the currently
-- published version and hash, and it is right to. But GoTrue replaces any
-- trigger exception with "Database error creating new user" before the broker
-- sees it, so a stale app bundle and a genuine outage arrived at the worker
-- registration screen as the same 503. One of those is fixed by updating the
-- app and the other by waiting; telling somebody to wait forever is the bug.
--
-- This adds a read-only preflight the trusted broker can call BEFORE creating
-- the account, so it can name that condition. It grants nothing new to
-- clients, publishes no text, and is not an authority: the append-only writer
-- still validates every acceptance inside the account-creation transaction.
-- The pgTAP suite asserts the two agree.

create or replace function public.signup_legal_manifest_current(
  p_account_role text,
  p_manifest jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_account_role in ('customer', 'worker')
    and p_manifest is not null
    and pg_catalog.jsonb_typeof(p_manifest) = 'array'
    -- Every required document is named exactly once, at the published
    -- version, with the hash of the language actually displayed.
    and (
      select pg_catalog.count(*)
      from public.legal_documents d
      join lateral (select * from private.legal_current_version(d.document_key)) v on true
      where d.active and d.requires_acceptance
        and (d.audience = 'all' or d.audience = p_account_role)
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_manifest) item
          where item ->> 'documentKey' = d.document_key
            and item ->> 'version' = v.version
            and coalesce(item ->> 'language', '') in ('en', 'ar')
            and item ->> 'renderedHash' = case when item ->> 'language' = 'ar'
              then v.content_hash_ar else v.content_hash_en end
        )
    ) = (
      select pg_catalog.count(*)
      from public.legal_documents d
      where d.active and d.requires_acceptance
        and (d.audience = 'all' or d.audience = p_account_role)
    )
    -- and nothing else is smuggled in beside them.
    and pg_catalog.jsonb_array_length(p_manifest) = (
      select pg_catalog.count(*)
      from public.legal_documents d
      where d.active and d.requires_acceptance
        and (d.audience = 'all' or d.audience = p_account_role)
    )
    and (
      select pg_catalog.count(distinct item ->> 'documentKey')
      from pg_catalog.jsonb_array_elements(p_manifest) item
    ) = pg_catalog.jsonb_array_length(p_manifest)
$$;

comment on function public.signup_legal_manifest_current(text, jsonb) is
  'Read-only preflight so the trusted worker broker can distinguish a stale app bundle from a server failure. The append-only acceptance writer remains authoritative.';

revoke all on function public.signup_legal_manifest_current(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.signup_legal_manifest_current(text, jsonb) to service_role;
