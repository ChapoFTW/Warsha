export const DISPUTE_REASONS = [
  'work_incomplete', 'poor_quality', 'property_damage', 'incorrect_additional_work',
  'pricing_disagreement', 'warranty_disagreement', 'worker_never_arrived',
  'customer_unavailable', 'safety_issue', 'other',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_STATES = [
  'draft', 'submitted', 'waiting_customer', 'waiting_worker', 'waiting_staff',
  'under_review', 'resolved', 'closed', 'rejected', 'cancelled',
] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];
export type DisputeRole = 'customer' | 'worker' | 'staff';
export type DisputeResponse = 'respond' | 'accept_responsibility' | 'contest';

export type DisputeEvent = {
  id: string;
  state: DisputeState;
  eventType: string;
  actor: DisputeRole | 'system';
  note?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DisputeEvidence = {
  id: string;
  uploaderRole: 'customer' | 'worker';
  mimeType: string;
  byteSize: number;
  fileName: string;
  url?: string;
  createdAt: string;
};

export type DisputeResolution = {
  type: 'booking_upheld' | 'partial_compensation' | 'return_visit' | 'warranty_work' | 'no_action' | 'administrative_action' | 'other';
  summary: string;
  financialAction: 'none' | 'pre_release_refund' | 'post_release_case';
  returnVisitId?: string;
};

export type DisputeEvidenceSources = {
  bookingTimeline: number;
  attachments: number;
  messages: number;
  operationEvents: number;
  progressPhotos: number;
  additionalWork: number;
  returnVisits: number;
  reviews: number;
  reviewReplies: number;
  noShowReports: number;
  warrantyRecorded: boolean;
};

export type BookingDispute = {
  id: string;
  bookingId: string;
  viewerRole: DisputeRole;
  openedByRole: 'customer' | 'worker';
  reason: DisputeReason;
  state: DisputeState;
  description: string;
  eligibleUntil?: string;
  createdAt: string;
  submittedAt?: string;
  reviewStartedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  resolution?: DisputeResolution;
  events: DisputeEvent[];
  evidence: DisputeEvidence[];
  evidenceSources: DisputeEvidenceSources;
};

export type DisputeUpload = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  byteSize?: number | null;
  clientId: string;
};

export const activeDisputeStates: readonly DisputeState[] = [
  'draft', 'submitted', 'waiting_customer', 'waiting_worker', 'waiting_staff', 'under_review',
];

export function disputeIdempotency(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}
