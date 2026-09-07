import crypto from 'node:crypto';

/**
 * A recovery transaction that survives a mistyped authenticator code.
 *
 * ## The problem this exists to solve
 *
 * `verifyOtp` spends the emailed token. When the account holds a verified TOTP
 * factor the password cannot be changed on the resulting `aal1` session, so the
 * request needs a second factor — and the first design asked for it AFTER the
 * token was already spent. One wrong or expired six-digit code therefore burnt
 * the entire recovery email, and the person had to request another one to try
 * again. Codes rotate every thirty seconds; that is not an unusual mistake, it
 * is the expected one.
 *
 * So the email token is exchanged ONCE, into the state sealed here, and the
 * authenticator challenge may then be retried against it as often as the person
 * needs within a short window.
 *
 * ## Why it is sealed rather than simply hidden
 *
 * The state holds a refresh token. A refresh token can be exchanged for a
 * recovery access token, and a recovery access token IS a customer session —
 * that was measured on this project: profile, bookings, addresses and
 * notifications all answered 200 for one. `HttpOnly` stops page scripts reading
 * the cookie, and it is the right flag to set, but it is a browser policy: it
 * does not make the value itself worthless to whoever ends up holding it.
 *
 * Sealing does. What reaches the browser is AES-256-GCM ciphertext bound to a
 * key that exists only on the server, so the cookie authorises nothing
 * anywhere: not Supabase, not Warsha's own APIs, not a second Warsha
 * deployment. It is a claim check for state this server can reopen, and to
 * everybody else it is noise.
 *
 * GCM also authenticates: a modified cookie fails to open rather than decrypting
 * into something attacker-chosen, and the expiry is sealed INSIDE the envelope
 * so it cannot be extended by editing a cookie attribute.
 */

const COOKIE = 'warsha_recovery';
/**
 * Ten minutes: long enough to fetch a phone, open an authenticator and mistype
 * twice; short enough that a forgotten open tab is not a standing invitation.
 * Sealed into the payload, so the cookie's own Max-Age is a courtesy to the
 * browser rather than the thing being enforced.
 */
const LIFETIME_MS = 10 * 60 * 1000;

type Envelope = { r: string; e: number };

function key(): Buffer | null {
  const secret = process.env.RECOVERY_STATE_SECRET;
  // No secret, no sealed state. The caller falls back to the single-request
  // flow, which still works when the code is supplied up front — a missing
  // configuration must not become a reason to put a live refresh token in a
  // cookie unsealed.
  if (!secret || secret.length < 32) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

export function recoveryStateAvailable(): boolean {
  return key() !== null;
}

/** Seals a refresh token into an opaque, self-expiring envelope. */
export function sealRecoveryState(refreshToken: string, now = Date.now()): string | null {
  const secret = key();
  if (!secret || !refreshToken) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  const payload: Envelope = { r: refreshToken, e: now + LIFETIME_MS };
  const sealed = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), sealed]
    .map((part) => part.toString('base64url'))
    .join('.');
}

/** Opens an envelope, or returns null for anything that is not a live one. */
export function openRecoveryState(sealed: string | undefined, now = Date.now()): string | null {
  const secret = key();
  if (!secret || !sealed) return null;
  const parts = sealed.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((part) => Buffer.from(part, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret, iv);
    decipher.setAuthTag(tag);
    const opened = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    const envelope = JSON.parse(opened) as Envelope;
    if (typeof envelope.r !== 'string' || typeof envelope.e !== 'number') return null;
    // Expiry lives inside the sealed payload, so it cannot be extended by
    // editing the cookie's Max-Age.
    if (envelope.e <= now) return null;
    return envelope.r;
  } catch {
    // A tampered, truncated or foreign envelope fails its auth tag here. There
    // is nothing to report but "no state".
    return null;
  }
}

/**
 * `Path` is the important attribute and the least obvious one: it stops the
 * cookie being attached to any other Warsha request, so the recovery state is
 * offered only to the one route that can open it. `SameSite=Strict` keeps
 * another site from causing it to be sent at all.
 */
export function recoveryCookie(sealed: string): string {
  return `${COOKIE}=${sealed}; HttpOnly; Secure; SameSite=Strict; `
    + `Path=/api/auth/recover; Max-Age=${Math.floor(LIFETIME_MS / 1000)}`;
}

export function clearedRecoveryCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/recover; Max-Age=0`;
}

export function readRecoveryCookie(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name === COOKIE) return rest.join('=') || undefined;
  }
  return undefined;
}
