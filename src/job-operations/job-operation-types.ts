import type { BookingStatus } from '@/src/bookings/booking-types';

export const OPERATION_STATES = [
  'confirmed',
  'traveling',
  'arrived',
  'waiting_for_customer',
  'started',
  'waiting_for_approval',
  'waiting_for_parts',
  'paused',
  'resumed',
  'returning_later',
  'finished',
  'customer_inspection',
  'completed',
] as const;
export type OperationState = (typeof OPERATION_STATES)[number];
export type OperationRole = 'customer' | 'worker';
export type OperationActor = OperationRole | 'system' | 'staff';
export type ProgressPhase = 'before' | 'during' | 'after';
export type DelayReason = 'running_late' | 'traffic' | 'waiting_for_parts' | 'weather' | 'need_customer' | 'need_helper' | 'need_tomorrow';
export type OperationUpdateKey =
  | 'worker_on_my_way'
  | 'worker_arrived'
  | 'worker_waiting_outside'
  | 'worker_started'
  | 'worker_needs_parts'
  | 'worker_return_tomorrow'
  | 'worker_running_late'
  | 'worker_finished'
  | 'customer_arriving_shortly'
  | 'customer_inspected'
  | 'customer_approved_additional_work';
export type InspectionResponse = 'approve' | 'request_clarification' | 'report_remaining_issue';
export type AdditionalWorkDecision = 'pending' | 'approved' | 'rejected' | 'needs_clarification';
export type ReturnVisitStatus = 'requested' | 'accepted' | 'declined' | 'in_progress' | 'completed';

export type OperationEvent = {
  id: string;
  bookingId: string;
  sectionNumber: number;
  state: OperationState;
  eventType: string;
  actor: OperationActor;
  actorId?: string;
  note?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ProgressMedia = {
  id: string;
  bookingId: string;
  sectionNumber: number;
  uploaderId: string;
  phase: ProgressPhase;
  mimeType: string;
  byteSize: number;
  sortOrder: number;
  caption?: string;
  url?: string;
  createdAt: string;
};

export type AdditionalWorkRequest = {
  id: string;
  bookingId: string;
  sectionNumber: number;
  explanation: string;
  decision: AdditionalWorkDecision;
  estimatedAdjustmentMinor?: number;
  priceAdjustmentId?: string;
  photoIds: string[];
  createdAt: string;
  decidedAt?: string;
};

export type WarrantyCommitment = {
  kind: 'none' | '30_days' | '60_days' | '90_days' | 'custom';
  days?: number;
  startsAt?: string;
  endsAt?: string;
};

export type ReturnVisit = {
  id: string;
  bookingId: string;
  sectionNumber: number;
  reason: string;
  status: ReturnVisitStatus;
  requestedAt: string;
  respondedAt?: string;
  completedAt?: string;
};

export type JobOperation = {
  bookingId: string;
  currentState: OperationState;
  currentSection: number;
  workerChecklist: string[];
  customerChecklist: string[];
  warranty: WarrantyCommitment;
  events: OperationEvent[];
  media: ProgressMedia[];
  additionalWork: AdditionalWorkRequest[];
  returnVisits: ReturnVisit[];
  updatedAt: string;
};

export type ProgressUpload = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  phase: ProgressPhase;
  caption?: string;
  sortOrder: number;
  clientId: string;
};

export const operationTransitions: Readonly<Record<OperationState, readonly OperationState[]>> = {
  confirmed: ['traveling'],
  traveling: ['arrived', 'waiting_for_customer'],
  arrived: ['waiting_for_customer', 'started'],
  waiting_for_customer: ['arrived', 'started'],
  started: ['waiting_for_approval', 'waiting_for_parts', 'paused', 'finished'],
  waiting_for_approval: ['resumed', 'waiting_for_parts', 'paused'],
  waiting_for_parts: ['resumed', 'returning_later', 'paused'],
  paused: ['resumed', 'returning_later'],
  resumed: ['waiting_for_approval', 'waiting_for_parts', 'paused', 'finished'],
  returning_later: ['traveling', 'resumed'],
  finished: ['customer_inspection'],
  customer_inspection: ['completed', 'resumed'],
  completed: [],
};

export const operationBookingStatus: Record<OperationState, BookingStatus> = {
  confirmed: 'confirmed',
  traveling: 'provider_on_the_way',
  arrived: 'provider_arrived',
  waiting_for_customer: 'provider_arrived',
  started: 'job_started',
  waiting_for_approval: 'work_in_progress',
  waiting_for_parts: 'work_in_progress',
  paused: 'work_in_progress',
  resumed: 'work_in_progress',
  returning_later: 'work_in_progress',
  finished: 'work_in_progress',
  customer_inspection: 'work_in_progress',
  completed: 'completed',
};

export function operationStateFromBooking(status: BookingStatus): OperationState | undefined {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'provider_on_the_way') return 'traveling';
  if (status === 'provider_arrived') return 'arrived';
  if (status === 'job_started') return 'started';
  if (status === 'work_in_progress') return 'resumed';
  if (status === 'completed') return 'completed';
  return undefined;
}

export function canTransitionOperation(from: OperationState, to: OperationState) {
  return from !== to && operationTransitions[from].includes(to);
}

export const workerUpdates: readonly OperationUpdateKey[] = [
  'worker_on_my_way', 'worker_arrived', 'worker_waiting_outside', 'worker_started',
  'worker_needs_parts', 'worker_return_tomorrow', 'worker_running_late', 'worker_finished',
];
export const customerUpdates: readonly OperationUpdateKey[] = [
  'customer_arriving_shortly', 'customer_inspected', 'customer_approved_additional_work',
];

export function isRoleUpdate(role: OperationRole, key: OperationUpdateKey) {
  return (role === 'worker' ? workerUpdates : customerUpdates).includes(key);
}
