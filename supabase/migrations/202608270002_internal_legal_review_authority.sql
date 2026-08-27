-- GIVE THE INTERNAL APPROVALS A BUTTON, SO "PENDING" MEANS SOMETHING
--
-- WPS-024 registered the processing activities, the subprocessors and the AI
-- use declarations, and gave `legal_review_status` and `agreement_status` their
-- honest starting values. It never built a way to change them. Every one of
-- those states has therefore said `pending` or `not_started` since the day it
-- was seeded, not because a review is outstanding but because there is no
-- governed action that could record one having finished.
--
-- That is the worst kind of gate. A reader cannot tell an unfinished review
-- from a missing mechanism, and a console that blocks on it is blocking on
-- nothing anybody can clear. This migration adds the two decisions that were
-- missing, and no others:
--
--   * `staff_record_processing_basis_review` — the INTERNAL decision that a
--     processing activity's lawful basis has been reviewed. Warsha's own
--     review, recorded by Warsha's own staff.
--   * `staff_record_subprocessor_agreement` — what contract actually governs a
--     supplier, and the reference that evidences it.
--
-- Both are governed by `private.consume_dual_control`, so they inherit the one
-- environment policy from `private.required_approval_count` exactly as provider
-- activation does: one authorised administrator in local and development, two
-- distinct identities in staging and production. Neither publishes legal text,
-- neither moves a subprocessor into use, and neither records an acceptance.
--
-- A note on `agreement_status`. The four existing values assume a supplier
-- agreement is a document somebody signs. Several are not: a major cloud
-- supplier's data processing terms are commonly incorporated by reference into
-- the service terms accepted when the account is opened, with nothing to sign
-- and nothing to countersign. Forcing that situation into `signed` records a
-- signature that does not exist; leaving it at `not_started` records an absence
-- that is also untrue. `incorporated` is added so the register can say the
-- thing that is actually the case, and `agreement_reference` is required with
-- it so the claim names what incorporates it rather than asserting it bare.

-- ---------------------------------------------------------------------------
-- 1. THE REGISTER CAN NAME ITS EVIDENCE
-- ---------------------------------------------------------------------------

alter table private.subprocessors
  add column if not exists agreement_reference text;

alter table private.subprocessors
  add column if not exists agreement_recorded_at timestamptz;

alter table private.subprocessors
  add column if not exists agreement_recorded_by uuid references public.profiles(id);

alter table private.subprocessors
  drop constraint if exists subprocessors_agreement_status_check;
alter table private.subprocessors
  drop constraint if exists subprocessors_agreement_status_check1;

do $$
declare
  v_name text;
begin
  -- The original check was created inline and carries a generated name that
  -- differs between a fresh reset and the hosted project. Find it by the
  -- column it constrains rather than by guessing what Postgres called it.
  for v_name in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'private'
      and t.relname = 'subprocessors'
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%agreement_status%'
  loop
    execute pg_catalog.format(
      'alter table private.subprocessors drop constraint %I', v_name);
  end loop;
end $$;

alter table private.subprocessors
  add constraint subprocessors_agreement_status_check
  check (agreement_status in
    ('signed', 'incorporated', 'pending', 'not_required', 'not_started'));

-- A claim that a contract is in force has to say which one. `signed` and
-- `incorporated` are both assertions about an external agreement, and an
-- assertion about an external agreement with nothing behind it is exactly the
-- fabrication this register exists to prevent.
alter table private.subprocessors
  drop constraint if exists subprocessors_agreement_reference_check;
alter table private.subprocessors
  add constraint subprocessors_agreement_reference_check
  check (
    agreement_status not in ('signed', 'incorporated')
    or (agreement_reference is not null
        and pg_catalog.length(pg_catalog.btrim(agreement_reference)) between 10 and 500));

comment on column private.subprocessors.agreement_status is
  'signed = a document was executed. incorporated = terms are in force by '
  'incorporation into accepted supplier terms, with nothing separate to sign. '
  'Both require agreement_reference to name what evidences them.';

-- The same for the processing register: an approved basis records who approved
-- it and when, so `approved` is a decision somebody made rather than a value
-- somebody typed.
alter table private.processing_activities
  add column if not exists legal_review_note text;

alter table private.processing_activities
  add column if not exists legal_reviewed_at timestamptz;

alter table private.processing_activities
  add column if not exists legal_reviewed_by uuid references public.profiles(id);

-- ---------------------------------------------------------------------------
-- 2. THE INTERNAL REVIEW DECISION
-- ---------------------------------------------------------------------------

