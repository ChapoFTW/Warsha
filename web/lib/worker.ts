/**
 * Browser projections of the worker authorities already consumed by mobile.
 *
 * There is deliberately no business state here. These functions only turn the
 * JSON returned by the existing owner-scoped RPCs and booking RLS into values
 * that a page can render without guessing at missing fields.
 */

export type WorkerService = { serviceId: string; name: string };
export type WorkerArea = { governorate: string; district: string; radiusKm: number };

export type WorkerProfile = {
  id: string;
  status: string;
  displayName: string;
  avatarPath: string;
  profession: string;
  about: string;
  experienceYears: number;
  experienceSummary: string;
  specialties: string[];
  languages: string[];
  categoryIds: string[];
  services: WorkerService[];
  areas: WorkerArea[];
  serviceRadiusKm: number;
  isAvailable: boolean;
  emergencyAvailable: boolean;
  temporaryUnavailableUntil: string | null;
  agreementAccepted: boolean;
};

export type QuoteInvitation = {
  id: string;
  requestId: string;
  status: string;
  flowKind: string;
  categoryId: string;
  serviceId: string | null;
  issueDescription: string;
  scheduleKind: string;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  area: { governorate: string; district: string };
  paymentCompatibility: string;
  expiresAt: string;
  invitedAt: string;
  quoteId: string | null;
};

export type WorkerQuote = {
  id: string;
  requestId: string;
  status: string;
  currentRevision: number;
  priceMinor: string;
  currency: string;
  proposedStartAt: string | null;
  etaMinutes: number | null;
  estimatedDurationMinutes: number;
  message: string;
  laborIncluded: boolean;
  materialsInclusion: string;
  materialsExplanation: string;
  warrantyDays: number | null;
  supportedPaymentMethods: string[];
  revisions: { revision: number; reason: string; createdAt: string }[];
};

export type WorkerBooking = {
  id: string;
  status: string;
  customerName: string;
  serviceName: string;
  issueDescription: string;
  notes: string;
  scheduledDate: string;
  scheduledTime: string;
  address: string;
  estimatedPrice: string;
  finalPrice: string | null;
  proposedDate: string | null;
  proposedTime: string | null;
  providerRescheduleNote: string | null;
  history: { status: string; at: string; note: string | null }[];
};

export type Earning = {
  id: string;
  bookingId: string;
  service: string;
  date: string;
  grossMinor: string;
  commissionMinor: string;
  netMinor: string;
  debtOffsetMinor: string;
  heldMinor: string;
  currency: string;
  status: string;
};

export type EarningsSummary = {
  providerId: string;
  currency: string;
  availableMinor: string;
  pendingMinor: string;
  paidOutMinor: string;
  heldMinor: string;
  cashCommissionDueMinor: string;
  recoverableAdjustmentMinor: string;
  minimumWithdrawalMinor: string;
  withdrawalFeeMinor: string;
  withdrawalsEnabled: boolean;
  cashPaymentsRestricted: boolean;
  transactions: Earning[];
};

export type PayoutDestination = {
  id: string;
  type: string;
  label: string;
  maskedValue: string;
  isPreferred: boolean;
  status: string;
};

export type Withdrawal = {
  id: string;
  amountMinor: string;
  currency: string;
  status: string;
  reference: string;
  destinationMasked: string;
  requestedAt: string;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};
const string = (value: unknown): string => value == null ? '' : String(value);
const optional = (value: unknown): string | null => value == null || value === '' ? null : String(value);
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

