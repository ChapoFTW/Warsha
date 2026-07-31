import Storage from 'expo-sqlite/kv-store';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import { createMockNotification } from '@/src/notifications/notification-repository';
import { emitMockRealtime } from '@/src/realtime/realtime-service';
import {
  addMinor,
  calculateCommissionMinor,
  compareMinor,
  minor,
  minorValue,
  subtractMinor,
} from './money';
import type {
  BookingPaymentOptions,
  BookingPayment,
  CheckoutInput,
  EarningsSummary,
  MinorAmount,
  PaymentReceipt,
  PriceAdjustment,
  PayoutDestination,
  PayoutDestinationType,
  ProviderBookingPayment,
  ProviderEarning,
  WithdrawalRequest,
} from './payment-types';

type MockPayment = BookingPayment & {
  accountKey: string;
  providerId: string;
  service: string;
  providerName: string;
  idempotencyKey: string;
};
type MockEarning = ProviderEarning & { accountKey: string; providerId: string; paymentId: string };
type MockDestination = PayoutDestination & { accountKey: string; providerId: string; fingerprint: string };
type MockWithdrawal = WithdrawalRequest & { accountKey: string; providerId: string; idempotencyKey: string };
type MockAdjustment = PriceAdjustment & { accountKey: string; providerId: string; idempotencyKey: string };
type MockDebt = {
  accountKey: string;
  providerId: string;
  cashMinor: MinorAmount;
  recoveryMinor: MinorAmount;
};
type MockStore = {
  payments: MockPayment[];
  earnings: MockEarning[];
  destinations: MockDestination[];
  withdrawals: MockWithdrawal[];
  adjustments: MockAdjustment[];
  debts: MockDebt[];
};

const KEY = 'warsha:payments:v1';
const emptyStore: MockStore = {
  payments: [],
  earnings: [],
  destinations: [],
  withdrawals: [],
  adjustments: [],
  debts: [],
};
let queue: Promise<unknown> = Promise.resolve();

