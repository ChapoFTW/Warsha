import Storage from 'expo-sqlite/kv-store';

import type { WarshaNotification } from './notification-types';

export type MockReminderSimulation = {
  id: string;
  notificationId: string;
  resourceId?: string;
  policyKey: string;
  state: 'simulation_pending' | 'simulation_suppressed';
  attemptCount: 0;
  maxAttempts: 2;
  nextEvaluationAt: string;
  createdAt: string;
  updatedAt: string;
};

const reminderRules: Record<string, { policyKey: string; delayHours: number }> = {
  quote_selected: { policyKey: 'worker_confirmation', delayHours: 2 },
  booking_confirmed: { policyKey: 'booking_approaching', delayHours: 24 },
  payment_required: { policyKey: 'payment_pending', delayHours: 24 },
  operation_waiting_for_approval: { policyKey: 'inspection_pending', delayHours: 12 },
  operation_additional_work_requested: { policyKey: 'inspection_pending', delayHours: 12 },
  operation_additional_work_needs_clarification: { policyKey: 'inspection_pending', delayHours: 12 },
  operation_ready_for_inspection: { policyKey: 'inspection_pending', delayHours: 12 },
  operation_inspection: { policyKey: 'inspection_pending', delayHours: 12 },
  operation_return_visit_requested: { policyKey: 'inspection_pending', delayHours: 12 },
  verification_rejected: { policyKey: 'verification_correction', delayHours: 72 },
  verification_resubmission_requested: { policyKey: 'verification_correction', delayHours: 72 },
  verification_expired: { policyKey: 'verification_correction', delayHours: 72 },
  dispute_evidence_requested: { policyKey: 'dispute_deadline', delayHours: 24 },
  dispute_response_required: { policyKey: 'dispute_deadline', delayHours: 24 },
  review_unlocked: { policyKey: 'review_opportunity', delayHours: 48 },
};

function key(accountId: string) { return `warsha:notification-reminder-simulations:v1:${accountId}`; }

async function read(accountId: string): Promise<MockReminderSimulation[]> {
  const raw = await Storage.getItem(key(accountId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as MockReminderSimulation[] : [];
  } catch {
    return [];
  }
}

async function write(accountId: string, rows: MockReminderSimulation[]) {
  await Storage.setItem(key(accountId), JSON.stringify(rows));
}

export function mockReminderPolicy(eventKey: string) {
  const rule = reminderRules[eventKey];
  return rule ? { ...rule, maxAttempts: 2 as const } : undefined;
}

export async function recordMockReminderSimulation(accountId: string, notification: WarshaNotification) {
  const policy = mockReminderPolicy(notification.eventKey);
  if (!policy) return;
  const rows = await read(accountId);
  if (rows.some(row => row.notificationId === notification.id && row.policyKey === policy.policyKey)) return;
  const createdAt = new Date().toISOString();
  rows.push({
    id: `mock-reminder-${notification.id}-${policy.policyKey}`,
    notificationId: notification.id,
    resourceId: notification.resourceId,
    policyKey: policy.policyKey,
    state: 'simulation_pending',
    attemptCount: 0,
    maxAttempts: policy.maxAttempts,
    nextEvaluationAt: new Date(Date.now() + policy.delayHours * 3_600_000).toISOString(),
    createdAt,
    updatedAt: createdAt,
  });
  await write(accountId, rows);
}

export async function reconcileMockReminderSimulations(accountId: string, notifications: WarshaNotification[]) {
  const rows = await read(accountId);
  if (!rows.length) return;
  const openById = new Map(notifications.map(item => [item.id, item.requiredAction ? item.actionOpen : true]));
  const now = new Date().toISOString();
  let changed = false;
  for (const row of rows) {
    if (row.state === 'simulation_pending' && openById.get(row.notificationId) === false) {
      row.state = 'simulation_suppressed';
      row.updatedAt = now;
      changed = true;
    }
  }
  if (changed) await write(accountId, rows);
}

const resolvedPolicies: Record<string, string[]> = {
  marketplace_booking_confirmed: ['worker_confirmation'], quote_confirmation_expired: ['worker_confirmation'],
  payment_confirmed: ['payment_pending'], payment_successful: ['payment_pending'], online_payment_confirmed: ['payment_pending'], refund_completed: ['payment_pending'],
  booking_completed: ['booking_approaching', 'inspection_pending'], booking_cancelled: ['booking_approaching', 'inspection_pending', 'review_opportunity'], booking_refunded: ['booking_approaching', 'inspection_pending', 'review_opportunity'], booking_rejected: ['booking_approaching', 'inspection_pending'],
  operation_completed: ['booking_approaching', 'inspection_pending'], operation_inspection_approved: ['inspection_pending'],
  dispute_resolved: ['dispute_deadline'], dispute_closed: ['dispute_deadline'], dispute_cancelled: ['dispute_deadline'],
  verification_approved: ['verification_correction'], worker_profile_discoverable: ['worker_profile_incomplete'], review_submitted: ['review_opportunity'],
};

export async function suppressMockReminderSimulations(accountId: string, resolutionEvent: string, resourceId?: string) {
  const policies = resolvedPolicies[resolutionEvent];
  if (!policies) return;
  const rows = await read(accountId); const now = new Date().toISOString(); let changed = false;
  for (const row of rows) {
    if (row.state === 'simulation_pending' && policies.includes(row.policyKey) && (!resourceId || row.resourceId === resourceId)) {
      row.state = 'simulation_suppressed'; row.updatedAt = now; changed = true;
    }
  }
  if (changed) await write(accountId, rows);
}

export async function listMockReminderSimulations(accountId: string) { return read(accountId); }
