/**
 * What an account restriction means to the person it applies to, as both
 * platforms read it.
 *
 * The server enforces restrictions (202609170006): `private.account_may`
 * answers each capability and row triggers refuse the action. Nothing here
 * decides anything. It names the two refusals so a screen can say something
 * true instead of "something went wrong", and it reads `get_my_trust_status`,
 * which is how a restricted person learns why and how to appeal.
 *
 * Plain TypeScript: the browser imports it too.
 */

/** The person acting may not do this. Their own status says why. */
export const ACCOUNT_RESTRICTED_CODE = 'WR001';
export const ACCOUNT_RESTRICTED_TOKEN = 'account_restricted';
/** The other person cannot take part. Nobody is told why. */
export const COUNTERPARTY_UNAVAILABLE_CODE = 'WR002';
export const COUNTERPARTY_UNAVAILABLE_TOKEN = 'counterparty_unavailable';

type ErrorLike = { code?: unknown; message?: unknown };

function matches(reason: unknown, code: string, token: string): boolean {
  const error = reason as ErrorLike | null | undefined;
  if (!error || typeof error !== 'object') return false;
  if (error.code === code) return true;
  // A transport that loses the SQLSTATE still carries the raised token.
  return typeof error.message === 'string' && error.message.includes(token);
}

export function isAccountRestrictedError(reason: unknown): boolean {
  return matches(reason, ACCOUNT_RESTRICTED_CODE, ACCOUNT_RESTRICTED_TOKEN);
}

export function isCounterpartyUnavailableError(reason: unknown): boolean {
  return matches(reason, COUNTERPARTY_UNAVAILABLE_CODE, COUNTERPARTY_UNAVAILABLE_TOKEN);
}

/** The level the product enforces, most severe first. */
export type AccountRestrictionLevel = 'none' | 'hidden' | 'suspended' | 'removed';

export type AccountTrustStatus = {
  trustLevel: string;
  restriction: AccountRestrictionLevel;
  communicationRestricted: boolean;
  reviewRestricted: boolean;
  publicReason: string | null;
  restrictionExpiresAt: string | null;
  appealableActionId: string | null;
  appeal: { id: string; status: string; decisionNote: string | null } | null;
  canAppeal: boolean;
};

const LEVELS: readonly AccountRestrictionLevel[] = ['none', 'hidden', 'suspended', 'removed'];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/**
 * `get_my_trust_status`'s answer, or null if it was not one. A status that
 * cannot be read is not "no restriction": the screen says it could not load.
 */
export function parseAccountTrustStatus(value: unknown): AccountTrustStatus | null {
  const raw = record(value);
  if (typeof raw.trustLevel !== 'string') return null;
  const restrictions = record(raw.restrictions);
  const action = record(raw.appealableAction);
  const appeal = record(raw.appeal);
  const level = LEVELS.includes(raw.restriction as AccountRestrictionLevel)
    ? raw.restriction as AccountRestrictionLevel
    : 'none';
  return {
    trustLevel: raw.trustLevel,
    restriction: level,
    communicationRestricted: restrictions.communicationRestricted === true,
    reviewRestricted: restrictions.reviewRestricted === true,
    publicReason: text(raw.publicReason),
    restrictionExpiresAt: text(raw.restrictionExpiresAt),
    appealableActionId: text(action.id),
    appeal: text(appeal.id) ? {
      id: String(appeal.id),
      status: text(appeal.status) ?? 'submitted',
      decisionNote: text(appeal.decisionNote),
    } : null,
    canAppeal: raw.canAppeal === true && text(action.id) !== null,
  };
}

/** Whether anything applies that the person should be told about. */
export function accountHasRestriction(status: AccountTrustStatus): boolean {
  return status.restriction !== 'none' || status.communicationRestricted || status.reviewRestricted
    || status.appeal !== null;
}

/** The appeal statement `submit_trust_appeal` accepts: 10 to 2000 characters after trimming. */
export function appealStatementIsValid(statement: string): boolean {
  const length = statement.trim().length;
  return length >= 10 && length <= 2000;
}
