import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { logDataError } from '@/src/data/data-errors';
import { accountHydrationReady, canRefreshAccountInline } from '@/src/navigation/worker-route-policy';

import { isRateLimited } from '@/src/launch/launch-types';
import { CriminalRecordInputError, type CriminalRecordInput } from './criminal-record-submission';
import { onboardingRepository } from './onboarding-repository';
import {
  emptyOnboardingState,
  routeFor,
  type AccountRoleChoice,
  type IdentityCandidate,
  type OnboardingState,
  type PinSource,
  type RouteTarget,
} from './onboarding-types';

/**
 * WPS-023 onboarding state, account-isolated.
 *
 * Two properties this provider exists to guarantee.
 *
 * `ready` is false until the server has answered for THIS account. The router
 * shows a neutral loading state while it is false, which is what stops a
 * customer home rendering for one frame in front of a worker, or a protected
 * screen rendering in front of somebody signed out. A screen that flashes and
 * corrects itself has already shown the wrong thing.
 *
 * The generation guard is the WPS-019 pattern WPS-020, WPS-021 and WPS-022 all
 * use: a response that arrives after the account changed is discarded, and
 * nothing renders for an account other than the loaded one.
 */

/** The failures a screen needs to tell apart. Everything else is unavailable. */
export type OnboardingFailure = 'rate_limited' | 'invalid_input' | 'unavailable' | null;

/**
 * Turn whatever was thrown into one of those.
 *
 * Done here rather than in a screen so the raw reason never leaves this module.
 * `isRateLimited` is the shared authority — it matches SQLSTATE 53400 and the
 * server's own sentence — and `CriminalRecordInputError` is the client refusing
 * before it uploads.
 */
function classifyFailure(reason: unknown): Exclude<OnboardingFailure, null> {
  if (isRateLimited(reason)) return 'rate_limited';
  if (reason instanceof CriminalRecordInputError) return 'invalid_input';
  return 'unavailable';
}

