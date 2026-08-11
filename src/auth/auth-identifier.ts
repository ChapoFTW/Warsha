import { isValidPhone, normalizePhone } from './phone-auth.ts';

/**
 * The only part of an authenticated user this module needs.
 *
 * Declared structurally rather than imported from `@supabase/supabase-js`.
 * A Supabase `User` satisfies it, so every call site is unchanged — but the
 * module no longer depends on the SDK's types, and that matters because it is
 * shared: the web application imports it from outside its own package, where
 * the repository root's `node_modules` does not exist. A shared identity
 * helper that drags a vendor SDK behind it is a helper only one platform can
 * actually use.
 */
export type IdentifiableUser = {
  // The index signature matters: Supabase's own `UserAppMetadata` is an open
  // bag, and without it TypeScript treats this as a weak type that a real
  // `User` cannot satisfy.
  app_metadata?: { worker_synthetic_identity?: unknown; [key: string]: unknown } | null;
  email?: string | null;
};

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

export function isSyntheticWorkerIdentity(user: IdentifiableUser | null | undefined): boolean {
  return user?.app_metadata?.worker_synthetic_identity === true
    || /^worker\.[0-9a-f]{32}@auth\.warsha\.invalid$/i.test(user?.email ?? '');
}

export function visibleContactEmail(user: IdentifiableUser | null | undefined): string | null {
  if (!user || isSyntheticWorkerIdentity(user)) return null;
  return user.email ?? null;
}
