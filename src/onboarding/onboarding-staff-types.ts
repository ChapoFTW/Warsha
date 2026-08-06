/**
 * WPS-023 staff vetting contracts.
 *
 * A separate module from `onboarding-types` on purpose. A worker screen and a
 * reviewer screen have different needs and different risks, and one shared type
 * is how a field that only staff should see ends up rendered in a worker view
 * because it happened to be on the object already.
 *
 * What is deliberately absent from `StaffVettingCase`:
 *   * the subject's user id, name, email or phone — the queue is a work list,
 *     not a directory of people
 *   * any storage path — a reviewer asks for a document reference, which logs
 *     the access
 *   * any extraction confidence — internal, never leaves the server
 *   * any offence text — it exists only in a private table no RPC returns
 */

import type { WorkerState } from './onboarding-types';

export type StaffVettingCase = {
  /** Opaque, stable, and not reversible to an account. */
  subjectRef: string;
  workerState: WorkerState;
  waitingSince: string | null;
  hasCertificate: boolean;
  priority: 'normal' | 'high';
};

export type StaffVettingQueue = {
  cases: StaffVettingCase[];
  count: number;
};

export type VettingDecision =
  | 'start_identity_review'
  | 'start_certificate_review'
  | 'request_correction'
  | 'escalate_manual_review'
  | 'approve'
  | 'activate'
  | 'reject'
  | 'suspend'
  | 'reinstate';

/** Decisions that require recorded evidence before the server will accept them. */
export const ADVERSE_DECISIONS: ReadonlySet<VettingDecision> = new Set<VettingDecision>([
  'reject',
  'suspend',
]);

export function requiresEvidence(decision: VettingDecision): boolean {
  return ADVERSE_DECISIONS.has(decision);
}

/**
 * The capability each decision needs. Mirrored from the migration so the UI can
 * disable what a reviewer cannot do, rather than letting them compose a request
 * that the server will refuse after they have typed a reason.
 *
 * This is a convenience, never an authorization boundary: the server checks the
 * same mapping and is the only check that counts.
 */
export const DECISION_CAPABILITY: Record<VettingDecision, string> = {
  start_identity_review: 'review_identity_verification',
  start_certificate_review: 'review_criminal_records',
  request_correction: 'review_worker_vetting',
  escalate_manual_review: 'review_worker_vetting',
  approve: 'review_criminal_records',
  activate: 'activate_worker',
  reject: 'reject_worker_application',
  suspend: 'reject_worker_application',
  reinstate: 'activate_worker',
};

export type DocumentKind = 'national_id_front' | 'national_id_back' | 'criminal_record';

export type DocumentReference = {
  bucket: string;
  path: string;
  mimeType: string | null;
  expiresInSeconds: number;
};

export const emptyVettingQueue: StaffVettingQueue = { cases: [], count: 0 };
