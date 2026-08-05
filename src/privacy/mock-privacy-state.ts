/**
 * WPS-022 Mock privacy state.
 *
 * Mock mirrors the SERVER'S MODEL, not a convenient simplification of it. In
 * particular Mock also:
 *
 *   - preserves bookings, payments and consent history through anonymization;
 *   - refuses to decline a required consent purpose;
 *   - blocks a deletion behind an active booking;
 *   - appends a withdrawal rather than editing the earlier grant.
 *
 * If Mock let a deletion sail through where the server blocks it, every screen
 * built against Mock would be built against a product that does not exist.
 *
 * No Supabase call, no network call, no external provider — in either
 * direction. A Supabase failure never falls back to this module, and this
 * module never reaches for Supabase.
 */

import type {
  ConsentEntry,
  ConsentPurposeKey,
  DeletionBlockerCode,
  DeletionRequest,
  DeletionStatus,
  ExportManifest,
  ExportRequest,
  HistoryScope,
  PrivacyCategory,
  PrivacyOverview,
} from './privacy-types';

const COOLING_OFF_HOURS = 168;
const EXPORT_TTL_HOURS = 72;

const categories: PrivacyCategory[] = [
  { key: 'public_listing', labelEn: 'Public listing', labelAr: 'بيانات معروضة للجميع', exportable: true },
  { key: 'account_private', labelEn: 'Account information', labelAr: 'بيانات الحساب', exportable: true },
  { key: 'participant_private', labelEn: 'Shared with the other party', labelAr: 'بيانات مشتركة مع الطرف الآخر', exportable: true },
  { key: 'identity_sensitive', labelEn: 'Identity documents', labelAr: 'مستندات الهوية', exportable: false },
  { key: 'financial_authoritative', labelEn: 'Payment and earnings records', labelAr: 'سجلات المدفوعات والأرباح', exportable: true },
  { key: 'trust_restricted', labelEn: 'Safety and trust records', labelAr: 'سجلات الأمان', exportable: false },
  { key: 'support_restricted', labelEn: 'Support and dispute records', labelAr: 'سجلات الدعم والنزاعات', exportable: false },
  { key: 'credential_secret', labelEn: 'Credentials and secrets', labelAr: 'بيانات الدخول', exportable: false },
  { key: 'operational_audit', labelEn: 'Operational and audit records', labelAr: 'سجلات التشغيل', exportable: false },
  { key: 'derived_personalization', labelEn: 'Search and viewing history', labelAr: 'سجل البحث والمشاهدة', exportable: true },
  { key: 'ephemeral', labelEn: 'Temporary signals', labelAr: 'إشارات مؤقتة', exportable: false },
];

const purposes: Omit<ConsentEntry, 'granted' | 'decidedAt' | 'decidedVersion'>[] = [
  { purposeKey: 'terms_of_service', required: true, currentVersion: '2026-08-07', titleEn: 'Terms of service', titleAr: 'شروط الاستخدام', explanationEn: 'The agreement that lets you use Warsha.', explanationAr: 'الاتفاق اللي بيسمحلك تستخدم ورشة.' },
  { purposeKey: 'privacy_notice', required: true, currentVersion: '2026-08-07', titleEn: 'Privacy notice', titleAr: 'إشعار الخصوصية', explanationEn: 'What we collect and why. Acknowledging it is not agreement to anything optional.', explanationAr: 'بنجمع إيه وليه. الموافقة على الإشعار مش موافقة على أي حاجة اختيارية.' },
  { purposeKey: 'service_communication', required: true, currentVersion: '2026-08-07', titleEn: 'Booking messages', titleAr: 'رسائل الحجز', explanationEn: 'Messages about your bookings. These cannot be turned off while a booking is live.', explanationAr: 'رسائل خاصة بحجوزاتك. مش ممكن توقفها وانت عندك حجز شغال.' },
  { purposeKey: 'marketing_communication', required: false, currentVersion: '2026-08-07', titleEn: 'Offers and news', titleAr: 'عروض وأخبار', explanationEn: 'Occasional messages about offers. Off unless you turn it on.', explanationAr: 'رسائل من وقت للتاني عن العروض. مقفولة غير لما تفتحها بنفسك.' },
  { purposeKey: 'referral_communication', required: false, currentVersion: '2026-08-07', titleEn: 'Invite updates', titleAr: 'تحديثات الدعوات', explanationEn: 'Tells you when someone you invited finishes their first job.', explanationAr: 'بتقولك لما حد دعيته يخلّص أول شغلانة.' },
  { purposeKey: 'diagnostics', required: false, currentVersion: '2026-08-07', titleEn: 'Crash and performance reports', titleAr: 'تقارير الأعطال والأداء', explanationEn: 'Helps us find faults. Contains no message content and no addresses.', explanationAr: 'بتساعدنا نلاقي الأعطال. مفيهاش محتوى رسايل ولا عناوين.' },
  { purposeKey: 'location_use', required: false, currentVersion: '2026-08-07', titleEn: 'Location', titleAr: 'الموقع', explanationEn: 'Used only while you are choosing an address. Warsha never tracks you in the background.', explanationAr: 'بيتستخدم وانت بتختار العنوان بس. ورشة مش بتتابعك في الخلفية أبداً.' },
  { purposeKey: 'identity_verification', required: false, currentVersion: '2026-08-07', titleEn: 'Identity check', titleAr: 'التحقق من الهوية', explanationEn: 'For workers: we review your documents so customers can trust you.', explanationAr: 'للصنايعي: بنراجع مستنداتك عشان العملاء يثقوا فيك.' },
];

