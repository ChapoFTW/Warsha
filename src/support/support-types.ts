/**
 * WPS-019 — Customer Support, Help Center & Knowledge Management.
 *
 * These types describe the EXISTING support architecture as WPS-019 extends it.
 * A support case is a `public.support_tickets` row; it is not a conversation, a
 * dispute, or an abuse report, and it never becomes one — escalation stores a
 * pointer to the authoritative record instead.
 */

export const supportLocales = ['en', 'ar'] as const;
export type SupportLocale = typeof supportLocales[number];

/** Categories are the WPS-017 set, unchanged. */
export const supportCategories = [
  'account_access', 'booking_help', 'worker_onboarding', 'verification_help',
  'payment_question', 'withdrawal_question', 'technical_issue', 'app_feedback', 'other',
] as const;
export type SupportCategory = typeof supportCategories[number];

/** Statuses are the WPS-017 set, unchanged. */
export const supportStatuses = [
  'open', 'in_progress', 'waiting_participant', 'escalated', 'resolved', 'closed',
] as const;
export type SupportStatus = typeof supportStatuses[number];

export type SupportPriority = 'urgent' | 'high' | 'normal' | 'low';
export type SupportRequesterMode = 'customer' | 'worker';

/**
 * The surface a customer was on when they asked for help. It drives which
 * articles the Help Center offers first, and it is recorded on the case so
 * staff know the context without asking.
 */
export const supportSurfaces = [
  'help_center', 'booking', 'payment', 'verification', 'portfolio', 'notification',
  'review', 'dispute', 'marketplace', 'chat', 'settings', 'account', 'onboarding',
  'earnings', 'other',
] as const;
export type SupportSurface = typeof supportSurfaces[number];

/** A pointer to an authoritative domain record. Never a copy of one. */
export const supportLinkedTypes = [
  'booking', 'payment', 'dispute', 'verification', 'review',
  'marketplace_request', 'conversation', 'withdrawal', 'provider_profile',
] as const;
export type SupportLinkedType = typeof supportLinkedTypes[number];

export const helpCategoryKeys = [
  'getting_started', 'booking_help', 'payment_help', 'worker_help', 'dispute_help',
  'verification_help', 'account_help', 'notification_help', 'chat_help', 'review_help',
  'trust_help', 'worker_earnings_help',
] as const;
export type HelpCategoryKey = typeof helpCategoryKeys[number];

export type HelpAudience = 'customer' | 'worker' | 'all';

export type HelpCategorySummary = {
  categoryKey: string;
  title: string;
  summary: string;
  icon: string;
  audience: HelpAudience;
  surfaces: string[];
  articleCount: number;
};

export type HelpArticleSummary = {
  slug: string;
  categoryKey: string;
  title: string;
  summary: string;
  tags?: string[];
  viewCount?: number;
  /** `exact` came from full-text search; `approximate` came from spelling tolerance. */
  match?: 'exact' | 'approximate';
};

export type HelpArticle = {
  slug: string;
  categoryKey: string;
  status: 'draft' | 'published' | 'archived';
  locale: SupportLocale;
  version: number;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  audience: HelpAudience;
  updatedAt: string;
  helpfulCount: number;
  notHelpfulCount: number;
  myFeedback?: boolean | null;
  related: HelpArticleSummary[];
};

export type HelpCenter = {
  locale: SupportLocale;
  surface: SupportSurface | null;
  categories: HelpCategorySummary[];
  suggested: HelpArticleSummary[];
  popular: HelpArticleSummary[];
  generatedAt: string;
};

export type HelpCategoryDetail = {
  categoryKey: string;
  title: string;
  summary: string;
  icon: string;
  audience: HelpAudience;
  articles: HelpArticleSummary[];
};

export type HelpSearchMode = 'exact' | 'approximate' | 'empty' | 'too_short';

export type HelpSearchResult = {
  query: string;
  locale: SupportLocale;
  mode: HelpSearchMode;
  results: HelpArticleSummary[];
  resultCount: number;
};

export type HelpSearchSuggestions = {
  locale: SupportLocale;
  recent: string[];
  /** Suppressed below five distinct accounts, so one person cannot set the list. */
  popular: string[];
};

export type SupportMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  attachmentId?: string | null;
  createdAt: string;
};

export type SupportAttachment = {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
};

export type SupportEvent = {
  id: string;
  action: string;
  toStatus: string;
  actorRole: 'participant' | 'staff' | 'system';
  createdAt: string;
};

