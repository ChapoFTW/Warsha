'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge, Empty, Identifier, Timestamp } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import { ReauthDialog } from '@/components/reauth-dialog';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import {
  ACTIVATION_ACTION_KEY, ACTIVATION_CAPABILITY, ACTIVATION_STEPS, activationRequest,
  activationSteps, activationSubject, currentStep, MAPS_FEATURE_FLAG, MAPS_PROVIDER_KEY,
  parseDualControlQueue, parseProviderRegistry,
  type ActivationStepKey, type DualControlRequest, type ProviderEntry, type StepState,
} from '@/lib/providers';
import { isReauthRefusal } from '@/lib/reauth';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/governed-actions.module.css';
import table from '@/components/console-table.module.css';
import page from './page.module.css';

/**
 * Activating an external provider, without an operator having to know that any
 * of it is RPCs, flags and dual-control rows.
 *
 * The order on screen is the database's order, not a friendlier one. The
 * feature is switched on *after* the provider is activated because
 * `staff_activate_external_provider` refuses while the flag is already enabled;
 * doing it the intuitive way round does not shortcut the process, it blocks it.
 *
 * Nothing here can approve its own request. That refusal lives in a table
 * constraint and in `staff_approve_dual_control`, and this page does not get a
 * say — it only declines to offer a button that would be refused anyway.
 *
 * No credential value, digest, or environment-variable name is displayed. The
 * page asks the proxy whether a credential is configured and shows that one
 * boolean as words.
 */

type Health = { searched: boolean; reverseGeocoded: boolean; note: string | null };

