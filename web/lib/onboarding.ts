/**
 * The onboarding authority, re-exported for the browser.
 *
 * `src/onboarding/onboarding-types.ts` is the module the mobile app routes on.
 * It already knows which gates a worker can act on, which are staff decisions
 * they can only wait for, what each worker state means, and how far through the
 * gates somebody is.
 *
 * The web reads exactly that. The parity document is explicit that a second
 * implementation of a shared authority is a defect even when it looks correct,
 * because the two diverge and only one is right — and this is precisely the
 * kind of rule that would drift: a gate added to the mobile ordering would
 * silently fail to appear in the browser.
 *
 * Imported by relative path, not the `@/src/` alias, because the Node test
 * runner resolves this file without the Next.js path mapping.
 */
export {
  actionableGates,
  canAppeal,
  canUseCustomerMode,
  gateProgress,
  isActionableGate,
  isAwaitingReview,
  needsWorkerAction,
  routeFor,
  showsCustomerModeAction,
} from '../../src/onboarding/onboarding-types.ts';

export type {
  CertificateStatus,
  CustomerState,
  OnboardingState,
  RouteTarget,
  WorkerState,
} from '../../src/onboarding/onboarding-types.ts';