create or replace function public.staff_record_processing_basis_review(
  p_activity_key text,
  p_status text,
  p_basis text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('review_legal_governance');
  v_activity private.processing_activities%rowtype;
  v_environment text := private.platform_environment();
  v_required integer;
  v_mode text;
  v_subject text;
  v_consumed boolean;
  v_basis text;
begin
  if p_status not in ('pending', 'in_review', 'approved', 'rejected') then
    raise exception 'Unknown legal review status' using errcode = '22023';
  end if;
  -- The note is the record. A review whose outcome is stated without a reason
  -- is indistinguishable from a value somebody set to clear a screen.
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_note, ''))) not between 10 and 2000 then
    raise exception 'A review note is required' using errcode = '22023';
  end if;

  select * into v_activity
  from private.processing_activities a
  where a.activity_key = p_activity_key
  for update;
  if v_activity.activity_key is null then
    raise exception 'Unknown processing activity' using errcode = '22023';
  end if;

  v_basis := pg_catalog.btrim(coalesce(p_basis, ''));
  if v_basis = '' then
    v_basis := v_activity.proposed_basis;
  end if;
  if pg_catalog.length(v_basis) not between 10 and 1000 then
    raise exception 'A lawful basis is required' using errcode = '22023';
  end if;

  v_required := private.required_approval_count(v_environment, 'record_processing_basis_review');
  v_mode := private.governance_mode(v_environment, 'record_processing_basis_review');

  -- Only a decision that unlocks processing is governed. Recording that a
  -- review is under way, or that it failed, is a restriction or a neutral
  -- statement and must stay immediately available — the same asymmetry the
  -- subprocessor sync already applies to promotion versus demotion.
  if p_status = 'approved' and v_activity.legal_review_status <> 'approved' then
    v_subject := p_activity_key || ':' || v_environment || ':approved';
    v_consumed := private.consume_dual_control(
      'review_legal_governance', 'record_processing_basis_review', v_subject,
      pg_catalog.btrim(p_note));
    if not v_consumed then
      raise exception 'Approving a lawful basis requires a governed authorisation'
        using errcode = '42501';
    end if;
  end if;

  update private.processing_activities
  set legal_review_status = p_status,
      proposed_basis = v_basis,
      legal_review_note = pg_catalog.btrim(p_note),
      legal_reviewed_at = pg_catalog.now(),
      legal_reviewed_by = v_actor
  where activity_key = p_activity_key;

  perform private.record_staff_audit(
    v_actor, 'review_legal_governance', 'processing_basis_reviewed',
    'processing_activity', null, pg_catalog.btrim(p_note),
    pg_catalog.jsonb_build_object(
      'activityKey', p_activity_key,
      'environment', v_environment,
      'fromStatus', v_activity.legal_review_status,
      'toStatus', p_status,
      'governanceMode', v_mode,
      'requiredApprovals', v_required));

  return pg_catalog.jsonb_build_object(
    'activityKey', p_activity_key,
    'reviewStatus', p_status,
    'basis', v_basis,
    'governanceMode', v_mode,
    'requiredApprovals', v_required);
end;
$$;

comment on function public.staff_record_processing_basis_review(text, text, text, text) is
  'Records Warsha''s own review of a processing activity''s lawful basis. An '
  'internal decision only: it publishes nothing, tells nobody, and makes no '
  'claim about any external agreement.';

revoke all on function public.staff_record_processing_basis_review(text, text, text, text)
  from public, anon;
