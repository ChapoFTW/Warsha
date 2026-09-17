-- The collection window closes early when everybody invited has answered.
--
-- WPS-008, as locked on 2026-07-31:
--
--   "The customer cannot select during the initial two-minute collection
--    fairness window. The window remains server-configurable.
--    The window may close early when every currently invited worker has
--    quoted, declined, withdrawn, expired, or become ineligible."
--
-- The first half was built: `collection_not_before` is set at creation and
-- `select_worker_quote` refuses until it passes. The second half never was.
-- WES-008 lists "collection window and early close" among its required tests,
-- and no test and no code did it. So a Customer whose invited Professionals had
-- all answered in thirty seconds still waited the full two minutes, looking at
-- quotes they could not choose, for answers that could no longer arrive.
--
-- The window's end is `collection_not_before`, and both the server gate and
-- both clients read it. So closing the window early means moving that one
-- value to now, the moment the last open invitation for the request is
-- answered. Nothing else has to learn a second rule.
--
-- "Currently invited" is literal. A later wave adds invitations to a window
-- that is already closed, and does not reopen it: the fairness the window
-- protects is between the Professionals who were invited together.
--
-- Emergency has no quote window and is untouched. A request that has already
-- left collection — cancelled, expired, selected — is untouched, so expiring
-- or cancelling a request, which closes its invitations, cannot rewrite it.

create or replace function private.close_quote_window_when_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('invited', 'viewed') then
    return null;
  end if;

  update public.marketplace_requests r
  set collection_not_before = greatest(r.created_at, pg_catalog.now()),
      -- The same transition `submit_worker_quote` makes when a quote arrives
      -- after the window: a Customer with quotes in hand is reviewing them.
      status = case
        when r.status = 'collecting_quotes' and exists (
          select 1 from public.worker_quotes q
          where q.request_id = r.id and q.status in ('submitted', 'revised'))
        then 'customer_reviewing'
        else r.status
      end
  where r.id = new.request_id
    and r.flow_kind <> 'emergency'
    and r.status in ('matching', 'collecting_quotes', 'customer_reviewing')
    and r.collection_not_before > pg_catalog.now()
    and not exists (
      select 1 from public.quote_invitations i
      where i.request_id = r.id and i.status in ('invited', 'viewed'));

  return null;
end;
$$;

revoke all on function private.close_quote_window_when_answered() from public, anon, authenticated;

create trigger quote_invitations_close_window_when_answered
  after update of status on public.quote_invitations
  for each row
  when (old.status is distinct from new.status)
  execute function private.close_quote_window_when_answered();
