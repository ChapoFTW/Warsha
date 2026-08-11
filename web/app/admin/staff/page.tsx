'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge, Empty, Identifier, Timestamp } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import { ReauthDialog } from '@/components/reauth-dialog';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import { parseRoleDirectory, type RoleDirectory } from '@/lib/console-payloads';
import { isReauthRefusal, reauthNeedFor } from '@/lib/reauth';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/console-table.module.css';

/**
 * Staff roles, capabilities and who holds them.
 *
 * `manage_staff_roles` carries `requires_reauth = true` in the database, so
 * this page cannot be read on a session that has gone stale — the read is
 * governed by the same gate as the write. That is not an accident of the
 * capability model and it is not worked around here: the page asks for a fresh
 * sign-in and then loads.
 *
 * It is also `dual_control = true`. Granting or revoking needs a second person,
 * which is why this page shows state and does not offer a lone grant button
 * that could not complete by itself.
 */
export default function StaffPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'manage_staff_roles');
  const need = reauthNeedFor(session, 'manage_staff_roles');

  const [directory, setDirectory] = useState<RoleDirectory | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const [askReauth, setAskReauth] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setBusy(true);
    setRefused(false);
    const { data, error } = await supabase().rpc('get_staff_role_directory');
    if (error) {
      // A freshness refusal is recoverable in place; anything else is not.
      if (isReauthRefusal(error)) setAskReauth(true);
      else setRefused(true);
      setDirectory(null);
    } else {
      setDirectory(parseRoleDirectory(data));
    }
    setBusy(false);
  }, [allowed]);

  useEffect(() => {
    if (need.kind === 'ready') void load();
  }, [need.kind, load]);

  const now = Date.now();

  return (
    <ConsoleShell title={words.staffTitle}>
      <p className={styles.lead}>{words.staffLead}</p>

      {allowed && need.kind === 'stale' ? (
        <div className={styles.freshness}>
          <Badge tone="strong">{words.reauthRequired}</Badge>
          <button
            type="button"
            className={styles.rowLink}
            onClick={() => setAskReauth(true)}
          >
            {words.reauthConfirmNow}
          </button>
        </div>
      ) : null}

      {askReauth ? (
        <ReauthDialog
          capability="manage_staff_roles"
          onClose={() => setAskReauth(false)}
          onSuccess={() => { setAskReauth(false); void load(); }}
        />
      ) : null}

      {!allowed ? (
        <div className={styles.panel}><p className={styles.error}>{words.staffRefused}</p></div>
      ) : refused ? (
        <div className={styles.panel}><p className={styles.error} role="alert">{words.staffRefused}</p></div>
      ) : directory === null ? (
        <div className={styles.panel}>
          <Empty>{busy ? words.loading : words.reauthRequired}</Empty>
        </div>
      ) : (
        <>
          <section className={styles.panel}>
            <h2 className={styles.label}>{words.staffRolesHeading}</h2>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{words.colRole}</th>
                    <th>{words.colRiskTier}</th>
                    <th>{words.colCapabilityCount}</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.roles.map((role) => (
                    <tr key={role.roleKey}>
                      <td>
                        <strong>{role.displayName || role.roleKey}</strong>
                        <br />
                        <Identifier value={role.roleKey} />
                      </td>
                      <td><Badge tone={role.riskTier === 'high' ? 'strong' : 'plain'}>{role.riskTier}</Badge></td>
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
          </section>

          <section className={styles.panel}>
            <h2 className={styles.label}>{words.staffGrantsHeading}</h2>
            {directory.grants.length === 0 ? (
              <Empty>{words.tableEmpty}</Empty>
            ) : (
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{words.colHolder}</th>
                      <th>{words.colRole}</th>
                      <th>{words.colStatus}</th>
                      <th>{words.colGranted}</th>
                      <th>{words.colExpires}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {directory.grants.map((grant) => {
                      // The directory returns live grants; an expiry already in
                      // the past is still worth showing as expired rather than
                      // as a date the reader has to compare themselves.
                      const expired = grant.expiresAt
                        ? new Date(grant.expiresAt).getTime() <= now
                        : false;
                      return (
                        <tr key={grant.id}>
                          <td>
                            {grant.displayName || <span className={styles.muted}>—</span>}
                            <br />
                            <Identifier value={grant.userId} short />
                          </td>
                          <td><Badge>{grant.roleKey}</Badge></td>
                          <td>
                            <Badge tone={expired ? 'quiet' : 'plain'}>
                              {expired ? words.grantExpired : words.grantActive}
                            </Badge>
                          </td>
                          <td>
                            <Timestamp
                              value={grant.grantedAt}
                              locale={locale}
                              timeZone={session.displayTimezone}
                            />
                          </td>
                          <td>
                            {grant.expiresAt ? (
                              <Timestamp
                                value={grant.expiresAt}
                                locale={locale}
                                timeZone={session.displayTimezone}
                              />
                            ) : (
                              <span className={styles.muted}>{words.grantNoExpiry}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.label}>{words.staffCapabilitiesHeading}</h2>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{words.colCapability}</th>
                    <th>{words.colDomain}</th>
                    <th>{words.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.capabilities.map((capability) => (
                    <tr key={capability.capabilityKey}>
                      <td>
                        <Identifier value={capability.capabilityKey} />
                        <br />
                        <span className={styles.muted}>{capability.description}</span>
                      </td>
                      <td><Badge tone="quiet">{capability.domain}</Badge></td>
                      <td>
                        <ul className={styles.chips}>
                          {capability.highRisk ? <li className={styles.chip}>{words.flagHighRisk}</li> : null}
                          {capability.dualControl ? <li className={styles.chip}>{words.flagDualControl}</li> : null}
                          {capability.requiresReauth ? <li className={styles.chip}>{words.flagReauth}</li> : null}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </ConsoleShell>
  );
}
