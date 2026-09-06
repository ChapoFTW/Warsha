import type { StaffSession } from './staff.ts';
import { hasCapability } from './staff.ts';

/**
 * The console's areas, and the capability each one needs.
 *
 * The capability names are the ones the RPCs themselves demand — read from
 * `private.require_staff_capability(...)` inside each function, not invented
 * here. That matters: if this list said `manage_users` and the RPC demanded
 * `safe_search`, the navigation would offer a door that opens onto a refusal.
 *
 * Hiding an area whose capability is absent is a courtesy. The refusal happens
 * in the database on every call, whether or not the link was rendered.
 */
export type ConsoleArea = {
  key: string;
  href: string;
  /** The capability the underlying RPC requires. */
  capability: string;
};

export const CONSOLE_AREAS: readonly ConsoleArea[] = [
  { key: 'dashboard', href: '/', capability: '' },
  { key: 'users', href: '/users', capability: 'safe_search' },
  { key: 'verification', href: '/verification', capability: 'review_worker_vetting' },
  { key: 'analytics', href: '/analytics', capability: 'view_analytics' },
  { key: 'staff', href: '/staff', capability: 'manage_staff_roles' },
  // Environment binding is the tool that needs this door; release verification
  // shares the page and is gated separately on `view_audit_logs` inside it.
  { key: 'platform', href: '/platform', capability: 'manage_feature_flags' },
  // Viewing the provider register is the gate; each action inside the page is
  // checked against its own capability by the RPC it calls.
  { key: 'providers', href: '/providers', capability: 'review_legal_governance' },
  { key: 'audit', href: '/audit', capability: 'view_audit_logs' },
  // Your own second factor, and deliberately ungated. Every staff member needs
  // `aal2` once `mfa_required` is on, including one who holds nothing else, so
  // a capability here would lock the least-privileged operator out of the only
  // page that could give them the assurance level the rest of the console
  // demands. It exposes no data and no other account: the API it calls enrols
  // on the caller's own session and takes no subject.
  { key: 'security', href: '/security', capability: '' },
  { key: 'help', href: '/help', capability: '' },
];

export function visibleAreas(session: StaffSession): readonly ConsoleArea[] {
  return CONSOLE_AREAS.filter(
    (area) => area.capability === '' || hasCapability(session, area.capability),
  );
}

export function mayEnter(session: StaffSession, href: string): boolean {
  const area = CONSOLE_AREAS.find((candidate) => candidate.href === href);
  if (!area) return false;
  return area.capability === '' || hasCapability(session, area.capability);
}