type OnboardingValue = {
  ready: boolean;
  refreshing: boolean;
  accountKey: string | null;
  customerRecoveryEligible: boolean;
  state: OnboardingState;
  candidates: IdentityCandidate[];
  route: RouteTarget;
  error: boolean;
  /**
   * Why the last action failed, already classified.
   *
   * A CLASSIFICATION and never the error itself, so no screen can render a
   * SQLSTATE, an RPC name or a storage message by accident. `null` once an
   * action succeeds.
   */
  lastFailure: OnboardingFailure;
  selectRole: (role: AccountRoleChoice, expectedAccountKey?: string) => Promise<boolean>;
  resumeCustomerSetup: (expectedAccountKey?: string) => Promise<boolean>;
  confirmAddress: (input: {
    addressId: string;
    latitude: number;
    longitude: number;
    pinSource: PinSource;
    building?: string | null;
    floor?: string | null;
    apartment?: string | null;
    landmark?: string | null;
    serviceNotes?: string | null;
  }) => Promise<boolean>;
  acceptAgreements: (workerAgreement: boolean, documentProcessing: boolean) => Promise<boolean>;
  confirmIdentityFields: (input: {
    legalName: string;
    nationalId: string;
    dateOfBirth: string;
    expiryDate: string | null;
  }) => Promise<string | null>;
  recordCapture: (input: {
    documentId: string;
    captureSource: 'camera' | 'library' | 'file';
    contentHash: string | null;
    qualityFlags: string[];
    pageSide: 'front' | 'back';
  }) => Promise<boolean>;
  submitIdentity: () => Promise<boolean>;
  submitCriminalRecord: (input: CriminalRecordInput) => Promise<boolean>;
  submitAppeal: (statement: string) => Promise<boolean>;
  reload: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { mode, user, loading: authLoading } = useAuth();
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;

  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<OnboardingState>(emptyOnboardingState);
  const [candidates, setCandidates] = useState<IdentityCandidate[]>([]);
  const [customerRecoveryEligible, setCustomerRecoveryEligible] = useState(false);
  const [error, setError] = useState(false);
  const [lastFailure, setLastFailure] = useState<OnboardingFailure>(null);

  const generation = useRef(0);
  const loadedAccountRef = useRef<string | null>(null);
  const accountRef = useRef<string | null>(accountKey);
  accountRef.current = accountKey;

  const load = useCallback(async () => {
    const current = ++generation.current;
    const key = accountRef.current;

    if (!key) {
      setState(emptyOnboardingState);
      setCandidates([]);
      setCustomerRecoveryEligible(false);
      setLoadedAccount(null);
      loadedAccountRef.current = null;
      setError(false);
      setReady(true);
      return;
    }

    // A refresh for the same authenticated account must not tear down the
    // root navigator. Keep the last authoritative worker state visible and
    // let the onboarding screen show progress inline until the replacement
    // state arrives. Initial hydration and account changes still fail closed.
    const preservesMountedAccount = canRefreshAccountInline({
      activeAccountKey: key,
      loadedAccountKey: loadedAccountRef.current,
    });
    if (preservesMountedAccount) setRefreshing(true);
    else setReady(false);
    try {
      const next = await onboardingRepository.state(key);
      let nextCustomerRecoveryEligible = false;
      if (!next.roleSelected) {
        try {
          nextCustomerRecoveryEligible = await onboardingRepository.customerRecoveryEligible(key);
        } catch {
          // This proof only controls whether the narrow legacy-customer action
          // is shown. If it cannot be read, fail that action closed without
          // hiding metadata-backed recovery for a canonical interrupted signup.
          nextCustomerRecoveryEligible = false;
        }
      }
      if (current !== generation.current || accountRef.current !== key) return;
      setState(next);
      setCustomerRecoveryEligible(nextCustomerRecoveryEligible);
      setLoadedAccount(key);
      loadedAccountRef.current = key;
      setError(false);

      // Candidates are secondary. A failure to read them must not make the
      // whole account look broken, so they are fetched separately and their
      // absence is simply an empty list.
      if (next.intendedRole === 'worker') {
        try {
          const nextCandidates = await onboardingRepository.identityCandidates(key);
          if (current === generation.current && accountRef.current === key) {
            setCandidates(nextCandidates);
          }
        } catch {
          if (current === generation.current) setCandidates([]);
        }
      } else {
        setCandidates([]);
      }
    } catch (reason) {
      if (current !== generation.current || accountRef.current !== key) return;
      logDataError('onboarding.load', reason);
      // Fail closed. An unreadable onboarding state is NOT treated as "no
      // worker application" — that would route a pending worker to the
      // customer home and quietly imply their application vanished.
      setState(emptyOnboardingState);
      setCandidates([]);
      setCustomerRecoveryEligible(false);
      setLoadedAccount(key);
      loadedAccountRef.current = key;
      setError(true);
    } finally {
      if (current === generation.current) {
        setReady(true);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [accountKey, load]);

  const run = useCallback(
    async <T,>(
      label: string,
      operation: (key: string) => Promise<T>,
      expectedAccountKey?: string,
    ): Promise<T | null> => {
      const key = expectedAccountKey ?? accountRef.current;
      if (!key) return null;
      try {
        setLastFailure(null);
        const result = await operation(key);
        // Registration can establish the Supabase session before React has
        // committed the corresponding AuthContext render. Its explicit user
        // ID is safe to use for the role RPC; the repository verifies that it
        // still matches the authenticated server user. State is reloaded only
        // once this provider is rendering that same account.
        if (accountRef.current === key) await load();
        else if (expectedAccountKey === undefined) return null;
        return result;
      } catch (reason) {
        logDataError(`onboarding.${label}`, reason);
        setLastFailure(classifyFailure(reason));
        return null;
      }
    },
    [load],
  );

  const visibleState = loadedAccount === accountKey ? state : emptyOnboardingState;
  const visibleCustomerRecoveryEligible = loadedAccount === accountKey
    ? customerRecoveryEligible
    : false;
  const signedIn = mode === 'mock' || Boolean(user);
  const accountReady = accountHydrationReady({
    activeAccountKey: accountKey,
    loadedAccountKey: loadedAccount,
    settled: ready,
  });

  const value = useMemo<OnboardingValue>(
    () => ({
      // Auth hydration counts. Until the session is known, the account is not
      // known, and neither is the route.
      ready: accountReady && !authLoading,
      refreshing,
      accountKey,
      customerRecoveryEligible: visibleCustomerRecoveryEligible,
      state: visibleState,
      candidates: loadedAccount === accountKey ? candidates : [],
      route: routeFor(loadedAccount === accountKey && !error ? visibleState : null, signedIn),
      error,
      lastFailure,
      selectRole: async (role, expectedAccountKey) =>
        (await run(
          'selectRole',
          (key) => onboardingRepository.selectRole(key, role),
          expectedAccountKey,
        )) !== null,
      resumeCustomerSetup: async (expectedAccountKey) =>
        (await run(
          'resumeCustomerSetup',
          (key) => onboardingRepository.resumeCustomerSetup(key),
          expectedAccountKey,
        )) !== null,
      confirmAddress: async (input) =>
        (await run('confirmAddress', (key) => onboardingRepository.confirmAddress(key, input))) !== null,
      acceptAgreements: async (workerAgreement, documentProcessing) =>
        (await run('acceptAgreements', (key) =>
          onboardingRepository.acceptAgreements(key, workerAgreement, documentProcessing))) !== null,
      confirmIdentityFields: async (input) =>
        run('confirmIdentityFields', (key) => onboardingRepository.confirmIdentityFields(key, input)),
      recordCapture: async (input) =>
        (await run('recordCapture', (key) => onboardingRepository.recordCapture(key, input))) !== null,
      submitIdentity: async () =>
        (await run('submitIdentity', (key) => onboardingRepository.submitIdentity(key))) !== null,
      submitCriminalRecord: async (input) =>
        (await run('submitCriminalRecord', (key) =>
          onboardingRepository.submitCriminalRecord(key, input))) !== null,
      submitAppeal: async (statement) =>
        (await run('submitAppeal', (key) => onboardingRepository.submitAppeal(key, statement))) !== null,
      reload: load,
    }),
    [accountReady, authLoading, accountKey, visibleCustomerRecoveryEligible, visibleState, loadedAccount, candidates, error, lastFailure, signedIn, refreshing, run, load],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingValue {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return value;
}