export type SupportCaseSummary = {
  caseId: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  createdAt: string;
  lastReplyAt?: string | null;
  messages: SupportMessage[];
};

export type SupportCaseDetail = {
  caseId: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  locale: SupportLocale;
  originSurface: SupportSurface;
  linkedType?: SupportLinkedType | null;
  linkedId?: string | null;
  requesterMode: SupportRequesterMode;
  createdAt: string;
  lastReplyAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  reopenedCount: number;
  /**
   * Every one of these is decided by the server and read by the client. The app
   * never computes a reopen window or an attachment limit for itself.
   */
  canReply: boolean;
  canReopen: boolean;
  canAttach: boolean;
  surveyAvailable: boolean;
  satisfactionScore?: number | null;
  messages: SupportMessage[];
  attachments: SupportAttachment[];
  events: SupportEvent[];
};

export type OpenSupportCaseInput = {
  category: SupportCategory;
  subject: string;
  body: string;
  idempotencyKey: string;
  linkedType?: SupportLinkedType;
  linkedId?: string;
  originSurface: SupportSurface;
  locale: SupportLocale;
};

export type StaffSupportCase = {
  caseId: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  requesterMode: SupportRequesterMode;
  locale: SupportLocale;
  originSurface: SupportSurface;
  linkedType?: SupportLinkedType | null;
  linkedId?: string | null;
  assignedTo?: string | null;
  createdAt: string;
  lastReplyAt?: string | null;
  firstResponseDueAt?: string | null;
  firstResponseAt?: string | null;
  resolutionDueAt?: string | null;
  attachmentCount: number;
  reopenedCount: number;
  firstResponseBreached: boolean;
  mergedIntoId?: string | null;
};

export type StaffSupportQueue = {
  generatedAt: string;
  counts: {
    open: number;
    inProgress: number;
    waitingParticipant: number;
    escalated: number;
    mine: number;
    breachedFirstResponse: number;
  };
  cases: StaffSupportCase[];
};

export type SupportMacro = {
  macroKey: string;
  category: string;
  locale: SupportLocale;
  title: string;
  body: string;
  suggestedResolution?: string | null;
};

export type SupportResolutionReason = {
  reasonKey: string;
  label: string;
  requiresNote: boolean;
};

export type SupportSlaEntry = {
  priority: SupportPriority;
  firstResponseHours: number;
  resolutionHours: number;
};

export type StaffSupportToolkit = {
  macros: SupportMacro[];
  resolutionReasons: SupportResolutionReason[];
  slaPolicy: SupportSlaEntry[];
};

export const supportAttachmentMimeTypes = [
  'image/jpeg', 'image/png', 'image/heic', 'application/pdf',
] as const;
export type SupportAttachmentMimeType = typeof supportAttachmentMimeTypes[number];

export const supportAttachmentMaxBytes = 8 * 1024 * 1024;
export const supportAttachmentMaxPerCase = 10;
export const supportAttachmentBucket = 'support-attachments';
export const supportReopenWindowDays = 14;
export const supportMaxReopens = 3;

/**
 * The upload path is the security boundary, so it is built in one place and
 * asserted by both the storage policy and the registration RPC. A name that is
 * not exactly this shape is refused by the server, whatever the client sends.
 */
export function supportAttachmentPath(userId: string, caseId: string, fileId: string, extension: string): string {
  return `${userId}/${caseId}/${fileId}.${extension}`;
}

const extensionByMime: Record<SupportAttachmentMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export function supportAttachmentExtension(mimeType: string): string | null {
  return extensionByMime[mimeType as SupportAttachmentMimeType] ?? null;
}

/** Which help surface a screen should ask the Help Center to prioritize. */
export function helpSurfaceForRoute(pathname: string): SupportSurface {
  if (pathname.startsWith('/booking')) return 'booking';
  if (pathname.startsWith('/conversation')) return 'chat';
  if (pathname.startsWith('/provider-verification')) return 'verification';
  if (pathname.startsWith('/provider-portfolio') || pathname.startsWith('/provider-certificates')) return 'portfolio';
  if (pathname.startsWith('/provider-earnings')) return 'earnings';
  if (pathname.startsWith('/marketplace-request') || pathname.startsWith('/worker-quote')) return 'marketplace';
  if (pathname.startsWith('/notification')) return 'notification';
  if (pathname.startsWith('/support')) return 'settings';
  return 'help_center';
}
