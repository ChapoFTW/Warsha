import type { User } from '@supabase/supabase-js';

import { isValidPhone, normalizePhone } from './phone-auth.ts';

export type SignInIdentity =
  | { kind: 'customer_email'; email: string }
  | { kind: 'worker_phone'; phone: string };

export function isValidCustomerEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 3 || email.length > 254 || /\s/.test(email)) return false;
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) return false;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return local.length <= 64
    && domain.length <= 253
    && domain.includes('.')
    && !domain.startsWith('.')
    && !domain.endsWith('.');
}

export function classifySignInIdentity(value: string): SignInIdentity | null {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    return isValidCustomerEmail(trimmed)
      ? { kind: 'customer_email', email: trimmed.toLowerCase() }
      : null;
  }
  const phone = normalizePhone(trimmed);
  return isValidPhone(phone) ? { kind: 'worker_phone', phone } : null;
}

export function isSyntheticWorkerIdentity(user: User | null | undefined): boolean {
  return user?.app_metadata?.worker_synthetic_identity === true
    || /^worker\.[0-9a-f]{32}@auth\.warsha\.invalid$/i.test(user?.email ?? '');
}

export function visibleContactEmail(user: User | null | undefined): string | null {
  if (!user || isSyntheticWorkerIdentity(user)) return null;
  return user.email ?? null;
}
