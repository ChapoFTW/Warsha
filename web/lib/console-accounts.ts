/**
 * What an operator is allowed to see about one account.
 *
 * Two RPCs, two shapes, both transcribed from their `jsonb_build_object(...)`:
 *
 *   get_staff_customer_overview(uuid)  requires `view_safe_customer_profile`
 *   get_staff_worker_overview(uuid)    requires `view_safe_worker_profile`
 *
 * Three properties of these functions decide how the console may present them,
 * and none of them is optional.
 *
 * **Contact details are a separate capability.** Both functions return an empty
 * `contact` object unless the caller holds `view_contact_details`, and both say
 * so explicitly in `contactVisible`. The console therefore never renders an
 * empty phone field as though the account had no phone — it says the field is
 * not available to this role, which is a different fact.
 *
 * **Money is a separate capability again.** `financial` is populated only for
 * `view_financial_ledger`, with `financialVisible` alongside it.
 *
 * **Opening an overview is logged.** Both call `private.staff_log_access`
 * before returning. Looking at somebody is itself an action with a record, so
 * the console must not prefetch overviews to make the interface feel quick —
 * that would write access entries nobody asked for.
 *
 * Amounts arrive as **minor units in strings**, because a piastre count large
 * enough to matter does not survive a JavaScript number. They stay strings all
 * the way to `formatMinor`.
 */

export type AccountRestrictions = {
  marketplaceRemoved: boolean;
  communicationRestricted: boolean;
  reviewRestricted: boolean;
  paymentHold: boolean;
};

export type BookingCounts = {
  total: number;
  completed: number;
  cancelled: number;
  /** Customers only: the server does not compute it for workers. */
  active: number | null;
};

export type CustomerOverview = {
  kind: 'customer';
  userId: string;
  displayName: string | null;
  preferredLanguage: string | null;
  accountStatus: string;
  createdAt: string | null;
  trustLevel: string;
  restrictions: AccountRestrictions;
  bookings: BookingCounts;
  disputesOpened: number;
  reportsFiled: number;
  reportsAgainst: number;
  supportCases: number;
  contact: { phone?: string | null; email?: string | null };
  contactVisible: boolean;
};

export type WorkerCertificate = {
  id: string;
  type: string;
  status: string;
  expiresAt: string | null;
};

export type WorkerVerification = {
  status: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
};

export type WorkerFinancial = {
  currency: string;
  pendingMinor: string;
  availableMinor: string;
  paidOutMinor: string;
  heldMinor: string;
  openWithdrawals: number;
  activeHolds: number;
};

export type WorkerOverview = {
  kind: 'worker';
  providerId: string;
  userId: string | null;
  displayName: string | null;
  professionKey: string | null;
  primaryCategoryId: string | null;
  onboardingStatus: string | null;
  isPublished: boolean;
  isVerified: boolean;
  isAvailable: boolean;
  accountStatus: string;
  ratingAverage: number | null;
  reviewCount: number;
  completedJobs: number;
  verification: WorkerVerification | null;
  certificates: WorkerCertificate[];
  bookings: BookingCounts;
  trustLevel: string;
  reportsAgainst: number;
  financial: WorkerFinancial | null;
  financialVisible: boolean;
  contact: { phone?: string | null };
  contactVisible: boolean;
};

export type AccountOverview = CustomerOverview | WorkerOverview;

const asRecord = (value: unknown): Record<string, unknown> =>
  (value && typeof value === 'object' ? value as Record<string, unknown> : {});

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const count = (value: unknown): number => (typeof value === 'number' ? value : 0);
const flag = (value: unknown): boolean => value === true;

/**
 * `restrictions` arrives through `jsonb_strip_nulls`, so a restriction that is
 * not in force is *absent* rather than false. Absence is read as "not
 * restricted", which is what the server means by leaving it out.
 */
function parseRestrictions(value: unknown): AccountRestrictions {
  const raw = asRecord(value);
  return {
    marketplaceRemoved: flag(raw.marketplaceRemoved),
    communicationRestricted: flag(raw.communicationRestricted),
    reviewRestricted: flag(raw.reviewRestricted),
    paymentHold: flag(raw.paymentHold),
  };
}

function parseBookings(value: unknown, withActive: boolean): BookingCounts {
  const raw = asRecord(value);
  return {
    total: count(raw.total),
    completed: count(raw.completed),
    cancelled: count(raw.cancelled),
    active: withActive ? count(raw.active) : null,
  };
}

