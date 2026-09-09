'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge, Empty, Identifier, Timestamp } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import {
  ReauthDialog, usePendingReauth, type ReauthRefusalReason,
} from '@/components/reauth-dialog';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import { runGovernedAction } from '@/lib/governed-action';
import {
  ACTIVATION_ACTION_KEY, ACTIVATION_CAPABILITY, activationRequest,
  actionAvailability, activationSteps, activationStepsFor, activationSubject, currentStep,
  featureFlagEnabled,
  governedProvider, GOVERNED_PROVIDERS,
  MAPS_PROVIDER_KEY,
  parseDualControlQueue, parseGovernancePolicy, parseProviderRegistry,
  providerHealthVerified, providerPolicyState, requiredApprovalCount,
  type ActionAvailability, type ActivationStepKey, type DualControlRequest,
  type ProviderEntry, type ProviderPolicyState, type StepState,
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
 * WHAT THIS PAGE NO LONGER DOES.
 *
 * It used to offer "Activate provider" and "Enable feature", and a
 * request-and-second-approval pair to gate them. Those are technical
 * activation: pressing them switches hosted capability on. Warsha's operating
 * model puts operational execution on the agent and authorisation on the owner,
 * so an activation button in a browser is a third path that nobody needs and
 * that invites the owner to run infrastructure by hand.
 *
 * The control plane is untouched and this is important:
 * `staff_activate_external_provider`, `staff_set_feature_flag`,
 * `staff_request_dual_control` and `staff_approve_dual_control` all still
 * exist, still check their capability, still demand fresh auth where they did,
 * still enforce environment binding, and still write their audit rows. Removing
 * a caller is not removing an authority. Activation happens through the
 * governed backend path instead.
 *
 * What this page is now: what is configured, what is switched on, in which
 * environment, whether the credentials are healthy, what is blocking, and the
 * two legal decisions that are genuinely a person's to make.
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

  /*
   * Which provider this page is driving.
   *
   * Maps stays the default so the surface an operator already knows opens
   * unchanged. The sequence, the refusals and the dual-control rules are the
   * database's and are identical for both; only the registry row, the feature
   * flag and the credential probe differ, and all three come from
   * `GOVERNED_PROVIDERS`.
   */
  const [providerKey, setProviderKey] = useState<string>(MAPS_PROVIDER_KEY);
  const governed = governedProvider(providerKey);
  const copySuffix = governed.copySuffix;

  const [provider, setProvider] = useState<ProviderEntry | null>(null);
  const [requests, setRequests] = useState<DualControlRequest[]>([]);
  // What the backend says its own policy is. Null until it has answered, and
  // then the environment mirror stands in rather than a guess at two.
  const [reportedApprovals, setReportedApprovals] = useState<number | null>(null);
  const [agreementReference, setAgreementReference] = useState('');
  const [credentialConfigured, setCredentialConfigured] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [policy, setPolicy] = useState<ProviderPolicyState>(
    providerPolicyState(MAPS_PROVIDER_KEY, null, null),
  );
  const [observedHealthVerified, setObservedHealthVerified] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showTechnical, setShowTechnical] = useState(false);

  const environment = session.environment ?? null;

  // One governed call at a time, latched synchronously. See `runGovernedAction`.
  const inFlight = useRef(false);

  // A refusal the dialog cannot resolve still has to be said out loud. These
  // are the three the continuation makes deliberately.
  const onReauthRefused = useCallback((refusal: ReauthRefusalReason) => {
    setError(refusal === 'another-action-pending' ? words.reauthAnotherPending
      : refusal === 'already-retried' ? words.reauthAlreadyRetried
        : words.reauthPendingExpired);
  }, [words.reauthAnotherPending, words.reauthAlreadyRetried, words.reauthPendingExpired]);
  const reauth = usePendingReauth(onReauthRefused);
  const { remember: rememberReauth } = reauth;

  const load = useCallback(async () => {
    if (!mayView) return;
    // A refresh is not an action. It used to share the action flag, so a single
    // failed read left every button disabled with nothing on screen to say so.
    setRefreshing(true);
    setError(null);
    const client = supabase();
    try {

      const registry = await client.rpc('staff_provider_registry');
      if (registry.error) {
        if (isReauthRefusal(registry.error)) {
          rememberReauth('load', 'review_legal_governance', () => { void load(); });
        } else setError(registry.error.message);
      } else {
        const entries = parseProviderRegistry(registry.data);
        setProvider(entries.find((item) => item.providerKey === providerKey) ?? null);
      }

      const queue = await client.rpc('staff_dual_control_queue');
      if (!queue.error) {
        setRequests(parseDualControlQueue(queue.data));
        setReportedApprovals(parseGovernancePolicy(queue.data, environment).requiredApprovals);
      }

      // The Vision register itself says that identity documents must not reach
      // Google until the material policy versions, agreement, processing basis
      // and renewed-consent control are ready. The activation RPC does not
      // infer those legal facts, so the console reads the existing governance
      // overview and keeps its own workflow closed until they are observable.
      if (governed.requiresIdentityPolicyGate) {
        const legal = await client.rpc('staff_legal_governance_overview');
        if (legal.error) {
          setPolicy(providerPolicyState(providerKey, null, environment));
          if (isReauthRefusal(legal.error)) {
            rememberReauth('load-policy', 'review_legal_governance', () => { void load(); });
          } else setError(legal.error.message);
        } else setPolicy(providerPolicyState(providerKey, legal.data, environment));
      } else {
        setPolicy(providerPolicyState(providerKey, null, environment));
      }

      // Vision health is established by the synthetic device exercise, not by
      // a browser button. The existing staff-only rollup lets this page observe
      // that success later without processing another document just to prove it.
      const providerHealth = await client.rpc('staff_provider_health');
      if (!providerHealth.error) {
        setObservedHealthVerified(providerHealthVerified(providerHealth.data, providerKey));
      }

      // The flag is what tells the page whether the last action landed. A read
      // that fails or is not understood must not be reported as "off" — that is
      // how a completed switch-on came to look like nothing had happened.
      const flags = await client.rpc('get_staff_feature_flags');
      if (flags.error) {
        if (!isReauthRefusal(flags.error)) setError(flags.error.message);
      } else {
        setFeatureEnabled(featureFlagEnabled(flags.data, governed.featureFlag, environment));
      }

      // Capability metadata only. Each provider's own function answers whether
      // a credential is present; neither has a path that could answer what it
      // is. A credential lives in an Edge Function's runtime, which is why this
      // cannot come from `staff_provider_registry` along with everything else.
      const descriptor = await client.functions.invoke(
        governed.credentialProbe.functionName, { body: governed.credentialProbe.body },
      );
      setCredentialConfigured(
        !descriptor.error && governed.credentialProbe.read(descriptor.data));
    } catch {
      // A read that throws is reported, not swallowed into a page that looks
      // ready and answers nothing.
      setError(words.providerLoadFailed);
    } finally {
      setRefreshing(false);
    }
  }, [mayView, environment, providerKey, governed, words.providerLoadFailed, rememberReauth]);

  useEffect(() => { void load(); }, [load]);

  const request = activationRequest(requests, providerKey, environment ?? '');
  // The policy this backend is governed by, and therefore the steps that exist.
  const approvals = reportedApprovals ?? requiredApprovalCount(environment);
  const mode = approvals >= 2 ? 'dual_control' : 'single_admin';
  const stepKeys = activationStepsFor(approvals);
  const states = activationSteps({
    environment,
    credentialConfigured,
    provider,
    request,
    featureEnabled,
    healthVerified: observedHealthVerified
      || Boolean(health?.searched && health?.reverseGeocoded),
    mayActivate,
    mayManageFlags,
    policyReady: policy.ready,
    automaticHealthProbe: governed.automaticHealthProbe,
    requiredApprovals: approvals,
  });
  const next = currentStep(states);

  // The capability travels with the action. The re-auth dialog displays it and
  // resolves what the operator must prove against it, so an action that names
  // the wrong one asks for the wrong proof.
  const run = (
    key: string,
    capability: string,
    action: () => Promise<{ error: unknown } | void>,
  ) =>
    runGovernedAction(inFlight, key, action, {
      setBusy, setError, setDone,
      refresh: load,
      isReauthRefusal,
      rememberReauth: (pending) =>
        reauth.remember(pending, capability, () => { void run(pending, capability, action); }),
      failedMessage: words.providerActionFailed,
      doneMessage: words.providerActionDone,
    });

  // The two internal decisions that had no button.
  //
  // WPS-024 registered a lawful basis as `pending` and a supplier agreement as
  // `not_started`, and never built a way to record either one having been
  // settled. So both said the same thing for months whether or not anybody had
  // looked at them, and the activation gate above blocked on states nobody
  // could clear. These are Warsha's own decisions about Warsha's own registers:
  // they publish nothing, tell nobody, and record no acceptance on anyone's
  // behalf.
  const approveProcessingBasis = () => run('basis', 'review_legal_governance', async () =>
    supabase().rpc('staff_record_processing_basis_review', {
      p_activity_key: 'worker_verification',
      p_status: 'approved',
      p_basis: '',
      p_note: reason.trim() || words.providerBasisDefaultNote,
    }));

  // `incorporated`, not `signed`. A cloud supplier's data-processing terms are
  // ordinarily incorporated into the service terms accepted when the account
  // was opened; there is no countersigned document, and recording one would be
  // a claim about an external party that nothing supports. The reference names
  // what puts the terms in force, and the database refuses the status without
  // one.
  const recordAgreement = () => run('agreement', ACTIVATION_CAPABILITY, async () =>
    supabase().rpc('staff_record_subprocessor_agreement', {
      p_subprocessor_key: providerKey,
      p_status: 'incorporated',
      p_reference: agreementReference.trim(),
      p_reason: reason.trim() || words.providerAgreementDefaultReason,
    }));

  // Two calls, both harmless reads at the provider, both billed once. Nothing
  // is written and no destructive operation exists on this path.
  const runHealth = async () => {
    // Vision has no harmless probe: the only thing it does is read a document.
    // The step is `waiting` for it and no button is offered, but the guard is
    // here too rather than only in the markup.
    if (!governed.automaticHealthProbe) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('health');
    setError(null);
    setDone(null);
    const client = supabase();
    try {
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
    } catch {
      setError(words.providerHealthFailed);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  /*
   * Copy, with a per-provider variant where one exists.
   *
   * Maps keeps every sentence it already had — an operator switching on address
   * search should read "Turn on address search", not a neutral abstraction that
   * serves neither provider well. Vision supplies its own variants under a
   * `_vision` suffix and falls back to the shared string when it has nothing
   * more specific to say.
   */
  const providerWords = (key: string) =>
    words[`${key}${copySuffix}`] ?? words[key];

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

      {/* Which provider this sequence is for. Two entries today; the list is
          `GOVERNED_PROVIDERS`, so a third needs a registry entry rather than
          another copy of this page. Changing it reloads the registry, the flag
          and the credential probe together — a half-switched view would invite
          somebody to act on the wrong provider's state. */}
      <label className={page.providerChoice}>
        <span>{words.providerChooseLabel}</span>
        <select
          value={providerKey}
          disabled={busy !== null || refreshing}
          onChange={(event) => {
            const nextProviderKey = event.target.value;
            setProviderKey(nextProviderKey);
            setProvider(null);
            setHealth(null);
            setFeatureEnabled(false);
            setCredentialConfigured(false);
            setPolicy(providerPolicyState(nextProviderKey, null, environment));
            setObservedHealthVerified(false);
            setError(null);
            setDone(null);
          }}
        >
          {GOVERNED_PROVIDERS.map((entry) => (
            <option key={entry.providerKey} value={entry.providerKey}>
              {words[entry.choiceCopyKey]}
            </option>
          ))}
        </select>
      </label>

      {reauth.capability ? (
        <ReauthDialog
          capability={reauth.capability}
          onClose={reauth.discard}
          onSuccess={reauth.resume}
        />
      ) : null}

      {error ? <p className={table.error} role="alert">{error}</p> : null}
      {done ? <p className={styles.done} role="status">{done}</p> : null}

      {/* --- What this provider is ----------------------------------------- */}
      <section className={styles.block} aria-labelledby="provider">
        <h2 id="provider" className={styles.title}>{providerWords('providerMapsName')}</h2>
        <p className={styles.lead}>{providerWords('providerMapsPurpose')}</p>

        <dl className={page.facts}>
          <div>
            <dt>{words.providerEnvironment}</dt>
            <dd>{environment === 'development' ? words.platformEnvDevelopment : environment ?? '—'}</dd>
          </div>
          <div>
            <dt>{words.providerGovernanceMode}</dt>
            <dd>
              <Badge tone="plain">
                {mode === 'single_admin'
                  ? words.providerGovernanceModeSingle
                  : words.providerGovernanceModeDual}
              </Badge>
            </dd>
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
          {governed.requiresIdentityPolicyGate ? (
            <div>
              <dt>{words.providerPolicy}</dt>
              <dd>
                <Badge tone={policy.ready ? 'plain' : 'strong'}>
                  {policy.ready ? words.providerPolicyReady : words.providerPolicyBlocked}
                </Badge>
              </dd>
            </div>
          ) : null}
        </dl>
        {governed.requiresIdentityPolicyGate ? (
          <>
            <p className={styles.hint} role={policy.ready ? undefined : 'status'}>
              {providerWords('providerPolicyWhy')}
            </p>
            <ul className={styles.impactList}>
              {policy.publicCommitmentsRequired ? (
                <li>{words.providerPolicyDocuments}: {
                  policy.materialDocumentsPublished ? words.consoleYes : words.consoleNo}</li>
              ) : null}
              <li>{words.providerPolicyAgreement}: {
                policy.agreementSigned ? words.consoleYes : words.consoleNo}</li>
              <li>{words.providerPolicyProcessingBasis}: {
                policy.processingBasisApproved ? words.consoleYes : words.consoleNo}</li>
              <li>{words.providerPolicyTraining}: {
                policy.trainingProhibited ? words.consoleYes : words.consoleNo}</li>
              <li>{words.providerPolicyAiUse}: {
                policy.aiUseApproved ? words.consoleYes : words.consoleNo}</li>
              {policy.publicCommitmentsRequired ? (
                <li>{words.providerPolicyReconsent}: {
                  policy.reconsentEnforced ? words.consoleYes : words.consoleNo}</li>
              ) : (
                <li>{words.providerPolicyPreProduction}</li>
              )}
            </ul>
          </>
        ) : null}
      </section>

      {/* --- The sequence --------------------------------------------------- */}
      <section className={styles.block} aria-labelledby="sequence">
        <h2 id="sequence" className={styles.title}>{words.providerSequenceTitle}</h2>
        <p className={styles.lead}>{words.providerSequenceLead}</p>
        <ol className={page.steps}>
          {stepKeys.map((key: ActivationStepKey, index) => (
            <li key={key} className={key === next ? page.stepCurrent : page.step}>
              <span className={page.stepIndex}>{index + 1}</span>
              <span className={page.stepBody}>
                <strong>{providerWords(`providerStep_${key}`)}</strong>
                <span className={styles.hint}>{providerWords(`providerStepWhy_${key}`)}</span>
              </span>
              <Badge tone={tone(states[key])}>{stateWord(states[key])}</Badge>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Why a decision below will be recorded the way it is -------------
          Warsha runs single-operator: `requiredApprovalCount()` returns 1, so
          the two-approver request/approve pair this section used to carry never
          rendered. It is gone rather than left as an unreachable branch.

          What remains is the context the recorded decisions below need: which
          governance mode is in force, and the reason string that is written
          into the audit row for the legal reviews. -------------------------- */}
      <section className={styles.block} aria-labelledby="approval">
        <h2 id="approval" className={styles.title}>{words.providerGovernanceTitle}</h2>
        <p className={styles.lead}>{words.providerGovernanceSingleAdmin}</p>
        <ul className={styles.impactList}>
          <li>{words.providerGovernanceMode}: {words.providerGovernanceModeSingle}</li>
          <li>{words.providerGovernanceApprovals}: {approvals}</li>
          <li>{words.providerGovernanceRecorded}</li>
        </ul>
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reason">{words.providerReason}</label>
            <textarea id="reason" className={styles.textarea} value={reason}
              onChange={(event) => setReason(event.target.value)} />
            <p className={styles.hint}>{words.providerReasonHint}</p>
          </div>
        </div>
      </section>

      {/* --- Is the provider actually reachable? ----------------------------
          This section used to offer "Activate provider" and "Enable feature",
          which are technical activation: they switch hosted capability on. That
          is operational execution, and it now happens through the governed
          backend path rather than by inviting the owner to press a button in a
          browser. `staff_activate_external_provider` and
          `staff_set_feature_flag` are untouched — same capability checks, same
          fresh-auth requirement, same audit rows.

          What is left is the one action here that changes nothing: a read-only
          reachability probe, which is diagnosis rather than operation. --- */}
      <section className={styles.block} aria-labelledby="actions">
        <h2 id="actions" className={styles.title}>{words.providerActionsTitle}</h2>

        <GovernedAction
          words={words}
          title={providerWords('providerHealthTitle')}
          body={providerWords('providerHealthBody')}
          capability={words.capability_review_legal_governance}
          mutates={false}
          freshAuth={false}
          secondPerson={false}
          irreversible={false}
          audit="provider_health_observed"
          availability={actionAvailability(states.health, busy ?? reauth.pendingKey, refreshing)}
          label={busy === 'health' ? words.loading : providerWords('providerHealthAction')}
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

      {/* --- The internal decisions the gate is waiting on -------------------- */}
      {governed.requiresIdentityPolicyGate
        && (!policy.processingBasisApproved || !policy.agreementSigned) ? (
        <section className={styles.block} aria-labelledby="review">
          <h2 id="review" className={styles.title}>{words.providerReviewTitle}</h2>
          <p className={styles.lead}>{words.providerReviewLead}</p>

          {!policy.processingBasisApproved ? (
            <GovernedAction
              words={words}
              title={words.providerBasisTitle}
              body={words.providerBasisBody}
              capability={words.capability_review_legal_governance}
              mutates
              freshAuth
              secondPerson={approvals >= 2}
              irreversible={false}
              audit="processing_basis_reviewed"
              availability={actionAvailability(
                mayView ? 'ready' : 'waiting', busy ?? reauth.pendingKey, refreshing)}
              label={busy === 'basis' ? words.loading : words.providerBasisAction}
              onRun={approveProcessingBasis}
            />
          ) : null}

          {!policy.agreementSigned ? (
            <>
              <div className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="agreement">
                    {words.providerAgreementReference}
                  </label>
                  <input id="agreement" className={styles.input} value={agreementReference}
                    onChange={(event) => setAgreementReference(event.target.value)} />
                  <p className={styles.hint}>{words.providerAgreementReferenceHint}</p>
                </div>
              </div>
              <GovernedAction
                words={words}
                title={words.providerAgreementTitle}
                body={words.providerAgreementBody}
                capability={words.capability_manage_subprocessors}
                mutates
                freshAuth
                secondPerson={approvals >= 2}
                irreversible={false}
                audit="subprocessor_agreement_recorded"
                availability={actionAvailability(
                  // Two different refusals, and collapsing them into `waiting`
                  // told an operator who held every capability that they held
                  // none. Missing permission is `waiting`; an unfilled
                  // reference is `incomplete`, which is this form's own fault
                  // and says so.
                  !mayActivate ? 'waiting'
                    : agreementReference.trim().length >= 10 ? 'ready' : 'incomplete',
                  busy ?? reauth.pendingKey, refreshing)}
                label={busy === 'agreement' ? words.loading : words.providerAgreementAction}
                onRun={recordAgreement}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {/* --- Technical details ---------------------------------------------- */}
      <section className={styles.block}>
        <button type="button" className={styles.choice} aria-expanded={showTechnical}
          onClick={() => setShowTechnical((open) => !open)}>
          {words.providerTechnical}
        </button>
        {showTechnical ? (
          <dl className={page.facts}>
            <div><dt>provider_key</dt><dd><Identifier value={providerKey} /></dd></div>
            <div><dt>feature_flag</dt><dd><Identifier value={governed.featureFlag} /></dd></div>
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
  audit, availability, label, onRun,
}: {
  words: Record<string, string>;
  title: string; body: string; capability: string;
  mutates: boolean; freshAuth: boolean; secondPerson: boolean; irreversible: boolean;
  audit: string; availability: ActionAvailability; label: string; onRun: () => void;
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
        <button type="button" className={styles.submit}
          disabled={!availability.enabled} onClick={onRun}>
          {label}
        </button>
      </div>
      {/* A button disabled for a reason nobody states is indistinguishable from
          a broken one. That is exactly how this page failed — twice. Every
          refusal is spoken, including the structural ones that used to be
          silent because they were judged self-evident. They were not: an
          operator looking at a greyed button cannot tell "an earlier step is
          unfinished" from "you lack the permission" from "this is broken". */}
      {!availability.enabled ? (
        <p className={styles.hint} role="status">
          {availability.reason === 'refreshing' ? words.providerBusyRefreshing
            : availability.reason === 'another-action' ? words.providerBusyOtherAction
              : availability.reason === 'waiting' ? words.providerBusyWaiting
                : availability.reason === 'incomplete' ? words.providerBusyIncomplete
                  : availability.reason === 'done' ? words.providerBusyDone
                    : words.providerBusyBlocked}
        </p>
      ) : null}
    </div>
  );
}