export function parseWorkerProfile(value: unknown): WorkerProfile | null {
  const row = record(value);
  if (typeof row.id !== 'string') return null;
  const services = Array.isArray(row.services) ? row.services : [];
  const areas = Array.isArray(row.areas) ? row.areas : [];
  return {
    id: row.id,
    status: string(row.status),
    displayName: string(row.displayName),
    avatarPath: string(row.avatarPath),
    profession: string(row.profession),
    about: string(row.about),
    experienceYears: number(row.experienceYears),
    experienceSummary: string(row.experienceSummary),
    specialties: strings(row.specialties),
    languages: strings(row.languages),
    categoryIds: strings(row.categoryIds),
    services: services.flatMap((item) => {
      const service = record(item);
      return typeof service.serviceId === 'string'
        ? [{ serviceId: service.serviceId, name: string(service.name) }]
        : [];
    }),
    areas: areas.flatMap((item) => {
      const area = record(item);
      return typeof area.governorate === 'string'
        ? [{ governorate: area.governorate, district: string(area.district), radiusKm: number(area.radiusKm) }]
        : [];
    }),
    serviceRadiusKm: number(row.serviceRadiusKm) || 250,
    isAvailable: row.isAvailable === true,
    emergencyAvailable: row.emergencyAvailable === true,
    temporaryUnavailableUntil: optional(row.temporaryUnavailableUntil),
    agreementAccepted: row.agreementAccepted === true,
  };
}

export function parseInvitations(value: unknown): QuoteInvitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    if (typeof row.id !== 'string' || typeof row.requestId !== 'string') return [];
    const area = record(row.area);
    return [{
      id: row.id,
      requestId: row.requestId,
      status: string(row.status),
      flowKind: string(row.flowKind),
      categoryId: string(row.categoryId),
      serviceId: optional(row.serviceId),
      issueDescription: string(row.issueDescription),
      scheduleKind: string(row.scheduleKind),
      requestedStartAt: optional(row.requestedStartAt),
      requestedEndAt: optional(row.requestedEndAt),
      area: { governorate: string(area.governorate), district: string(area.district) },
      paymentCompatibility: string(row.paymentCompatibility),
      expiresAt: string(row.expiresAt),
      invitedAt: string(row.invitedAt),
      quoteId: optional(row.quoteId),
    }];
  });
}

export function parseWorkerQuote(value: unknown): WorkerQuote | null {
  const row = record(value);
  if (typeof row.id !== 'string') return null;
  const revisions = Array.isArray(row.revisions) ? row.revisions : [];
  return {
    id: row.id,
    requestId: string(row.requestId),
    status: string(row.status),
    currentRevision: number(row.currentRevision),
    priceMinor: string(row.priceMinor),
    currency: string(row.currency) || 'EGP',
    proposedStartAt: optional(row.proposedStartAt),
    etaMinutes: row.etaMinutes == null ? null : number(row.etaMinutes),
    estimatedDurationMinutes: number(row.estimatedDurationMinutes),
    message: string(row.message),
    laborIncluded: row.laborIncluded === true,
    materialsInclusion: string(row.materialsInclusion),
    materialsExplanation: string(row.materialsExplanation),
    warrantyDays: row.warrantyDays == null ? null : number(row.warrantyDays),
    supportedPaymentMethods: strings(row.supportedPaymentMethods),
    revisions: revisions.map((item) => {
      const revision = record(item);
      return {
        revision: number(revision.revision),
        reason: string(revision.reason),
        createdAt: string(revision.createdAt),
      };
    }),
  };
}

export function parseWorkerBookings(value: unknown): WorkerBooking[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    if (typeof row.id !== 'string') return [];
    const history = Array.isArray(row.booking_status_history) ? row.booking_status_history : [];
    return [{
      id: row.id,
      status: string(row.status),
      customerName: string(row.customer_name_snapshot),
      serviceName: string(row.service_name_snapshot),
      issueDescription: string(row.issue_description),
      notes: string(row.notes),
      scheduledDate: string(row.scheduled_date),
      scheduledTime: string(row.scheduled_time),
      address: string(row.address_snapshot),
      estimatedPrice: string(row.estimated_price_egp),
      finalPrice: row.final_price_egp == null ? null : string(row.final_price_egp),
      proposedDate: optional(row.proposed_scheduled_date),
      proposedTime: optional(row.proposed_scheduled_time),
      providerRescheduleNote: optional(row.provider_reschedule_note),
      history: history.flatMap((entry) => {
        const event = record(entry);
        if (typeof event.status !== 'string' || typeof event.created_at !== 'string') return [];
        return [{ status: event.status, at: event.created_at, note: optional(record(event.metadata).note) }];
      }).sort((left, right) => Date.parse(left.at) - Date.parse(right.at)),
    }];
  });
}

