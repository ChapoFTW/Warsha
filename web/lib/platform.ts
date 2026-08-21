import type { StaffSession } from './staff.ts';

/**
 * Platform environment binding and release verification, as the console
 * presents them.
 *
 * Neither operation is new authority. `staff_bind_platform_environment` and
 * `verify_platform_release` already exist and already refuse; this module only
 * decides what may honestly be offered, and in what words. Every guard here is
 * a courtesy that stops an operator composing an action the database will
 * reject — the database rejects it regardless.
 */

/** The non-production environments `staff_bind_platform_environment` accepts. */
export const BINDABLE_ENVIRONMENTS = ['development', 'staging'] as const;
export type BindableEnvironment = (typeof BINDABLE_ENVIRONMENTS)[number];

/**
 * The Supabase project reference, read from the URL the client is already
 * using rather than typed by the operator.
 *
 * The RPC demands exactly twenty lowercase letters. Anything else — a local
 * stack on an IP address, a proxy, a malformed value — yields null, and a null
 * ref is what stops the console offering a binding it cannot safely describe.
 */
export function projectRefFromSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const label = host.split('.')[0] ?? '';
  return /^[a-z]{20}$/.test(label) ? label : null;
}

export type BindingOffer =
  /** The one-way transition is available exactly as the RPC will accept it. */
  | { kind: 'available'; from: 'local'; projectRef: string }
  /** Already bound. The RPC is one-way; there is nothing to offer. */
  | { kind: 'bound'; environment: string }
  /** Fail closed: something does not match, so no actionable control is shown. */
  | { kind: 'unavailable'; reason: 'no-project-ref' | 'unknown-environment' | 'not-staff' };

/**
 * What the console may offer, given the authoritative session and the project
 * the browser is actually talking to.
 *
 * Binding is only ever offered from the unbound `local` bootstrap row, because
 * that is the only transition the RPC permits. A project that is already bound
 * gets a statement of fact rather than a button.
 */
export function bindingOffer(
  session: StaffSession,
  projectRef: string | null,
): BindingOffer {
  if (!session.isStaff) return { kind: 'unavailable', reason: 'not-staff' };
  const environment = session.environment;
  if (environment && environment !== 'local') return { kind: 'bound', environment };
  if (!environment) return { kind: 'unavailable', reason: 'unknown-environment' };
  if (!projectRef) return { kind: 'unavailable', reason: 'no-project-ref' };
  return { kind: 'available', from: 'local', projectRef };
}

/** The RPC's own bound: a reason short enough to be useless is refused server-side. */
export const BINDING_REASON_MIN = 10;
export const BINDING_REASON_MAX = 1000;

export function bindingReasonValid(reason: string): boolean {
  const length = reason.trim().length;
  return length >= BINDING_REASON_MIN && length <= BINDING_REASON_MAX;
}

// --- Release verification ---------------------------------------------------

export type VerificationCheck = {
  check: string;
  observed: number;
  expected: number;
  passed: boolean;
  description: string;
};

export type VerificationResult = {
  environment: string | null;
  failures: number;
  passed: boolean;
  generatedAt: string | null;
  checks: VerificationCheck[];
};

export function parseVerification(value: unknown): VerificationResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const checks = Array.isArray(raw.checks) ? raw.checks : [];
  return {
    environment: typeof raw.environment === 'string' ? raw.environment : null,
    failures: typeof raw.failures === 'number' ? raw.failures : 0,
    passed: raw.passed === true,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    checks: checks.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Record<string, unknown>;
      if (typeof row.check !== 'string') return [];
      return [{
        check: row.check,
        observed: typeof row.observed === 'number' ? row.observed : 0,
        expected: typeof row.expected === 'number' ? row.expected : 0,
        passed: row.passed === true,
        description: typeof row.description === 'string' ? row.description : '',
      }];
    }),
  };
}

/**
 * Failures the repository already records as open and expected.
 *
 * `provider_webhook` is the one rate-limit policy carrying `client_only_gap`,
 * recorded as gap G29 in `docs/launch/READINESS-GAP-REGISTER.md`, and
 * `verify_platform_release()` fails `unowned_rate_limits` on it deliberately so
 * the gap stays visible. It is shown as expected and not blocking — never
 * hidden, because a verification that quietly drops its own known failure is
 * worth nothing.
 */
export const EXPECTED_VERIFICATION_FAILURES: ReadonlySet<string> = new Set([
  'unowned_rate_limits',
]);

export type VerificationSummary = {
  passed: VerificationCheck[];
  expectedFailures: VerificationCheck[];
  unexpectedFailures: VerificationCheck[];
  /** The only question that decides whether a release may proceed. */
  blocking: boolean;
};

export function summarizeVerification(result: VerificationResult): VerificationSummary {
  const passed = result.checks.filter((entry) => entry.passed);
  const failed = result.checks.filter((entry) => !entry.passed);
  const expectedFailures = failed.filter((entry) =>
    EXPECTED_VERIFICATION_FAILURES.has(entry.check));
  const unexpectedFailures = failed.filter((entry) =>
    !EXPECTED_VERIFICATION_FAILURES.has(entry.check));
  return {
    passed,
    expectedFailures,
    unexpectedFailures,
    blocking: unexpectedFailures.length > 0,
  };
}
