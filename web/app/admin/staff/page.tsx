'use client';

import { useEffect, useState } from 'react';

import { ConsoleShell } from '@/components/console-shell';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/console-table.module.css';

/**
 * Staff roles and the capabilities behind them.
 *
 * Read-only in this increment, deliberately. `get_staff_role_directory`
 * requires `manage_staff_roles` and is safe to render; granting and revoking
 * go through `staff_grant_role` and `staff_revoke_role`, which additionally
 * demand fresh authentication and refuse self-escalation. Wiring a grant
 * button without that reauthentication flow would produce a control that
 * fails at the moment somebody needs it, so the buttons are not here yet.
 */
type RoleRow = {
  roleKey?: string;
  displayName?: string;
  description?: string;
  riskTier?: string;
  capabilities?: string[];
};

export default function StaffPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'manage_staff_roles');

  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase().rpc('get_staff_role_directory');
      if (!active) return;
      if (error) { setFailed(true); return; }
      const payload = data as { roles?: RoleRow[] } | null;
      setRoles(payload?.roles ?? []);
    })();
    return () => { active = false; };
  }, [allowed]);

  return (
    <ConsoleShell title={words.staffTitle}>
      <p className={styles.lead}>{words.staffLead}</p>

      <div className={styles.panel}>
        {!allowed ? (
          <p className={styles.error}>{words.usersRefused}</p>
        ) : failed ? (
          <p className={styles.error}>{words.loadFailed}</p>
        ) : roles === null ? (
          <p className={styles.muted}>{words.loading}</p>
        ) : roles.length === 0 ? (
          <p className={styles.muted}>{words.tableEmpty}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr><th>Role</th><th>Risk</th><th>Capabilities</th></tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.roleKey}>
                    <td>
                      <strong>{role.displayName ?? role.roleKey}</strong>
                      <div className={styles.mono}>{role.roleKey}</div>
                    </td>
                    <td className={styles.mono}>{role.riskTier ?? '—'}</td>
                    <td>
                      <ul className={styles.chips}>
                        {(role.capabilities ?? []).map((capability) => (
                          <li key={capability} className={styles.chip}>{capability}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
