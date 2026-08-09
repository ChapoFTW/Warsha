import type { Booking, BookingStatus } from '@/src/bookings/booking-types';
import type { WorkerState } from '@/src/onboarding/onboarding-types';
import type { VerificationStatus } from '@/src/verification/verification-types';

export type WorkerDashboardPriority =
  | { kind: 'suspended' }
  | { kind: 'active_job'; jobId: string }
  | { kind: 'new_requests'; count: number }
  | { kind: 'complete_verification' }
  | { kind: 'under_review' }
  | { kind: 'available' }
  | { kind: 'unavailable' };

const ACTIVE_JOB_STATUSES: BookingStatus[] = [
  'confirmed',
  'provider_on_the_way',
  'provider_arrived',
  'job_started',
  'work_in_progress',
  'disputed',
];

const ACTIONABLE_VERIFICATION: VerificationStatus[] = [
  'not_started',
  'draft',
  'rejected',
  'requires_resubmission',
  'expired',
];

const REVIEWING_VERIFICATION: VerificationStatus[] = ['submitted', 'under_review'];

export function countNewWorkerRequests(jobs: Booking[]): number {
  return jobs.filter(job => job.status === 'pending_provider_approval').length;
}

export function countActiveWorkerJobs(jobs: Booking[]): number {
  return jobs.filter(job => ACTIVE_JOB_STATUSES.includes(job.status)).length;
}

export function workerDashboardPriority(input: {
  workerState: WorkerState | null;
  verificationStatus: VerificationStatus | null;
  jobs: Booking[];
  available: boolean;
}): WorkerDashboardPriority {
  if (input.workerState === 'suspended') return { kind: 'suspended' };

  const active = input.jobs.find(job => ACTIVE_JOB_STATUSES.includes(job.status));
  if (active) return { kind: 'active_job', jobId: active.id };

  const newRequests = countNewWorkerRequests(input.jobs);
  if (newRequests > 0) return { kind: 'new_requests', count: newRequests };

  if (
    !input.verificationStatus
    || ACTIONABLE_VERIFICATION.includes(input.verificationStatus)
    || input.workerState === 'correction_required'
  ) {
    return { kind: 'complete_verification' };
  }

  if (REVIEWING_VERIFICATION.includes(input.verificationStatus)) {
    return { kind: 'under_review' };
  }

  return input.available ? { kind: 'available' } : { kind: 'unavailable' };
}