export function parseCustomerOverview(value: unknown): CustomerOverview | null {
  const raw = asRecord(value);
  if (typeof raw.userId !== 'string') return null;
  const contactVisible = flag(raw.contactVisible);
  const contact = asRecord(raw.contact);
  return {
    kind: 'customer',
    userId: raw.userId,
    displayName: text(raw.displayName),
    preferredLanguage: text(raw.preferredLanguage),
    accountStatus: text(raw.accountStatus) ?? 'active',
    createdAt: text(raw.createdAt),
    trustLevel: text(raw.trustLevel) ?? 'good_standing',
    restrictions: parseRestrictions(raw.restrictions),
    bookings: parseBookings(raw.bookings, true),
    disputesOpened: count(raw.disputesOpened),
    reportsFiled: count(raw.reportsFiled),
    reportsAgainst: count(raw.reportsAgainst),
    supportCases: count(raw.supportCases),
    // Never fabricated when hidden: the fields stay absent so the console can
    // say "your role cannot see this" rather than render a blank as a fact.
    contact: contactVisible
      ? { phone: text(contact.phone), email: text(contact.email) }
      : {},
    contactVisible,
  };
}

export function parseWorkerOverview(value: unknown): WorkerOverview | null {
  const raw = asRecord(value);
  if (typeof raw.providerId !== 'string') return null;
  const financialVisible = flag(raw.financialVisible);
  const contactVisible = flag(raw.contactVisible);
  const money = asRecord(raw.financial);
  const contact = asRecord(raw.contact);
  const verification = raw.verification ? asRecord(raw.verification) : null;

  return {
    kind: 'worker',
    providerId: raw.providerId,
    userId: text(raw.userId),
    displayName: text(raw.displayName),
    professionKey: text(raw.professionKey),
    primaryCategoryId: text(raw.primaryCategoryId),
    onboardingStatus: text(raw.onboardingStatus),
    isPublished: flag(raw.isPublished),
    isVerified: flag(raw.isVerified),
    isAvailable: flag(raw.isAvailable),
    accountStatus: text(raw.accountStatus) ?? 'active',
    ratingAverage: typeof raw.ratingAverage === 'number' ? raw.ratingAverage : null,
    reviewCount: count(raw.reviewCount),
    completedJobs: count(raw.completedJobs),
    verification: verification
      ? {
        status: text(verification.status),
        submittedAt: text(verification.submittedAt),
        reviewedAt: text(verification.reviewedAt),
        expiresAt: text(verification.expiresAt),
      }
      : null,
    certificates: Array.isArray(raw.certificates)
      ? raw.certificates.flatMap((entry) => {
        const row = asRecord(entry);
        if (typeof row.id !== 'string') return [];
        return [{
          id: row.id,
          type: text(row.type) ?? '',
          status: text(row.status) ?? '',
          expiresAt: text(row.expiresAt),
        }];
      })
      : [],
    bookings: parseBookings(raw.bookings, false),
    trustLevel: text(raw.trustLevel) ?? 'good_standing',
    reportsAgainst: count(raw.reportsAgainst),
    financial: financialVisible
      ? {
        currency: text(money.currency) ?? 'EGP',
        // Kept as strings. `sum(...)::text` on the server exists precisely so
        // these survive the trip; parsing them into numbers here would undo it.
        pendingMinor: text(money.pendingMinor) ?? '0',
        availableMinor: text(money.availableMinor) ?? '0',
        paidOutMinor: text(money.paidOutMinor) ?? '0',
        heldMinor: text(money.heldMinor) ?? '0',
        openWithdrawals: count(money.openWithdrawals),
        activeHolds: count(money.activeHolds),
      }
      : null,
    financialVisible,
    contact: contactVisible ? { phone: text(contact.phone) } : {},
    contactVisible,
  };
}

/** Which lookup result kinds have an overview behind them. */
export function overviewKindFor(kind: string): 'customer' | 'worker' | null {
  if (kind === 'account') return 'customer';
  if (kind === 'worker') return 'worker';
  return null;
}

/**
 * Refusals the overview RPCs raise, separated from "this account does not
 * exist".
 *
 * `require_staff_capability` raises 42501 and `P0002` means the row was not
 * found. Conflating them would tell an operator an account is missing when in
 * fact their role may not look at it — which is how somebody concludes a
 * record was deleted and escalates the wrong thing.
 */
export type OverviewFailure = 'refused' | 'not_found' | 'failed';

export function classifyOverviewError(message: string | undefined): OverviewFailure {
  const value = message ?? '';
  if (/not found/i.test(value)) return 'not_found';
  if (/capability|permission|denied|not permitted|staff/i.test(value)) return 'refused';
  return 'failed';
}