type ConsentDecision = { granted: boolean; decidedAt: string; version: string; withdrawnAt: string | null };

type AccountState = {
  deactivated: boolean;
  /** Append-only, exactly like the server table. */
  consentLedger: { purposeKey: ConsentPurposeKey; decision: ConsentDecision }[];
  deletion: DeletionRequest | null;
  exports: ExportRequest[];
  searches: number;
  views: number;
  /** Simulated commitments that block a deletion. */
  blockers: DeletionBlockerCode[];
  anonymized: boolean;
  /** Preserved through anonymization, because somebody else relies on them. */
  bookings: number;
  payments: number;
};

const accounts = new Map<string, AccountState>();
let sequence = 0;

function stateFor(accountKey: string): AccountState {
  let state = accounts.get(accountKey);
  if (!state) {
    state = {
      deactivated: false,
      consentLedger: [
        { purposeKey: 'terms_of_service', decision: { granted: true, decidedAt: '2026-07-01T09:00:00.000Z', version: '2026-08-07', withdrawnAt: null } },
        { purposeKey: 'privacy_notice', decision: { granted: true, decidedAt: '2026-07-01T09:00:00.000Z', version: '2026-08-07', withdrawnAt: null } },
        { purposeKey: 'service_communication', decision: { granted: true, decidedAt: '2026-07-01T09:00:00.000Z', version: '2026-08-07', withdrawnAt: null } },
      ],
      deletion: null,
      exports: [],
      searches: 4,
      views: 3,
      blockers: [],
      anonymized: false,
      bookings: 2,
      payments: 2,
    };
    accounts.set(accountKey, state);
  }
  return state;
}

/** Test seam. Mock state is per-account and must not leak between accounts. */
export function resetMockPrivacyState(): void {
  accounts.clear();
  sequence = 0;
}

/** Test seam: give an account a commitment so the blocked path can be exercised. */
export function setMockBlockers(accountKey: string, blockers: DeletionBlockerCode[]): void {
  stateFor(accountKey).blockers = [...blockers];
}

export function mockPrivacyOverview(accountKey: string): PrivacyOverview {
  const state = stateFor(accountKey);
  return {
    available: true,
    exportAvailable: true,
    deletionAvailable: true,
    policyVersion: '2026-08-07',
    coolingOffHours: COOLING_OFF_HOURS,
    deactivated: state.deactivated,
    categories,
    deletionRequest: state.deletion,
  };
}

export function mockConsents(accountKey: string): ConsentEntry[] {
  const state = stateFor(accountKey);
  return purposes.map(purpose => {
    // Latest decision wins, exactly as the server's lateral join does.
    const decisions = state.consentLedger.filter(row => row.purposeKey === purpose.purposeKey);
    const latest = decisions.length ? decisions[decisions.length - 1].decision : null;
    return {
      ...purpose,
      granted: latest?.granted ?? false,
      decidedAt: latest?.decidedAt ?? null,
      decidedVersion: latest?.version ?? null,
    };
  });
}

export function mockRecordConsent(
  accountKey: string,
  purposeKey: ConsentPurposeKey,
  granted: boolean,
): void {
  const state = stateFor(accountKey);
  const purpose = purposes.find(row => row.purposeKey === purposeKey);
  if (!purpose) throw new Error('Unknown consent purpose');
  // The server refuses this, so Mock refuses it too. A Mock that allowed it
  // would let a screen ship an "off" toggle for something that is never off.
  if (purpose.required && !granted) throw new Error('This purpose cannot be declined');

  if (!granted) {
    for (const row of state.consentLedger) {
      if (row.purposeKey === purposeKey && row.decision.granted && !row.decision.withdrawnAt) {
        row.decision.withdrawnAt = new Date().toISOString();
      }
    }
  }
  state.consentLedger.push({
    purposeKey,
    decision: { granted, decidedAt: new Date().toISOString(), version: purpose.currentVersion, withdrawnAt: null },
  });
}

