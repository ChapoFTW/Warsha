import { AppState } from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { useProviderFoundation } from '@/src/providers/provider-context';
import { realtimeService } from '@/src/realtime/realtime-service';
import { paymentRepository } from './payment-repository';
import type {
  BookingPayment,
  BookingPaymentOptions,
  CheckoutInput,
  EarningsSummary,
  MinorAmount,
  PaymentReceipt,
  PriceAdjustment,
  PayoutDestination,
  PayoutDestinationType,
  ProviderBookingPayment,
  WithdrawalRequest,
} from './payment-types';

type PaymentContextValue = {
  mode: 'mock' | 'supabase';
  earnings: EarningsSummary | null;
  destinations: PayoutDestination[];
  withdrawals: WithdrawalRequest[];
  loadingEarnings: boolean;
  actionInFlight: string | null;
  error: string | null;
  getBookingPayment: (bookingId: string) => Promise<BookingPayment | null>;
  getBookingPaymentOptions: (
    bookingId: string,
    providerId?: string,
  ) => Promise<BookingPaymentOptions>;
  getProviderBookingPayment: (bookingId: string) => Promise<ProviderBookingPayment | null>;
  getPriceAdjustment: (bookingId: string) => Promise<PriceAdjustment | null>;
  getReceipt: (bookingId: string) => Promise<PaymentReceipt | null>;
  checkout: (input: CheckoutInput) => Promise<BookingPayment>;
  simulatePayment: (paymentId: string, outcome: 'pending' | 'success' | 'failure') => Promise<BookingPayment>;
  confirmCashCollected: (bookingId: string) => Promise<void>;
  respondCashCollection: (bookingId: string, confirmed: boolean) => Promise<void>;
  confirmBookingCompletion: (bookingId: string) => Promise<void>;
  proposePriceAdjustment: (bookingId: string, amountMinor: MinorAmount, reason: string) => Promise<PriceAdjustment>;
  respondPriceAdjustment: (adjustmentId: string, accept: boolean) => Promise<void>;
  simulateRefund: (paymentId: string) => Promise<BookingPayment>;
  reloadEarnings: () => Promise<void>;
  makeEarningsAvailable: () => Promise<void>;
  simulateEarningHold: (earningId: string, hold: boolean) => Promise<void>;
  saveDestination: (input: {
    type: PayoutDestinationType;
    label: string;
    value: string;
    idempotencyKey: string;
  }) => Promise<PayoutDestination>;
  withdraw: (amountMinor: MinorAmount, destinationId: string, idempotencyKey: string) => Promise<WithdrawalRequest>;
  simulateWithdrawal: (id: string, outcome: 'paid' | 'failed') => Promise<void>;
};

const PaymentContext = createContext<PaymentContextValue | null>(null);

