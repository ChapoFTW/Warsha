import type { BookingStatus } from '../bookings/booking-types.ts';
import type { Language } from '../i18n/translations.ts';
import type {
  MarketplaceRequestStatus,
  QuoteInvitation,
  QuoteStatus,
} from '../marketplace-intelligence/marketplace-types.ts';

/**
 * Product meaning for lifecycle badges. Components translate these roles into
 * the tokens available on their platform; lifecycle code never chooses a
 * colour. Metadata such as a trade or service deliberately never enters this
 * module and therefore remains neutral.
 */
export type LifecycleSemantic =
  | 'neutral'
  | 'active'
  | 'attention'
  | 'confirmed'
  | 'complete'
  | 'destructive'
  | 'expired';

export type LifecycleBadgeTone = 'neutral' | 'info' | 'warning' | 'success' | 'error';

export const MARKETPLACE_REQUEST_STATUSES = [
  'draft',
  'matching',
  'collecting_quotes',
  'customer_reviewing',
  'selection_pending_confirmation',
  'worker_confirmed',
  'converted_to_booking',
  'rescue_matching',
  'cancelled',
  'expired',
  'closed',
] as const satisfies readonly MarketplaceRequestStatus[];

const requestSemantics = {
  draft: 'neutral',
  matching: 'active',
  collecting_quotes: 'active',
  customer_reviewing: 'attention',
  selection_pending_confirmation: 'attention',
  worker_confirmed: 'confirmed',
  converted_to_booking: 'complete',
  rescue_matching: 'active',
  cancelled: 'destructive',
  expired: 'expired',
  closed: 'expired',
} as const satisfies Record<MarketplaceRequestStatus, LifecycleSemantic>;

const requestLabels = {
  en: {
    draft: 'Draft',
    matching: 'Finding workers',
    collecting_quotes: 'Collecting quotes',
    customer_reviewing: 'Reviewing quotes',
    selection_pending_confirmation: 'Waiting for worker confirmation',
    worker_confirmed: 'Worker confirmed',
    converted_to_booking: 'Booked',
    rescue_matching: 'Finding a replacement',
    cancelled: 'Cancelled',
    expired: 'Expired',
    closed: 'Closed',
  },
  ar: {
    draft: 'مسودة',
    matching: 'بندوّر على صنايعية',
    collecting_quotes: 'بنجمع عروض أسعار',
    customer_reviewing: 'راجع عروض الأسعار',
    selection_pending_confirmation: 'مستنيين تأكيد الصنايعي',
    worker_confirmed: 'الصنايعي أكّد',
    converted_to_booking: 'اتحجز',
    rescue_matching: 'بندوّر على بديل',
    cancelled: 'ملغي',
    expired: 'منتهي',
    closed: 'مقفول',
  },
  fr: {
    draft: 'Brouillon',
    matching: 'Recherche de professionnels',
    collecting_quotes: 'Réception des devis',
    customer_reviewing: 'Examen des devis',
    selection_pending_confirmation: 'En attente de confirmation du professionnel',
    worker_confirmed: 'Professionnel confirmé',
    converted_to_booking: 'Réservée',
    rescue_matching: 'Recherche d’un remplaçant',
    cancelled: 'Annulée',
    expired: 'Expirée',
    closed: 'Fermée',
  },
} as const satisfies Record<Language, Record<MarketplaceRequestStatus, string>>;

const bookingSemantics = {
  draft: 'neutral',
  pending_provider_approval: 'attention',
  accepted: 'confirmed',
  rejected: 'destructive',
  rescheduling_requested: 'attention',
  confirmed: 'confirmed',
  provider_on_the_way: 'active',
  provider_arrived: 'active',
  job_started: 'active',
  awaiting_quote_approval: 'attention',
  work_in_progress: 'active',
  awaiting_customer_confirmation: 'attention',
  completed: 'complete',
  disputed: 'attention',
  cancelled: 'destructive',
  refunded: 'expired',
  no_show: 'destructive',
} as const satisfies Record<BookingStatus, LifecycleSemantic>;

type InvitationStatus = QuoteInvitation['status'];
const invitationSemantics = {
  invited: 'active',
  viewed: 'active',
  quoted: 'confirmed',
  declined: 'destructive',
  withdrawn: 'expired',
  expired: 'expired',
  request_closed: 'expired',
  worker_ineligible: 'expired',
  accepted: 'complete',
} as const satisfies Record<InvitationStatus, LifecycleSemantic>;

const quoteSemantics = {
  submitted: 'active',
  revised: 'active',
  selected: 'confirmed',
  rejected: 'destructive',
  withdrawn: 'expired',
  expired: 'expired',
  invalidated_by_request_change: 'expired',
} as const satisfies Record<QuoteStatus, LifecycleSemantic>;

export function isMarketplaceRequestStatus(value: string): value is MarketplaceRequestStatus {
  return (MARKETPLACE_REQUEST_STATUSES as readonly string[]).includes(value);
}

export function requestLifecycleSemantic(status: string): LifecycleSemantic {
  return isMarketplaceRequestStatus(status) ? requestSemantics[status] : 'neutral';
}

export function bookingLifecycleSemantic(status: string): LifecycleSemantic {
  return status in bookingSemantics
    ? bookingSemantics[status as BookingStatus]
    : 'neutral';
}

export function invitationLifecycleSemantic(status: string): LifecycleSemantic {
  return status in invitationSemantics
    ? invitationSemantics[status as InvitationStatus]
    : 'neutral';
}

export function invitationIsActive(status: string): boolean {
  return status === 'invited' || status === 'viewed' || status === 'quoted';
}

export function partitionInvitationLifecycle<T extends { status: string }>(items: readonly T[]): {
  active: T[];
  history: T[];
} {
  return items.reduce<{ active: T[]; history: T[] }>((groups, item) => {
    groups[invitationIsActive(item.status) ? 'active' : 'history'].push(item);
    return groups;
  }, { active: [], history: [] });
}

export function quoteLifecycleSemantic(status: string): LifecycleSemantic {
  return status in quoteSemantics ? quoteSemantics[status as QuoteStatus] : 'neutral';
}

export function lifecycleBadgeTone(semantic: LifecycleSemantic): LifecycleBadgeTone {
  if (semantic === 'active') return 'info';
  if (semantic === 'attention') return 'warning';
  if (semantic === 'confirmed' || semantic === 'complete') return 'success';
  if (semantic === 'destructive') return 'error';
  return 'neutral';
}

export function marketplaceRequestStatusText(language: Language, status: string): string {
  if (isMarketplaceRequestStatus(status)) return requestLabels[language][status];
  return humanizeHistoricalStatus(status);
}

export function marketplaceRequestIsTerminal(status: string): boolean {
  return requestLifecycleSemantic(status) === 'destructive'
    || requestLifecycleSemantic(status) === 'expired'
    || status === 'converted_to_booking';
}

export function marketplaceRequestAcceptsQuoteActions(status: string): boolean {
  return status === 'matching'
    || status === 'collecting_quotes'
    || status === 'customer_reviewing'
    || status === 'rescue_matching';
}

export function humanizeHistoricalStatus(status: string): string {
  const safe = status.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!safe) return 'Unknown';
  return safe.charAt(0).toUpperCase() + safe.slice(1);
}