/** How many decisions this account has recorded. Append-only, like the server. */
export function mockConsentLedgerLength(accountKey: string): number {
  return stateFor(accountKey).consentLedger.length;
}

export function mockClearHistory(
  accountKey: string,
  scope: HistoryScope,
): { searchesCleared: number; viewsCleared: number } {
  const state = stateFor(accountKey);
  let searchesCleared = 0;
  let viewsCleared = 0;
  if (scope === 'all' || scope === 'searches') {
    searchesCleared = state.searches;
    state.searches = 0;
  }
  if (scope === 'all' || scope === 'views') {
    viewsCleared = state.views;
    state.views = 0;
  }
  return { searchesCleared, viewsCleared };
}

export function mockSetDeactivated(accountKey: string, deactivated: boolean): boolean {
  const state = stateFor(accountKey);
  state.deactivated = deactivated;
  // Deactivation deletes nothing. Asserted by the regression suite.
  return deactivated;
}

export function mockRequestDeletion(accountKey: string, reasonCode: string | null): DeletionRequest {
  const state = stateFor(accountKey);
  // A retry returns the standing request rather than opening a second one.
  if (state.deletion && state.deletion.cancellable) return state.deletion;

  void reasonCode;
  const blockers = [...state.blockers];
  const status: DeletionStatus = blockers.includes('legal_hold')
    ? 'legal_hold'
    : blockers.length > 0
      ? 'blocked'
      : 'cooling_off';

  sequence += 1;
  const now = Date.now();
  state.deletion = {
    id: `deletion-${sequence}`,
    status,
    requestedAt: new Date(now).toISOString(),
    coolingOffEndsAt: new Date(now + COOLING_OFF_HOURS * 3_600_000).toISOString(),
    blockerCodes: blockers,
    cancellable: true,
  };
  return state.deletion;
}

export function mockCancelDeletion(accountKey: string): boolean {
  const state = stateFor(accountKey);
  if (!state.deletion || !state.deletion.cancellable) return false;
  state.deletion = { ...state.deletion, status: 'cancelled', cancellable: false };
  return true;
}

function buildManifest(accountKey: string): ExportManifest {
  const state = stateFor(accountKey);
  return {
    generatedAt: new Date().toISOString(),
    environment: 'mock',
    subject: accountKey,
    sections: [
      { key: 'profile', format: 'json', rows: 1 },
      { key: 'addresses', format: 'json', rows: 1 },
      { key: 'bookings', format: 'csv', rows: state.bookings },
      { key: 'reviews_written', format: 'csv', rows: 1 },
      { key: 'messages', format: 'csv', rows: 6 },
      { key: 'support_cases', format: 'csv', rows: 0 },
      { key: 'payments', format: 'csv', rows: state.payments },
      { key: 'consents', format: 'json', rows: state.consentLedger.length },
      { key: 'search_history', format: 'csv', rows: state.searches },
      { key: 'referrals', format: 'csv', rows: 0 },
    ],
    excluded: [
      "other participants' contact details",
      'staff notes and internal case history',
      'the identity of anyone who reported a safety concern',
      'fraud and trust signal internals',
      'payment provider secrets and full card or bank numbers',
    ],
  };
}

export function mockRequestExport(accountKey: string): ExportRequest {
  const state = stateFor(accountKey);
  const now = Date.now();
  const open = state.exports.find(
    row => Date.parse(row.expiresAt) > now
      && (row.status === 'requested' || row.status === 'manifest_ready' || row.status === 'ready'),
  );
  // One open export at a time, matching the server's cap.
  if (open) return open;

  sequence += 1;
  const request: ExportRequest = {
    id: `export-${sequence}`,
    // `manifest_ready`, not `ready`: Mock does not pretend a file exists that
    // no worker has produced. The screen says "being prepared" in both modes.
    status: 'manifest_ready',
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + EXPORT_TTL_HOURS * 3_600_000).toISOString(),
    manifest: buildManifest(accountKey),
    downloadCount: 0,
  };
  state.exports = [request, ...state.exports];
  return request;
}

export function mockExports(accountKey: string): ExportRequest[] {
  return [...stateFor(accountKey).exports];
}

/**
 * Mock anonymization, mirroring the server's list exactly.
 *
 * Personalization goes; bookings, payments and consent history stay. Test seam
 * only — no client path reaches it, in either mode.
 */
export function mockAnonymize(accountKey: string): {
  bookings: number;
  payments: number;
  consents: number;
  searches: number;
  views: number;
} {
  const state = stateFor(accountKey);
  state.searches = 0;
  state.views = 0;
  state.anonymized = true;
  return {
    bookings: state.bookings,
    payments: state.payments,
    consents: state.consentLedger.length,
    searches: state.searches,
    views: state.views,
  };
}

export function mockIsAnonymized(accountKey: string): boolean {
  return stateFor(accountKey).anonymized;
}
