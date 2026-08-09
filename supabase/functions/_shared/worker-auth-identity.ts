export const WORKER_AUTH_DOMAIN = 'auth.warsha.invalid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EGYPTIAN_MOBILE = /^\+20(10|11|12|15)[0-9]{8}$/;

export function workerSyntheticEmail(credentialId: string): string {
  if (!UUID_V4.test(credentialId)) throw new Error('A UUIDv4 credential identifier is required.');
  return `worker.${credentialId.toLowerCase().replaceAll('-', '')}@${WORKER_AUTH_DOMAIN}`;
}

export function normalizeWorkerPhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, '');
  if (compact.startsWith('+20')) return compact;
  if (compact.startsWith('0020')) return `+${compact.slice(2)}`;
  if (compact.startsWith('20') && compact.length === 12) return `+${compact}`;
  if (compact.startsWith('0')) return `+20${compact.slice(1)}`;
  return compact;
}

export function isWorkerPhone(value: string): boolean {
  return EGYPTIAN_MOBILE.test(value);
}
