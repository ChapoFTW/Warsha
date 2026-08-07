/**
 * WPS-024 Mock legal state.
 *
 * Account-scoped, makes no Supabase call, makes no external call, and never
 * becomes a fallback after a Supabase failure. Mock preserves the server rules
 * rather than relaxing them: it refuses an acceptance whose rendered hash does
 * not match the corpus, exactly as Postgres does, so a client bug that would
 * record a fictional acceptance in production fails in demo mode too.
 *
 * Type-only imports plus local constants, following `mock-onboarding-state.ts`
 * — Node's `--experimental-strip-types` erases type imports but requires an
 * explicit `.ts` extension on runtime ones, and this module is loaded by the
 * regression suite.
 */

import type {
  LegalAcceptanceRecord,
  LegalDocumentKey,
  LegalLanguage,
  LegalObligation,
  LegalObligations,
} from './legal-types.ts';

type Decision = 'accepted' | 'declined';

type MockRecord = {
  documentKey: LegalDocumentKey;
  version: string;
  decision: Decision;
  acceptedAt: string;
  acceptedLanguage: LegalLanguage;
  acceptanceHash: string;
  sourceSurface: string;
  accountRole: string | null;
};

type MockAccount = {
  role: 'customer' | 'worker' | null;
  records: MockRecord[];
};

const accounts = new Map<string, MockAccount>();

function accountFor(accountKey: string): MockAccount {
  const existing = accounts.get(accountKey);
  if (existing) return existing;
  const created: MockAccount = { role: 'customer', records: [] };
  accounts.set(accountKey, created);
  return created;
}

/**
 * A stand-in for the server's acceptance hash.
 *
 * Deliberately NOT the real SHA-256 chain: Mock is a demonstration surface and
 * a value that looked like a genuine acceptance hash could be mistaken for one
 * in a screenshot or a support conversation. The prefix says what it is.
 */
function mockAcceptanceHash(accountKey: string, key: string, version: string): string {
  const seed = `${accountKey}:${key}:${version}`;
  let value = 0;
  for (let i = 0; i < seed.length; i += 1) value = (value * 31 + seed.charCodeAt(i)) >>> 0;
  return `mock${value.toString(16).padStart(60, '0')}`;
}

export function mockSetRole(accountKey: string, role: 'customer' | 'worker' | null): void {
  accountFor(accountKey).role = role;
}

export function mockLegalObligations(
  accountKey: string,
  required: readonly {
    key: LegalDocumentKey;
    version: string;
    audience: string;
    changeClass: string;
    changeSummary: string;
    effectiveAt: string;
  }[],
): LegalObligations {
  const account = accountFor(accountKey);

  const applies = (audience: string): boolean =>
    audience === 'all' || (account.role !== null && audience === account.role);

  const obligations: LegalObligation[] = required.filter((r) => applies(r.audience)).map((r) => {
    const latest = account.records
      .filter((record) => record.documentKey === r.key)
      .sort((a, b) => (a.acceptedAt < b.acceptedAt ? 1 : -1))[0];
    const outstanding = !latest || latest.decision !== 'accepted' || latest.version !== r.version;
    return {
      documentKey: r.key,
      version: r.version,
      changeClass: r.changeClass as LegalObligation['changeClass'],
      changeSummary: r.changeSummary,
      effectiveAt: r.effectiveAt,
      acceptedVersion: latest ? latest.version : null,
      acceptedAt: latest ? latest.acceptedAt : null,
      acceptedLanguage: latest ? latest.acceptedLanguage : null,
      outstanding,
      restricts: [],
    };
  });

  const blocking = obligations.filter(
    (o) => o.outstanding && (o.changeClass === 'initial' || o.changeClass === 'material' || o.changeClass === 'urgent'),
  );

  return {
    role: account.role,
    obligations,
    satisfied: blocking.length === 0,
    blocking,
  };
}

/**
 * Record an acceptance in Mock.
 *
 * `expectedHash` is the corpus hash for the version being accepted, and a
 * mismatch throws — the same refusal the server makes. Mock that accepted
 * anything would let a stale-bundle bug through in the one mode a developer
 * looks at every day.
 */
export function mockAcceptDocument(
  accountKey: string,
  documentKey: LegalDocumentKey,
  version: string,
  language: LegalLanguage,
  renderedHash: string,
  expectedHash: string,
  sourceSurface: string,
): LegalAcceptanceRecord {
  if (renderedHash !== expectedHash) {
    throw new Error('The document shown does not match the published version');
  }
  const account = accountFor(accountKey);
  const record: MockRecord = {
    documentKey,
    version,
    decision: 'accepted',
    acceptedAt: new Date().toISOString(),
    acceptedLanguage: language,
    acceptanceHash: mockAcceptanceHash(accountKey, documentKey, version),
    sourceSurface,
    accountRole: account.role,
  };
  account.records.push(record);
  return record;
}

export function mockDeclineDocument(
  accountKey: string,
  documentKey: LegalDocumentKey,
  version: string,
  language: LegalLanguage,
): LegalAcceptanceRecord {
  const account = accountFor(accountKey);
  const record: MockRecord = {
    documentKey,
    version,
    decision: 'declined',
    acceptedAt: new Date().toISOString(),
    acceptedLanguage: language,
    acceptanceHash: mockAcceptanceHash(accountKey, `${documentKey}:declined`, version),
    sourceSurface: 'reconsent',
    accountRole: account.role,
  };
  account.records.push(record);
  return record;
}

export function mockLegalAcceptances(accountKey: string): LegalAcceptanceRecord[] {
  return accountFor(accountKey)
    .records.slice()
    .sort((a, b) => (a.acceptedAt < b.acceptedAt ? 1 : -1));
}

export function mockResetLegal(accountKey: string): void {
  accounts.delete(accountKey);
}
