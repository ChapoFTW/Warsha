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

/**
 * Practical email syntax. Not RFC 5322.
 *
 * The distinction is deliberate and worth stating, because "be more correct"
 * is the instinct that breaks this function. A full RFC implementation accepts
 * quoted local parts, comments in parentheses, bare IP-literal domains and
 * addresses no mail provider on earth will issue; it also takes a page of code
 * and is a well-known source of catastrophic backtracking. What a signup form
 * needs is the opposite: reject what is obviously a typo, before a round trip,
 * and never reject an address a real person actually has.
 *
 * So the rule is: everything a mailbox provider would plausibly issue passes,
 * and the specific shapes that are always a mistake fail.
 *
 * WHAT CHANGED, AND WHY IT MATTERED. The previous version checked that the
 * domain contained a dot and did not start or end with one. `hello@gmail..com`
 * satisfies all three, so the single most common typing mistake in an email
 * address — a doubled dot — went to Supabase, came back as a signup failure,
 * and was reported to the customer as though something had gone wrong at our
 * end. It also accepted a local part of `.`, a domain of `-.com`, and a
 * single-character top-level domain. Each is a typo; none is an address.
 *
 * NO DNS, NO MX, NO NETWORK. This runs on every keystroke of a signup form.
 * Whether a domain resolves is a question for the confirmation email, which
 * Warsha already sends and already requires.
 */
export function isValidCustomerEmail(value: string): boolean {
  const email = value.trim();
  // Whitespace anywhere is a paste accident, not an address. Checked before
  // anything else so `hello @gmail.com` fails for the reason it actually is.
  if (email.length < 6 || email.length > 254 || /\s/.test(email)) return false;

  // `lastIndexOf` rather than `indexOf`: an unquoted local part may not contain
  // `@`, so a second one is a defect, and splitting on the last occurrence
  // makes `a@b@c.com` fail on the local-part character rule below rather than
  // silently parsing as a valid address with a strange name.
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator === email.length - 1) return false;
  if (email.indexOf('@') !== separator) return false;

  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);

  // --- Local part ---------------------------------------------------------
  // The unquoted "dot-atom" characters, which is every address a provider
  // issues. A dot may separate atoms but may not lead, trail or double.
  if (local.length > 64) return false;
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  // --- Domain -------------------------------------------------------------
  // At least two labels, each 1-63 characters of letters, digits and hyphens,
  // and a hyphen may not lead or trail a label. The last label is the public
  // suffix and must be at least two letters: there is no single-character TLD,
  // and a numeric one would be an IP address written wrong.
  if (domain.length > 253) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((label) => /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    return false;
  }
  return /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]);
}

/**
 * The address as Warsha will store and send to, or `null` if it is not one.
 *
 * Trimming and lower-casing in one place is what stops ` Hello@Gmail.com ` and
 * `hello@gmail.com` becoming two accounts. Every surface that takes an address
 * from a person should normalise through here rather than remembering to call
 * `.trim().toLowerCase()` — one of them will eventually forget, and the account
 * that results is indistinguishable from a stranger's.
 */
export function normalizeCustomerEmail(value: string): string | null {
  const email = value.trim();
  return isValidCustomerEmail(email) ? email.toLowerCase() : null;
}

export function classifySignInIdentity(value: string): SignInIdentity | null {
  const trimmed = value.trim();
  if (trimmed.includes('@')) {
    const email = normalizeCustomerEmail(trimmed);
    return email ? { kind: 'customer_email', email } : null;
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