export function PaymentsProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const provider = useProviderFoundation();
  const accountKey = auth.mode === 'mock' ? 'mock-user' : auth.user?.id ?? null;
  const providerId = provider.profile?.id ?? null;
  const scope = accountKey && providerId ? `${accountKey}:${providerId}` : null;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const mounted = useRef(true);
  const locks = useRef(new Set<string>());
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loadingEarnings, setLoadingEarnings] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const reloadEarnings = useCallback(async () => {
    const target = scope;
    if (!target || !accountKey || !providerId) {
      setEarnings(null);
      setDestinations([]);
      setWithdrawals([]);
      setLoadingEarnings(false);
      return;
    }
    setLoadingEarnings(true);
    try {
      const [nextEarnings, nextDestinations, nextWithdrawals] = await Promise.all([
        paymentRepository.getEarnings(accountKey, providerId),
        paymentRepository.listDestinations(accountKey, providerId),
        paymentRepository.listWithdrawals(accountKey, providerId),
      ]);
      if (!mounted.current || scopeRef.current !== target) return;
      setEarnings(nextEarnings);
      setDestinations(nextDestinations);
      setWithdrawals(nextWithdrawals);
      setError(null);
    } catch (reason) {
      if (!mounted.current || scopeRef.current !== target) return;
      setEarnings(null);
      setDestinations([]);
      setWithdrawals([]);
      setError(reason instanceof Error ? reason.message : 'Unable to load earnings');
    } finally {
      if (mounted.current && scopeRef.current === target) setLoadingEarnings(false);
    }
  }, [accountKey, providerId, scope]);

  useEffect(() => {
    setEarnings(null);
    setDestinations([]);
    setWithdrawals([]);
    setError(null);
    void reloadEarnings();
  }, [reloadEarnings, scope]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void reloadEarnings();
    });
    return () => subscription.remove();
  }, [reloadEarnings]);

  useEffect(() => {
    if (!providerId || !scope) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reconcile = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void reloadEarnings();
      }, 120);
    };
    const unsubscribe = realtimeService.providerFinances(providerId, reconcile);
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [providerId, reloadEarnings, scope]);

  const action = useCallback(async <T,>(key: string, operation: () => Promise<T>) => {
    if (locks.current.has(key)) throw new Error('Action already in progress');
    locks.current.add(key);
    setActionInFlight(key);
    try {
      const result = await operation();
      setError(null);
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment action failed');
      throw reason;
    } finally {
      locks.current.delete(key);
      if (mounted.current) setActionInFlight(current => current === key ? null : current);
    }
  }, []);

  const requireAccount = useCallback(() => {
    if (!accountKey) throw new Error('Authentication required');
    return accountKey;
  }, [accountKey]);
  const requireProvider = useCallback(() => {
    if (!providerId) throw new Error('Provider profile required');
    return providerId;
  }, [providerId]);

  const value = useMemo<PaymentContextValue>(() => ({
    mode: auth.mode,
    earnings,
    destinations,
    withdrawals,
    loadingEarnings,
    actionInFlight,
    error,
    getBookingPayment: bookingId => paymentRepository.getBookingPayment(requireAccount(), bookingId),
    getBookingPaymentOptions: (bookingId, targetProviderId) =>
      paymentRepository.getBookingPaymentOptions(
        requireAccount(),
        bookingId,
        targetProviderId,
      ),
    getProviderBookingPayment: bookingId =>
      paymentRepository.getProviderBookingPayment(requireAccount(), requireProvider(), bookingId),
    getPriceAdjustment: bookingId => paymentRepository.getPriceAdjustment(requireAccount(), bookingId),
    getReceipt: bookingId => paymentRepository.getReceipt(requireAccount(), bookingId),
    checkout: input => action(`checkout:${input.bookingId}`, () =>
      paymentRepository.createIntent(requireAccount(), input)),
    simulatePayment: (paymentId, outcome) => action(`simulate-payment:${paymentId}`, () =>
      paymentRepository.simulatePayment(requireAccount(), paymentId, outcome)),
    confirmCashCollected: bookingId => action(`cash-collected:${bookingId}`, async () => {
      await paymentRepository.confirmCashCollected(
        requireAccount(),
        requireProvider(),
        bookingId,
        `cash-provider-${bookingId}`,
      );
    }),
    respondCashCollection: (bookingId, confirmed) => action(`cash-response:${bookingId}`, async () => {
      await paymentRepository.respondCashCollection(
        requireAccount(),
        bookingId,
        confirmed,
        `cash-customer-${bookingId}-${confirmed}`,
      );
    }),
    confirmBookingCompletion: bookingId => action(`completion-confirm:${bookingId}`, () =>
      paymentRepository.confirmBookingCompletion(requireAccount(), bookingId)),
    proposePriceAdjustment: (bookingId, amountMinor, reason) => action(`price-adjustment:${bookingId}`, () =>
      paymentRepository.proposePriceAdjustment(
        requireAccount(),
        requireProvider(),
        bookingId,
        amountMinor,
        reason,
        `price-adjustment-${bookingId}-${amountMinor}`,
      )),
    respondPriceAdjustment: (adjustmentId, accept) => action(`price-adjustment-response:${adjustmentId}`, async () => {
      await paymentRepository.respondPriceAdjustment(requireAccount(), adjustmentId, accept);
    }),
    simulateRefund: paymentId => action(`simulate-refund:${paymentId}`, () =>
      paymentRepository.simulateRefund(requireAccount(), paymentId)),
    reloadEarnings,
    makeEarningsAvailable: () => action('make-earnings-available', async () => {
      await paymentRepository.makeEarningsAvailable(requireAccount(), requireProvider());
      await reloadEarnings();
    }),
    simulateEarningHold: (earningId, hold) => action(`simulate-hold:${earningId}`, async () => {
      await paymentRepository.simulateEarningHold(requireAccount(), requireProvider(), earningId, hold);
      await reloadEarnings();
    }),
    saveDestination: input => action('save-destination', async () => {
      const result = await paymentRepository.saveDestination(
        requireAccount(),
        requireProvider(),
        input,
      );
      await reloadEarnings();
      return result;
    }),
    withdraw: (amountMinor, destinationId, idempotencyKey) => action('withdraw', async () => {
      const result = await paymentRepository.requestWithdrawal(
        requireAccount(),
        requireProvider(),
        amountMinor,
        destinationId,
        idempotencyKey,
      );
      await reloadEarnings();
      return result;
    }),
    simulateWithdrawal: (id, outcome) => action(`simulate-withdrawal:${id}`, async () => {
      await paymentRepository.simulateWithdrawal(requireAccount(), requireProvider(), id, outcome);
      await reloadEarnings();
    }),
  }), [
    action,
    actionInFlight,
    auth.mode,
    destinations,
    earnings,
    error,
    loadingEarnings,
    reloadEarnings,
    requireAccount,
    requireProvider,
    withdrawals,
  ]);

  return <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>;
}

export function usePayments() {
  const value = useContext(PaymentContext);
  if (!value) throw new Error('usePayments must be used inside PaymentsProvider');
  return value;
}