export default function ProvidersPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const { session } = useStaff();

  const mayView = hasCapability(session, 'review_legal_governance');
  const mayActivate = hasCapability(session, ACTIVATION_CAPABILITY);
  const mayManageFlags = hasCapability(session, 'manage_feature_flags');

  const [provider, setProvider] = useState<ProviderEntry | null>(null);
  const [requests, setRequests] = useState<DualControlRequest[]>([]);
  const [credentialConfigured, setCredentialConfigured] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askReauth, setAskReauth] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [showTechnical, setShowTechnical] = useState(false);

  const environment = session.environment ?? null;

  const load = useCallback(async () => {
    if (!mayView) return;
    setBusy('load');
    setError(null);
    const client = supabase();

    const registry = await client.rpc('staff_provider_registry');
    if (registry.error) {
      if (isReauthRefusal(registry.error)) setAskReauth(true);
      else setError(registry.error.message);
    } else {
      const entries = parseProviderRegistry(registry.data);
      setProvider(entries.find((item) => item.providerKey === MAPS_PROVIDER_KEY) ?? null);
    }

    const queue = await client.rpc('staff_dual_control_queue');
    if (!queue.error) setRequests(parseDualControlQueue(queue.data));

    const flags = await client.rpc('get_staff_feature_flags');
    if (!flags.error && Array.isArray(flags.data)) {
      const match = (flags.data as Record<string, unknown>[]).find((row) =>
        row.flag_key === MAPS_FEATURE_FLAG && row.environment === environment);
      setFeatureEnabled(match?.enabled === true);
    }

    // Capability metadata only. The proxy answers whether a credential is
    // present; it has no path that could answer what it is.
    const descriptor = await client.functions.invoke('location-proxy', {
      body: { operation: 'render_descriptor' },
    });
    const value = descriptor.data as { descriptor?: { serverCredentialAvailable?: boolean } } | null;
    setCredentialConfigured(value?.descriptor?.serverCredentialAvailable === true);

    setBusy(null);
  }, [mayView, environment]);

  useEffect(() => { void load(); }, [load]);

  const request = activationRequest(requests, MAPS_PROVIDER_KEY, environment ?? '');
  const states = activationSteps({
    environment,
    credentialConfigured,
    provider,
    request,
    featureEnabled,
    healthVerified: Boolean(health?.searched && health?.reverseGeocoded),
    mayActivate,
    mayManageFlags,
  });
  const next = currentStep(states);

  const run = async (key: string, action: () => Promise<{ error: unknown } | void>) => {
    setBusy(key);
    setError(null);
    const result = await action();
    const failure = result && 'error' in result ? result.error : null;
    if (failure) {
      if (isReauthRefusal(failure)) setAskReauth(true);
      else setError((failure as { message?: string }).message ?? words.providerActionFailed);
    } else {
      await load();
    }
    setBusy(null);
  };

  const requestApproval = () => run('request', async () =>
    supabase().rpc('staff_request_dual_control', {
      p_capability_key: ACTIVATION_CAPABILITY,
      p_action_key: ACTIVATION_ACTION_KEY,
      p_subject_ref: activationSubject(MAPS_PROVIDER_KEY, environment ?? ''),
      p_reason: reason.trim(),
    }));

  const approve = (id: string) => run('approve', async () =>
    supabase().rpc('staff_approve_dual_control', {
      p_request_id: id,
      p_approval_note: note.trim(),
    }));

  const activate = () => run('activate', async () =>
    supabase().rpc('staff_activate_external_provider', {
      p_provider_key: MAPS_PROVIDER_KEY,
      p_expected_environment: environment,
      p_reason: reason.trim() || words.providerActivateDefaultReason,
    }));

  const enableFeature = () => run('feature', async () =>
    supabase().rpc('staff_set_feature_flag', {
      p_flag_key: MAPS_FEATURE_FLAG,
      p_environment: environment,
      p_enabled: true,
      p_audience: 'all',
      p_rollout_percentage: 100,
      p_reason: reason.trim() || words.providerFeatureDefaultReason,
    }));

  // Two calls, both harmless reads at the provider, both billed once. Nothing
  // is written and no destructive operation exists on this path.
  const runHealth = async () => {
    setBusy('health');
    setError(null);
    const client = supabase();
    const token = `warsha-health-${Date.now()}`;
    const search = await client.functions.invoke('location-proxy', {
      body: { operation: 'autocomplete', input: 'Tahrir', sessionToken: token, language: 'en' },
    });
    const reverse = await client.functions.invoke('location-proxy', {
      body: { operation: 'reverse_geocode', latitude: 30.0444, longitude: 31.2357, language: 'en' },
    });
    const searchOk = Array.isArray((search.data as { suggestions?: unknown[] } | null)?.suggestions);
    const reverseOk = (reverse.data as { available?: boolean } | null)?.available === true;
    setHealth({
      searched: searchOk && !search.error,
      reverseGeocoded: reverseOk && !reverse.error,
      note: search.error || reverse.error ? words.providerHealthFailed : null,
    });
    setBusy(null);
  };

  const tone = (state: StepState) => state === 'done' ? 'plain' : 'strong';
  const stateWord = (state: StepState) => state === 'done' ? words.providerStepDone
    : state === 'ready' ? words.providerStepReady
      : state === 'waiting' ? words.providerStepWaiting
        : words.providerStepBlocked;

  if (!mayView) {
    return (
      <ConsoleShell title={words.providersTitle}>
        <p className={table.error}>{words.providersNoCapability}</p>
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell title={words.providersTitle}>
      <p className={table.lead}>{words.providersLead}</p>

      {askReauth ? (
        <ReauthDialog
          capability={ACTIVATION_CAPABILITY}
          onClose={() => setAskReauth(false)}
          onSuccess={() => { setAskReauth(false); void load(); }}
        />
      ) : null}

      {error ? <p className={table.error} role="alert">{error}</p> : null}

      {/* --- What this provider is ----------------------------------------- */}
      <section className={styles.block} aria-labelledby="provider">
        <h2 id="provider" className={styles.title}>{words.providerMapsName}</h2>
        <p className={styles.lead}>{words.providerMapsPurpose}</p>

        <dl className={page.facts}>
          <div>
            <dt>{words.providerEnvironment}</dt>
            <dd>{environment === 'development' ? words.platformEnvDevelopment : environment ?? '—'}</dd>
          </div>
          <div>
            <dt>{words.providerCredential}</dt>
            <dd>
              <Badge tone={credentialConfigured ? 'plain' : 'strong'}>
                {credentialConfigured ? words.providerCredentialSet : words.providerCredentialMissing}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>{words.providerStatus}</dt>
            <dd>
              <Badge tone={provider?.status === 'active' ? 'plain' : 'strong'}>
                {provider?.status === 'active' ? words.providerStatusActive
                  : words.providerStatusAwaiting}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>{words.providerFeature}</dt>
            <dd>{featureEnabled ? words.providerFeatureOn : words.providerFeatureOff}</dd>
          </div>
          <div>
            <dt>{words.providerKillSwitch}</dt>
            <dd>{provider?.killSwitch ? words.providerKillSwitchReady : '—'}</dd>
          </div>
        </dl>
      </section>

      {/* --- The sequence --------------------------------------------------- */}
      <section className={styles.block} aria-labelledby="sequence">
        <h2 id="sequence" className={styles.title}>{words.providerSequenceTitle}</h2>
        <p className={styles.lead}>{words.providerSequenceLead}</p>
        <ol className={page.steps}>
          {ACTIVATION_STEPS.map((key: ActivationStepKey, index) => (
            <li key={key} className={key === next ? page.stepCurrent : page.step}>
              <span className={page.stepIndex}>{index + 1}</span>
              <span className={page.stepBody}>
                <strong>{words[`providerStep_${key}`]}</strong>
                <span className={styles.hint}>{words[`providerStepWhy_${key}`]}</span>
              </span>
              <Badge tone={tone(states[key])}>{stateWord(states[key])}</Badge>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Approval ------------------------------------------------------- */}
      <section className={styles.block} aria-labelledby="approval">
        <h2 id="approval" className={styles.title}>{words.providerApprovalTitle}</h2>
        <p className={styles.lead}>{words.providerApprovalWhy}</p>

        {request ? (
          <div className={styles.impact}>
            <dl className={page.facts}>
              <div><dt>{words.providerApprovalRequestedBy}</dt><dd>{request.requestedByName}</dd></div>
              <div><dt>{words.providerApprovalRequestedAt}</dt>
                <dd><Timestamp value={request.requestedAt} locale={locale} /></dd></div>
              <div><dt>{words.providerApprovalExpires}</dt>
                <dd><Timestamp value={request.expiresAt} locale={locale} /></dd></div>
              <div><dt>{words.providerApprovalState}</dt>
                <dd>
                  <Badge tone={request.approvedAt ? 'plain' : 'strong'}>
                    {request.approvedAt ? words.providerApprovalApproved : words.providerApprovalPending}
                  </Badge>
                </dd></div>
              {request.approvedByName ? (
                <div><dt>{words.providerApprovalApprovedBy}</dt><dd>{request.approvedByName}</dd></div>
              ) : null}
            </dl>
            <p className={styles.hint}>{words.providerApprovalReason}: {request.reason}</p>

            {request.requestedByMe && !request.approvedAt ? (
              <p className={styles.hint} role="status">{words.providerApprovalNotYours}</p>
            ) : null}

            {request.canApprove ? (
              <div className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="note">{words.providerApprovalNote}</label>
                  <textarea id="note" className={styles.textarea} value={note}
                    onChange={(event) => setNote(event.target.value)} />
                  <p className={styles.hint}>{words.providerApprovalNoteHint}</p>
                </div>
                <div className={styles.actions}>
                  <button type="button" className={styles.submit}
                    disabled={busy !== null || note.trim().length < 3}
                    onClick={() => approve(request.id)}>
                    {busy === 'approve' ? words.loading : words.providerApproveAction}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : states.approvalRequested === 'ready' ? (
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reason">{words.providerReason}</label>
              <textarea id="reason" className={styles.textarea} value={reason}
                onChange={(event) => setReason(event.target.value)} />
              <p className={styles.hint}>{words.providerReasonHint}</p>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.submit}
                disabled={busy !== null || reason.trim().length < 10}
                onClick={requestApproval}>
                {busy === 'request' ? words.loading : words.providerRequestAction}
              </button>
            </div>
          </div>
        ) : (
          <Empty>{words.providerApprovalUnavailable}</Empty>
        )}
      </section>

      {/* --- Activation and switch-on --------------------------------------- */}
      <section className={styles.block} aria-labelledby="actions">
        <h2 id="actions" className={styles.title}>{words.providerActionsTitle}</h2>

        <GovernedAction
          words={words}
          title={words.providerActivateTitle}
          body={words.providerActivateBody}
          capability={words.capability_manage_subprocessors}
          mutates
          freshAuth
          secondPerson
          irreversible
          audit="external_provider_activated"
          enabled={states.activate === 'ready' && busy === null}
          label={busy === 'activate' ? words.loading : words.providerActivateAction}
          onRun={activate}
        />

        <GovernedAction
          words={words}
          title={words.providerFeatureTitle}
          body={words.providerFeatureBody}
          capability={words.capability_manage_feature_flags}
          mutates
          freshAuth={false}
          secondPerson={false}
          irreversible={false}
          audit="feature_flag_changed"
          enabled={states.feature === 'ready' && busy === null}
          label={busy === 'feature' ? words.loading : words.providerFeatureAction}
          onRun={enableFeature}
        />

        <GovernedAction
          words={words}
          title={words.providerHealthTitle}
          body={words.providerHealthBody}
          capability={words.capability_review_legal_governance}
          mutates={false}
          freshAuth={false}
          secondPerson={false}
          irreversible={false}
          audit="provider_health_observed"
          enabled={states.health === 'ready' && busy === null}
          label={busy === 'health' ? words.loading : words.providerHealthAction}
          onRun={runHealth}
        />

        {health ? (
          <div className={styles.impact} role="status">
            <strong>{words.providerHealthResult}</strong>
            <ul className={styles.impactList}>
              <li>{words.providerHealthSearch}: {health.searched ? words.consoleYes : words.consoleNo}</li>
              <li>{words.providerHealthReverse}: {health.reverseGeocoded ? words.consoleYes : words.consoleNo}</li>
            </ul>
            {health.note ? <p className={styles.hint}>{health.note}</p> : null}
          </div>
        ) : null}
      </section>

      {/* --- Technical details ---------------------------------------------- */}
      <section className={styles.block}>
        <button type="button" className={styles.choice} aria-expanded={showTechnical}
          onClick={() => setShowTechnical((open) => !open)}>
          {words.providerTechnical}
        </button>
        {showTechnical ? (
          <dl className={page.facts}>
            <div><dt>provider_key</dt><dd><Identifier value={MAPS_PROVIDER_KEY} /></dd></div>
            <div><dt>feature_flag</dt><dd><Identifier value={MAPS_FEATURE_FLAG} /></dd></div>
            <div><dt>kill_switch</dt><dd><Identifier value={provider?.killSwitch ?? null} /></dd></div>
            <div><dt>action_key</dt><dd><Identifier value={ACTIVATION_ACTION_KEY} /></dd></div>
            <div><dt>capability</dt><dd><Identifier value={ACTIVATION_CAPABILITY} /></dd></div>
            <div><dt>registry_status</dt><dd><Identifier value={provider?.status ?? null} /></dd></div>
            {request ? (
              <div><dt>dual_control_request</dt><dd><Identifier value={request.id} /></dd></div>
            ) : null}
          </dl>
        ) : null}
      </section>
    </ConsoleShell>
  );
}

/**
 * One governed action, described before it is offered.
 *
 * Every question an operator should be able to answer before pressing something
 * that changes hosted state, answered in the same place every time.
 */
function GovernedAction({
  words, title, body, capability, mutates, freshAuth, secondPerson, irreversible,
  audit, enabled, label, onRun,
}: {
  words: Record<string, string>;
  title: string; body: string; capability: string;
  mutates: boolean; freshAuth: boolean; secondPerson: boolean; irreversible: boolean;
  audit: string; enabled: boolean; label: string; onRun: () => void;
}) {
  const yes = words.consoleYes;
  const no = words.consoleNo;
  return (
    <div className={styles.impact}>
      <strong>{title}</strong>
      <p className={styles.hint}>{body}</p>
      <ul className={styles.impactList}>
        <li>{words.providerFactPermission}: {capability}</li>
        <li>{words.providerFactMutates}: {mutates ? yes : no}</li>
        <li>{words.providerFactFreshAuth}: {freshAuth ? yes : no}</li>
        <li>{words.providerFactSecondPerson}: {secondPerson ? yes : no}</li>
        <li>{words.providerFactReversible}: {irreversible ? no : yes}</li>
        <li>{words.providerFactAudit}: <Identifier value={audit} /></li>
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.submit} disabled={!enabled} onClick={onRun}>
          {label}
        </button>
      </div>
    </div>
  );
}