function atomic<T>(operation: () => Promise<T>) {
  const result = queue.then(operation, operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

async function readMock(): Promise<MockStore> {
  const raw = await Storage.getItem(KEY);
  if (!raw) return { ...emptyStore };
  try {
    const parsed = JSON.parse(raw) as Partial<MockStore>;
    return {
      payments: (parsed.payments ?? []).map(item => ({
        ...item,
        snapshot: {
          ...item.snapshot,
          promotionMinor: item.snapshot.promotionMinor ?? item.snapshot.discountMinor ?? '0',
          approvedJobPriceMinor:
            item.snapshot.approvedJobPriceMinor
            ?? item.snapshot.customerTotalMinor
            ?? item.amountMinor,
        },
      })),
      earnings: (parsed.earnings ?? []).map(item => ({
        ...item,
        debtOffsetMinor: item.debtOffsetMinor ?? '0',
      })),
      destinations: parsed.destinations ?? [],
      withdrawals: parsed.withdrawals ?? [],
      adjustments: parsed.adjustments ?? [],
      debts: parsed.debts ?? [],
    };
  } catch {
    return { ...emptyStore };
  }
}

async function writeMock(store: MockStore, table: 'financial_booking_payments' | 'provider_earnings_ledger' | 'provider_withdrawal_requests') {
  await Storage.setItem(KEY, JSON.stringify(store));
  emitMockRealtime({ table, event: 'UPDATE' });
}

function identifier(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function parsePayment(value: unknown): BookingPayment | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as BookingPayment;
  return {
    ...row,
    refundedMinor: row.refundedMinor ?? '0',
    createdAt: row.createdAt ?? new Date().toISOString(),
    snapshot: {
      ...row.snapshot,
      promotionMinor: row.snapshot?.promotionMinor ?? row.snapshot?.discountMinor ?? '0',
      approvedJobPriceMinor: row.snapshot?.approvedJobPriceMinor
        ?? row.snapshot?.customerTotalMinor
        ?? row.amountMinor,
    },
  };
}

async function mockCreateIntent(accountKey: string, input: CheckoutInput) {
  return atomic(async () => {
    const store = await readMock();
    const duplicate = store.payments.find(item =>
      item.accountKey === accountKey && item.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) return duplicate;
    const existing = store.payments.find(item =>
      item.accountKey === accountKey && item.bookingId === input.bookingId,
    );
    if (existing) {
      if (
        existing.paymentMethod === 'online'
        && input.method === 'online'
        && existing.status === 'failed'
      ) {
        existing.status = 'payment_initiated';
        existing.attemptId = identifier('mock-attempt');
        existing.idempotencyKey = input.idempotencyKey;
        await writeMock(store, 'financial_booking_payments');
      }
      return existing;
    }
    const debt = store.debts.find(item =>
      item.accountKey === accountKey && item.providerId === input.providerId,
    );
    if (input.method === 'cash' && debt && compareMinor(debt.cashMinor, '50000') > 0) {
      throw new Error('Cash payment is temporarily unavailable for this provider');
    }
    const now = new Date().toISOString();
    const payment: MockPayment = {
      accountKey,
      providerId: input.providerId,
      service: input.service,
      providerName: input.providerName,
      idempotencyKey: input.idempotencyKey,
      paymentId: identifier('mock-payment'),
      attemptId: input.method === 'online' ? identifier('mock-attempt') : undefined,
      bookingId: input.bookingId,
      status: input.method === 'cash' ? 'awaiting_payment' : 'payment_initiated',
      paymentMethod: input.method,
      amountMinor: minor(input.totalMinor),
      refundedMinor: '0',
      currency: 'EGP',
      reference: identifier('WSP').toUpperCase(),
      createdAt: now,
      snapshot: {
        serviceSubtotalMinor: minor(input.totalMinor),
        calloutFeeMinor: '0',
        emergencyFeeMinor: '0',
        discountMinor: '0',
        promotionMinor: '0',
        taxMinor: '0',
        approvedJobPriceMinor: minor(input.totalMinor),
        customerTotalMinor: minor(input.totalMinor),
        currency: 'EGP',
        version: 1,
      },
    };
    store.payments.unshift(payment);
    await writeMock(store, 'financial_booking_payments');
    return payment;
  });
}

function mockDebt(store: MockStore, accountKey: string, providerId: string) {
  let debt = store.debts.find(item =>
    item.accountKey === accountKey && item.providerId === providerId,
  );
  if (!debt) {
    debt = { accountKey, providerId, cashMinor: '0', recoveryMinor: '0' };
    store.debts.push(debt);
  }
  return debt;
}

function releaseMockEarning(store: MockStore, earning: MockEarning) {
  if (earning.status !== 'pending_release') return;
  const debt = mockDebt(store, earning.accountKey, earning.providerId);
  const net = minorValue(earning.netMinor);
  const cashOffset = net < minorValue(debt.cashMinor) ? net : minorValue(debt.cashMinor);
  const afterCash = net - cashOffset;
  const recoveryOffset = afterCash < minorValue(debt.recoveryMinor)
    ? afterCash
    : minorValue(debt.recoveryMinor);
  debt.cashMinor = minor(minorValue(debt.cashMinor) - cashOffset);
  debt.recoveryMinor = minor(minorValue(debt.recoveryMinor) - recoveryOffset);
  earning.debtOffsetMinor = minor(cashOffset + recoveryOffset);
  earning.status = 'available';
}

async function mockSimulatePayment(
  accountKey: string,
  paymentId: string,
  outcome: 'pending' | 'success' | 'failure',
) {
  return atomic(async () => {
    const store = await readMock();
    const payment = store.payments.find(item => item.accountKey === accountKey && item.paymentId === paymentId);
    if (!payment) throw new Error('Payment not found');
    if (payment.paymentMethod !== 'online') throw new Error('Cash does not use online processing');
    if (outcome === 'pending') payment.status = 'pending';
    if (outcome === 'failure' && payment.status !== 'paid') payment.status = 'failed';
    if (outcome === 'success') {
      payment.status = 'paid';
      payment.paidAt ??= new Date().toISOString();
      if (!store.earnings.some(item => item.paymentId === payment.paymentId)) {
        const commissionMinor = calculateCommissionMinor(payment.snapshot.approvedJobPriceMinor);
        const netMinor = subtractMinor(payment.snapshot.approvedJobPriceMinor, commissionMinor);
        store.earnings.unshift({
          id: identifier('mock-earning'),
          accountKey,
          providerId: payment.providerId,
          bookingId: payment.bookingId,
          paymentId: payment.paymentId,
          service: payment.service,
          date: payment.paidAt,
          grossMinor: payment.snapshot.approvedJobPriceMinor,
          commissionMinor,
          netMinor,
          debtOffsetMinor: '0',
          heldMinor: '0',
          currency: 'EGP',
          status: 'pending_release',
          releaseEligibleAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
    await writeMock(store, outcome === 'success' ? 'provider_earnings_ledger' : 'financial_booking_payments');
    await createMockNotification(
      outcome === 'success' ? 'payment_confirmed' : outcome === 'failure' ? 'payment_failed' : 'payment_pending',
      payment.bookingId,
      payment.providerId,
      `mock-payment:${payment.paymentId}:${outcome}`,
    );
    return payment;
  });
}

function mockSummary(store: MockStore, accountKey: string, providerId: string): EarningsSummary {
  const transactions = store.earnings.filter(item => item.accountKey === accountKey && item.providerId === providerId);
  const reserved = store.withdrawals
    .filter(item => item.accountKey === accountKey && item.providerId === providerId && ['requested', 'under_review', 'processing'].includes(item.status))
    .map(item => item.amountMinor);
  const availableEarnings = transactions
    .filter(item => item.status === 'available')
    .map(item => subtractMinor(
      subtractMinor(item.netMinor, item.debtOffsetMinor),
      item.heldMinor,
    ));
  const available = subtractMinor(
    addMinor(...(availableEarnings.length ? availableEarnings : ['0'])),
    addMinor(...(reserved.length ? reserved : ['0'])),
  );
  const debt = store.debts.find(item =>
    item.accountKey === accountKey && item.providerId === providerId,
  );
  const cashDebtMinor = debt?.cashMinor ?? '0';
  return {
    providerId,
    currency: 'EGP',
    availableMinor: available,
    pendingMinor: addMinor(...(transactions
      .filter(item => ['pending_job_completion', 'pending_release'].includes(item.status))
      .map(item => item.netMinor).concat('0') as MinorAmount[])),
    paidOutMinor: addMinor(...(store.withdrawals
      .filter(item => item.accountKey === accountKey && item.providerId === providerId && item.status === 'paid')
      .map(item => item.amountMinor).concat('0') as MinorAmount[])),
    heldMinor: addMinor(...transactions.map(item => item.heldMinor).concat('0') as MinorAmount[]),
    cashCommissionDueMinor: cashDebtMinor,
    recoverableAdjustmentMinor: debt?.recoveryMinor ?? '0',
    cashDebtRestrictionThresholdMinor: '50000',
    cashPaymentsRestricted: compareMinor(cashDebtMinor, '50000') > 0,
    minimumWithdrawalMinor: '20000',
    withdrawalFeeMinor: '0',
    withdrawalsEnabled: true,
    releaseDelaySeconds: '21600',
    automaticReleaseSchedulerEnabled: false,
    transactions,
  };
}

export const paymentRepository = {
  async getBookingPaymentOptions(
    accountKey: string,
    bookingId: string,
    providerId?: string,
  ): Promise<BookingPaymentOptions> {
    if (environment.dataMode === 'mock') {
      const debt = providerId
        ? (await readMock()).debts.find(item =>
          item.accountKey === accountKey && item.providerId === providerId,
        )
        : undefined;
      const cashEnabled = !debt || compareMinor(debt.cashMinor, '50000') <= 0;
      return {
        currency: 'EGP',
        cashEnabled,
        onlineEnabled: true,
        onlineDevelopmentOnly: true,
        cashRestrictionReason: cashEnabled
          ? undefined
          : 'Cash payment is temporarily unavailable for this provider.',
      };
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_booking_payment_options', {
      p_booking_id: bookingId,
    });
    if (error) throw error;
    return data as BookingPaymentOptions;
  },

  async confirmBookingCompletion(accountKey: string, bookingId: string) {
    if (environment.dataMode === 'mock') {
      const store = await readMock();
      const payment = store.payments.find(item =>
        item.accountKey === accountKey && item.bookingId === bookingId,
      );
      const earning = payment
        ? store.earnings.find(item => item.paymentId === payment.paymentId)
        : undefined;
      if (!payment || !earning) throw new Error('Completed paid booking not found');
      if (earning.status === 'pending_release') {
        releaseMockEarning(store, earning);
        earning.customerConfirmedAt = new Date().toISOString();
        await writeMock(store, 'provider_earnings_ledger');
      }
      return;
    }
    const { error } = await getSupabaseClient().rpc(
      'confirm_booking_completion_for_payment',
      {
        p_booking_id: bookingId,
        p_idempotency_key: `customer-completion-${bookingId}`,
      },
    );
    if (error) throw error;
  },

  async getBookingPayment(accountKey: string, bookingId: string) {
    if (environment.dataMode === 'mock') {
      const store = await readMock();
      return store.payments.find(item => item.accountKey === accountKey && item.bookingId === bookingId) ?? null;
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_booking_payment', { p_booking_id: bookingId });
    if (error) throw error;
    return parsePayment(data);
  },

  async getProviderBookingPayment(accountKey: string, providerId: string, bookingId: string): Promise<ProviderBookingPayment | null> {
    if (environment.dataMode === 'mock') {
      const payment = (await readMock()).payments.find(item =>
        item.accountKey === accountKey && item.providerId === providerId && item.bookingId === bookingId,
      );
      if (!payment) return null;
      const { paymentId, status, paymentMethod, amountMinor, currency, reference, createdAt } = payment;
      return {
        paymentId,
        bookingId,
        status,
        paymentMethod,
        amountMinor,
        approvedJobPriceMinor: payment.snapshot.approvedJobPriceMinor,
        commissionMinor: calculateCommissionMinor(payment.snapshot.approvedJobPriceMinor),
        currency,
        reference,
        createdAt,
      };
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_provider_booking_payment', {
      p_booking_id: bookingId,
    });
    if (error) {
      if (error.code === 'P0002') return null;
      throw error;
    }
    return data as ProviderBookingPayment;
  },

  async getPriceAdjustment(accountKey: string, bookingId: string): Promise<PriceAdjustment | null> {
    if (environment.dataMode === 'mock') {
      return (await readMock()).adjustments.find(item =>
        item.accountKey === accountKey && item.bookingId === bookingId && item.status === 'pending',
      ) ?? null;
    }
    const { data, error } = await getSupabaseClient()
      .from('booking_price_adjustments')
      .select('id,booking_id,proposed_total_minor,currency,reason,status,proposed_at')
      .eq('booking_id', bookingId)
      .eq('status', 'pending')
      .maybeSingle();
    if (error) throw error;
    return data ? {
      id: data.id,
      bookingId: data.booking_id,
      proposedTotalMinor: String(data.proposed_total_minor),
      currency: data.currency as 'EGP',
      reason: data.reason,
      status: data.status as PriceAdjustment['status'],
      proposedAt: data.proposed_at,
    } : null;
  },

  async proposePriceAdjustment(
    accountKey: string,
    providerId: string,
    bookingId: string,
    proposedTotalMinor: MinorAmount,
    reason: string,
    idempotencyKey: string,
  ): Promise<PriceAdjustment> {
    if (environment.dataMode === 'mock') {
      return atomic(async () => {
        const store = await readMock();
        const duplicate = store.adjustments.find(item =>
          item.accountKey === accountKey && item.providerId === providerId && item.idempotencyKey === idempotencyKey,
        );
        if (duplicate) return duplicate;
        if (store.adjustments.some(item => item.accountKey === accountKey && item.bookingId === bookingId && item.status === 'pending')) {
          throw new Error('A price change is already waiting for the customer');
        }
        const adjustment: MockAdjustment = {
          id: identifier('mock-adjustment'),
          accountKey,
          providerId,
          idempotencyKey,
          bookingId,
          proposedTotalMinor: minor(proposedTotalMinor),
          currency: 'EGP',
          reason,
          status: 'pending',
          proposedAt: new Date().toISOString(),
        };
        store.adjustments.unshift(adjustment);
        await Storage.setItem(KEY, JSON.stringify(store));
        emitMockRealtime({ table: 'financial_booking_payments', event: 'UPDATE' });
        return adjustment;
      });
    }
    const { data, error } = await getSupabaseClient().rpc('propose_booking_price_adjustment', {
      p_booking_id: bookingId,
      p_new_total_minor: proposedTotalMinor,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id),
      bookingId: String(row.bookingId),
      proposedTotalMinor: String(row.newTotalMinor),
      currency: 'EGP',
      reason,
      status: 'pending',
      proposedAt: new Date().toISOString(),
    };
  },

  async respondPriceAdjustment(accountKey: string, adjustmentId: string, accept: boolean) {
    if (environment.dataMode === 'mock') {
      return atomic(async () => {
        const store = await readMock();
        const adjustment = store.adjustments.find(item => item.accountKey === accountKey && item.id === adjustmentId);
        if (!adjustment || adjustment.status !== 'pending') throw new Error('Price change not found');
        adjustment.status = accept ? 'accepted' : 'rejected';
        await Storage.setItem(KEY, JSON.stringify(store));
        emitMockRealtime({ table: 'financial_booking_payments', event: 'UPDATE' });
        return adjustment;
      });
    }
    const { data, error } = await getSupabaseClient().rpc('respond_booking_price_adjustment', {
      p_adjustment_id: adjustmentId,
      p_accept: accept,
    });
    if (error) throw error;
    return data;
  },

  async createIntent(accountKey: string, input: CheckoutInput) {
    if (environment.dataMode === 'mock') return mockCreateIntent(accountKey, input);
    const { data, error } = await getSupabaseClient().rpc('create_booking_payment_intent', {
      p_booking_id: input.bookingId,
      p_idempotency_key: input.idempotencyKey,
      p_payment_method: input.method,
    });
    if (error) throw error;
    const { data: authoritative, error: readError } = await getSupabaseClient().rpc(
      'get_my_booking_payment',
      { p_booking_id: input.bookingId },
    );
    if (readError) throw readError;
    const next = parsePayment({
      ...(authoritative as object),
      attemptId: (data as Record<string, unknown>).attemptId,
    });
    if (!next) throw new Error('Payment intent response was invalid');
    return next;
  },

  async getReceipt(accountKey: string, bookingId: string): Promise<PaymentReceipt | null> {
    if (environment.dataMode === 'mock') {
      const payment = await this.getBookingPayment(accountKey, bookingId);
      if (!payment || !['paid', 'partially_refunded', 'refunded'].includes(payment.status)) return null;
      const store = await readMock();
      const stored = store.payments.find(item => item.paymentId === payment.paymentId);
      return {
        transactionReference: payment.reference,
        bookingReference: payment.bookingId,
        service: stored?.service ?? '',
        providerName: stored?.providerName ?? '',
        timestamp: payment.paidAt ?? payment.createdAt,
        approvedJobPriceMinor: payment.snapshot.approvedJobPriceMinor,
        promotionMinor: payment.snapshot.promotionMinor,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        paymentStatus: payment.status,
        refundedMinor: payment.refundedMinor,
      };
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_booking_receipt', { p_booking_id: bookingId });
    if (error) throw error;
    return data as PaymentReceipt | null;
  },

  simulatePayment: mockSimulatePayment,

  async confirmCashCollected(accountKey: string, providerId: string, bookingId: string, idempotencyKey: string) {
    if (environment.dataMode === 'mock') {
      return atomic(async () => {
        const store = await readMock();
        const payment = store.payments.find(item =>
          item.accountKey === accountKey && item.providerId === providerId && item.bookingId === bookingId,
        );
        if (!payment || payment.paymentMethod !== 'cash') throw new Error('Cash payment not found');
        if (payment.status === 'awaiting_payment') payment.status = 'pending';
        await writeMock(store, 'financial_booking_payments');
        await createMockNotification('cash_collection_reported', bookingId, providerId, idempotencyKey);
        return payment;
      });
    }
    const { data, error } = await getSupabaseClient().rpc('confirm_cash_collected', {
      p_booking_id: bookingId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data as { paymentId: string; status: BookingPayment['status'] };
  },

  async respondCashCollection(accountKey: string, bookingId: string, confirmed: boolean, idempotencyKey: string) {
    if (environment.dataMode === 'mock') {
      return atomic(async () => {
        const store = await readMock();
        const payment = store.payments.find(item => item.accountKey === accountKey && item.bookingId === bookingId);
        if (!payment || payment.paymentMethod !== 'cash' || payment.status !== 'pending') {
          throw new Error('Cash payment is not awaiting confirmation');
        }
        payment.status = confirmed ? 'paid' : 'failed';
        payment.paidAt = confirmed ? new Date().toISOString() : undefined;
        if (confirmed) {
          const debt = mockDebt(store, accountKey, payment.providerId);
          debt.cashMinor = addMinor(
            debt.cashMinor,
            calculateCommissionMinor(payment.snapshot.approvedJobPriceMinor),
          );
        }
        await writeMock(store, 'financial_booking_payments');
        await createMockNotification(
          confirmed ? 'cash_collection_confirmed' : 'cash_collection_disputed',
          bookingId,
          payment.providerId,
          idempotencyKey,
        );
        return payment;
      });
    }
    const { data, error } = await getSupabaseClient().rpc('respond_cash_collection', {
      p_booking_id: bookingId,
      p_confirmed: confirmed,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data as { paymentId: string; status: BookingPayment['status'] };
  },

  async simulateRefund(accountKey: string, paymentId: string) {
    if (environment.dataMode !== 'mock') throw new Error('Development action is mock-only');
    return atomic(async () => {
      const store = await readMock();
      const payment = store.payments.find(item => item.accountKey === accountKey && item.paymentId === paymentId);
      if (!payment || !['paid', 'partially_refunded'].includes(payment.status)) throw new Error('Payment cannot be refunded');
      payment.status = 'refunded';
      payment.refundedMinor = payment.amountMinor;
      payment.refundStatus = 'succeeded';
      const earning = store.earnings.find(item => item.paymentId === payment.paymentId);
      if (earning) {
        earning.status = 'reversed';
        earning.netMinor = '0';
        earning.grossMinor = '0';
        earning.commissionMinor = '0';
        earning.heldMinor = '0';
      }
      await writeMock(store, 'financial_booking_payments');
      await createMockNotification('refund_completed', payment.bookingId, payment.providerId, `mock-refund:${paymentId}`);
      return payment;
    });
  },

  async getEarnings(accountKey: string, providerId: string): Promise<EarningsSummary> {
    if (environment.dataMode === 'mock') return mockSummary(await readMock(), accountKey, providerId);
    const { data, error } = await getSupabaseClient().rpc('get_my_provider_earnings');
    if (error) throw error;
    return data as EarningsSummary;
  },

  async makeEarningsAvailable(accountKey: string, providerId: string) {
    if (environment.dataMode !== 'mock') throw new Error('Development action is mock-only');
    return atomic(async () => {
      const store = await readMock();
      for (const earning of store.earnings) {
        if (earning.accountKey === accountKey && earning.providerId === providerId && earning.status === 'pending_release') {
          releaseMockEarning(store, earning);
        }
      }
      await writeMock(store, 'provider_earnings_ledger');
      await createMockNotification('earnings_available', undefined, providerId, `mock-earnings:${providerId}:available`);
      return mockSummary(store, accountKey, providerId);
    });
  },

  async simulateEarningHold(accountKey: string, providerId: string, earningId: string, hold: boolean) {
    if (environment.dataMode !== 'mock') throw new Error('Development action is mock-only');
    return atomic(async () => {
      const store = await readMock();
      const earning = store.earnings.find(item =>
        item.id === earningId && item.accountKey === accountKey && item.providerId === providerId,
      );
      if (!earning) throw new Error('Earning not found');
      if (hold) {
        if (earning.status !== 'available') throw new Error('Earning is not available');
        earning.heldMinor = earning.netMinor;
        earning.status = 'held_for_dispute';
      } else {
        earning.heldMinor = '0';
        earning.status = 'available';
      }
      await writeMock(store, 'provider_earnings_ledger');
      await createMockNotification(
        hold ? 'earnings_held' : 'earnings_released',
        earning.bookingId,
        providerId,
        `mock-hold:${earningId}:${hold}`,
      );
      return earning;
    });
  },

  async listDestinations(accountKey: string, providerId: string): Promise<PayoutDestination[]> {
    if (environment.dataMode === 'mock') {
      return (await readMock()).destinations.filter(item => item.accountKey === accountKey && item.providerId === providerId);
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_payout_destinations');
    if (error) throw error;
    return (data ?? []) as PayoutDestination[];
  },

  async saveDestination(
    accountKey: string,
    providerId: string,
    input: { type: PayoutDestinationType; label: string; value: string; idempotencyKey: string },
  ): Promise<PayoutDestination> {
    if (environment.dataMode === 'mock') {
      return atomic(async () => {
        const store = await readMock();
        const fingerprint = input.value.replace(/\s/g, '').toLowerCase();
        const duplicate = store.destinations.find(item =>
          item.accountKey === accountKey && item.providerId === providerId && item.fingerprint === fingerprint,
        );
        if (duplicate) return duplicate;
        const normalized = input.value.replace(/[^0-9A-Za-z]/g, '');
        if (normalized.length < 6) throw new Error('Invalid payout destination');
        for (const item of store.destinations) {
          if (item.accountKey === accountKey && item.providerId === providerId) item.isPreferred = false;
        }
        const destination: MockDestination = {
          id: identifier('mock-destination'),
          accountKey,
          providerId,
          fingerprint,
          type: input.type,
          label: input.label,
          maskedValue: `•••• ${normalized.slice(-4)}`,
          isPreferred: true,
          status: 'active',
        };
        store.destinations.unshift(destination);
        await Storage.setItem(KEY, JSON.stringify(store));
        return destination;
      });
    }
    const { data, error } = await getSupabaseClient().rpc('save_my_payout_destination', {
      p_destination_type: input.type,
      p_display_label: input.label,
      p_destination_value: input.value,
      p_ownership_confirmed: true,
      p_make_preferred: true,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    return data as PayoutDestination;
  },

  async requestWithdrawal(
    accountKey: string,
    providerId: string,
    amountMinor: MinorAmount,
    destinationId: string,
    idempotencyKey: string,
  ): Promise<WithdrawalRequest> {
    if (environment.dataMode === 'mock') {
      return atomic(async () => {
        const store = await readMock();
        const duplicate = store.withdrawals.find(item =>
          item.accountKey === accountKey && item.providerId === providerId && item.idempotencyKey === idempotencyKey,
        );
        if (duplicate) return duplicate;
        const summary = mockSummary(store, accountKey, providerId);
        if (
          minorValue(amountMinor) < 20_000n
          || compareMinor(amountMinor, summary.availableMinor) > 0
        ) {
          throw new Error('Withdrawal exceeds available earnings');
        }
        const destination = store.destinations.find(item =>
          item.id === destinationId && item.accountKey === accountKey && item.providerId === providerId,
        );
        if (!destination) throw new Error('Payout destination not found');
        const withdrawal: MockWithdrawal = {
          id: identifier('mock-withdrawal'),
          accountKey,
          providerId,
          idempotencyKey,
          amountMinor,
          currency: 'EGP',
          status: 'requested',
          reference: identifier('WSW').toUpperCase(),
          destinationMasked: destination.maskedValue,
          requestedAt: new Date().toISOString(),
        };
        store.withdrawals.unshift(withdrawal);
        await writeMock(store, 'provider_withdrawal_requests');
        await createMockNotification('withdrawal_requested', undefined, providerId, `mock-withdrawal:${withdrawal.id}:requested`);
        return withdrawal;
      });
    }
    const { data, error } = await getSupabaseClient().rpc('request_provider_withdrawal', {
      p_amount_minor: amountMinor,
      p_payout_destination_id: destinationId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data as WithdrawalRequest;
  },

  async listWithdrawals(accountKey: string, providerId: string): Promise<WithdrawalRequest[]> {
    if (environment.dataMode === 'mock') {
      return (await readMock()).withdrawals.filter(item => item.accountKey === accountKey && item.providerId === providerId);
    }
    const { data, error } = await getSupabaseClient()
      .from('provider_withdrawal_requests')
      .select('id,amount_minor,currency,status,provider_reference,destination_masked_snapshot,requested_at')
      .order('requested_at', { ascending: false });
    if (error) throw error;
    return data.map(row => ({
      id: row.id,
      amountMinor: String(row.amount_minor),
      currency: row.currency as 'EGP',
      status: row.status as WithdrawalRequest['status'],
      reference: row.provider_reference,
      destinationMasked: row.destination_masked_snapshot,
      requestedAt: row.requested_at,
    }));
  },

  async simulateWithdrawal(accountKey: string, providerId: string, id: string, outcome: 'paid' | 'failed') {
    if (environment.dataMode !== 'mock') throw new Error('Development action is mock-only');
    return atomic(async () => {
      const store = await readMock();
      const withdrawal = store.withdrawals.find(item =>
        item.id === id && item.accountKey === accountKey && item.providerId === providerId,
      );
      if (!withdrawal) throw new Error('Withdrawal not found');
      if (!['paid', 'failed'].includes(withdrawal.status)) withdrawal.status = outcome;
      await writeMock(store, 'provider_withdrawal_requests');
      await createMockNotification(
        outcome === 'paid' ? 'withdrawal_paid' : 'withdrawal_failed',
        undefined,
        providerId,
        `mock-withdrawal:${id}:${outcome}`,
      );
      return withdrawal;
    });
  },
};