grant execute on function public.staff_record_processing_basis_review(text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. WHAT CONTRACT GOVERNS A SUPPLIER
-- ---------------------------------------------------------------------------

create or replace function public.staff_record_subprocessor_agreement(
  p_subprocessor_key text,
  p_status text,
  p_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_capability('manage_subprocessors');
  v_row private.subprocessors%rowtype;
  v_environment text := private.platform_environment();
  v_required integer;
  v_mode text;
  v_subject text;
  v_consumed boolean;
  v_reference text := pg_catalog.btrim(coalesce(p_reference, ''));
begin
  if p_status not in ('signed', 'incorporated', 'pending', 'not_required', 'not_started') then
    raise exception 'Unknown agreement status' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  -- Enforced here as well as in the table so the refusal is a sentence an
  -- operator reads, not a constraint violation they have to decode.
  if p_status in ('signed', 'incorporated')
     and pg_catalog.length(v_reference) not between 10 and 500 then
    raise exception 'An agreement reference is required to record a contract in force'
      using errcode = '22023';
  end if;

  select * into v_row
  from private.subprocessors s
  where s.subprocessor_key = p_subprocessor_key
  for update;
  if v_row.subprocessor_key is null then
    raise exception 'Unknown subprocessor' using errcode = '22023';
  end if;

  v_required := private.required_approval_count(v_environment, 'record_subprocessor_agreement');
  v_mode := private.governance_mode(v_environment, 'record_subprocessor_agreement');

  if p_status in ('signed', 'incorporated')
     and v_row.agreement_status not in ('signed', 'incorporated') then
    v_subject := p_subprocessor_key || ':' || v_environment || ':' || p_status;
    v_consumed := private.consume_dual_control(
      'manage_subprocessors', 'record_subprocessor_agreement', v_subject,
      pg_catalog.btrim(p_reason));
    if not v_consumed then
      raise exception 'Recording a supplier agreement requires a governed authorisation'
        using errcode = '42501';
    end if;
  end if;

  update private.subprocessors
  set agreement_status = p_status,
      agreement_reference = nullif(v_reference, ''),
      agreement_recorded_at = pg_catalog.now(),
      agreement_recorded_by = v_actor
  where subprocessor_key = p_subprocessor_key;

  perform private.record_staff_audit(
    v_actor, 'manage_subprocessors', 'subprocessor_agreement_recorded',
    'subprocessor', null, pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'subprocessorKey', p_subprocessor_key,
      'environment', v_environment,
      'fromStatus', v_row.agreement_status,
      'toStatus', p_status,
      'governanceMode', v_mode,
      'requiredApprovals', v_required));

  return pg_catalog.jsonb_build_object(
    'subprocessorKey', p_subprocessor_key,
    'agreementStatus', p_status,
    'governanceMode', v_mode,
    'requiredApprovals', v_required);
end;
$$;

comment on function public.staff_record_subprocessor_agreement(text, text, text, text) is
  'Records which contract governs a supplier and what evidences it. Records no '
  'signature that does not exist: signed and incorporated both require a '
  'reference. Does not move the supplier into use.';

revoke all on function public.staff_record_subprocessor_agreement(text, text, text, text)
  from public, anon;
grant execute on function public.staff_record_subprocessor_agreement(text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE OVERVIEW SHOWS THE EVIDENCE, NOT JUST THE VERDICT
-- ---------------------------------------------------------------------------

create or replace function public.staff_legal_governance_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := private.require_staff_capability('review_legal_governance');
begin
  return pg_catalog.jsonb_build_object(
    'documents', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'documentKey', d.document_key,
        'category', d.category,
        'audience', d.audience,
        'requiresAcceptance', d.requires_acceptance,
        'version', v.version,
        'changeClass', v.change_class,
        'effectiveAt', v.effective_at,
        'versionCount', (select pg_catalog.count(*) from public.legal_document_versions x
                         where x.document_key = d.document_key),
        'accepted', (select pg_catalog.count(*) from public.legal_acceptances a
                     where a.document_key = d.document_key and a.version = v.version
                       and a.decision = 'accepted'),
        'declined', (select pg_catalog.count(*) from public.legal_acceptances a
                     where a.document_key = d.document_key and a.version = v.version
                       and a.decision = 'declined')
      ) order by d.sort_order), '[]'::jsonb)
      from public.legal_documents d
      join lateral (select * from private.legal_current_version(d.document_key)) v on true
      where d.active),
    'subprocessors', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', s.subprocessor_key, 'name', s.display_name,
        'status', s.integration_status, 'trainingProhibited', s.training_prohibited,
        'agreementStatus', s.agreement_status,
        'agreementReference', s.agreement_reference,
        'agreementRecordedAt', s.agreement_recorded_at) order by s.subprocessor_key), '[]'::jsonb)
      from private.subprocessors s),
    'processingActivities', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', p.activity_key, 'name', p.display_name,
        'reviewStatus', p.legal_review_status,
        'basis', p.proposed_basis,
        'reviewedAt', p.legal_reviewed_at) order by p.activity_key), '[]'::jsonb)
      from private.processing_activities p),
    'aiUses', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', a.use_key, 'name', a.display_name, 'status', a.status,
        'coversIdentityData', a.covers_identity_data,
        'permittedForTraining', a.permitted_for_training) order by a.use_key), '[]'::jsonb)
      from private.ai_use_declarations a),
    'configuration', pg_catalog.jsonb_build_object(
      'legalCentreEnabled', (select c.legal_centre_enabled from private.legal_configuration c where c.singleton),
      'reconsentEnforced', (select c.reconsent_enforced from private.legal_configuration c where c.singleton),
      'graceDays', (select c.reconsent_grace_days from private.legal_configuration c where c.singleton)),
    'environment', private.platform_environment(),
    'requiredApprovals', private.required_approval_count(private.platform_environment(), null),
    'governanceMode', private.governance_mode(private.platform_environment(), null),
    'actor', v_actor
  );
end;
$$;

comment on function public.staff_legal_governance_overview() is
  'WPS-024 governance overview. Counts and states only; no reviewer learns who declined.';
