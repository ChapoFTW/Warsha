import { environment, supabaseTarget } from '../config/environment.ts';

import { SafeAuthError } from './auth-errors.ts';

type AuthSettings = { external?: { phone?: boolean } };

let cached: { available: boolean; expiresAt: number } | null = null;
let pending: Promise<boolean> | null = null;
const LOCAL_PHONE_FIXTURES = new Set(['+201000000008', '+201099221106']);

export function isLocalDevelopmentPhoneFixture(phone: string): boolean {
  return LOCAL_PHONE_FIXTURES.has(phone);
}

export function readPhoneAuthAvailability(settings: unknown): boolean {
  return (settings as AuthSettings | null)?.external?.phone === true;
}

async function loadPhoneAuthAvailability(): Promise<boolean> {
  if (!environment.supabaseUrl || !environment.supabaseAnonKey) throw new SafeAuthError('authConfigurationError');
  const response = await fetch(`${environment.supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: environment.supabaseAnonKey },
  });
  if (!response.ok) {
    const error = new Error('Auth capability check failed') as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = 'auth_capability_unavailable';
    throw error;
  }
  return readPhoneAuthAvailability(await response.json());
}

export async function assertPhoneAuthAvailable(phone?: string): Promise<void> {
  if (environment.dataMode === 'mock') return;
  if (supabaseTarget === 'local' && (!phone || !isLocalDevelopmentPhoneFixture(phone))) {
    throw new SafeAuthError('authInvalidPhone');
  }
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    if (!cached.available) throw new SafeAuthError('authPhoneUnavailable');
    return;
  }
  pending ??= loadPhoneAuthAvailability().finally(() => { pending = null; });
  const available = await pending;
  cached = { available, expiresAt: now + 5 * 60_000 };
  if (!available) throw new SafeAuthError('authPhoneUnavailable');
}

export function clearPhoneAuthCapabilityCacheForTests() {
  cached = null;
  pending = null;
}