export function parseEarnings(value: unknown): EarningsSummary | null {
  const row = record(value);
  if (typeof row.providerId !== 'string') return null;
  const transactions = Array.isArray(row.transactions) ? row.transactions : [];
  return {
    providerId: row.providerId,
    currency: string(row.currency) || 'EGP',
    availableMinor: string(row.availableMinor),
    pendingMinor: string(row.pendingMinor),
    paidOutMinor: string(row.paidOutMinor),
    heldMinor: string(row.heldMinor),
    cashCommissionDueMinor: string(row.cashCommissionDueMinor),
    recoverableAdjustmentMinor: string(row.recoverableAdjustmentMinor),
    minimumWithdrawalMinor: string(row.minimumWithdrawalMinor),
    withdrawalFeeMinor: string(row.withdrawalFeeMinor),
    withdrawalsEnabled: row.withdrawalsEnabled === true,
    cashPaymentsRestricted: row.cashPaymentsRestricted === true,
    transactions: transactions.flatMap((item) => {
      const entry = record(item);
      if (typeof entry.id !== 'string') return [];
      return [{
        id: entry.id,
        bookingId: string(entry.bookingId),
        service: string(entry.service),
        date: string(entry.date),
        grossMinor: string(entry.grossMinor),
        commissionMinor: string(entry.commissionMinor),
        netMinor: string(entry.netMinor),
        debtOffsetMinor: string(entry.debtOffsetMinor),
        heldMinor: string(entry.heldMinor),
        currency: string(entry.currency) || 'EGP',
        status: string(entry.status),
      }];
    }),
  };
}

export function parseDestinations(value: unknown): PayoutDestination[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    return typeof row.id === 'string' ? [{
      id: row.id,
      type: string(row.type),
      label: string(row.label),
      maskedValue: string(row.maskedValue),
      isPreferred: row.isPreferred === true,
      status: string(row.status),
    }] : [];
  });
}

export function parseWithdrawals(value: unknown): Withdrawal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    return typeof row.id === 'string' ? [{
      id: row.id,
      amountMinor: string(row.amount_minor ?? row.amountMinor),
      currency: string(row.currency) || 'EGP',
      status: string(row.status),
      reference: string(row.provider_reference ?? row.reference),
      destinationMasked: string(row.destination_masked_snapshot ?? row.destinationMasked),
      requestedAt: string(row.requested_at ?? row.requestedAt),
    }] : [];
  });
}

export const MARKETPLACE_MANAGED_RADIUS_KM = 250;
export const WORKER_FINISHED = new Set(['completed', 'cancelled', 'rejected', 'refunded', 'no_show']);
export const WORKER_RESCHEDULABLE = new Set(['pending_provider_approval', 'accepted', 'confirmed']);
export const WORKER_NEXT_STATUS: Record<string, string | null> = {
  accepted: 'confirmed',
  confirmed: 'provider_on_the_way',
  provider_on_the_way: 'provider_arrived',
  provider_arrived: 'job_started',
  job_started: 'work_in_progress',
  work_in_progress: 'completed',
};

export function newWorkerKey(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}:${id}`;
}

export function egpFromMinor(value: string, locale: 'en' | 'ar'): string {
  let minor = 0n;
  try { minor = BigInt(value || '0'); } catch { /* malformed server value renders zero */ }
  const major = Number(minor) / 100;
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency', currency: 'EGP', maximumFractionDigits: 2,
  }).format(major);
}
