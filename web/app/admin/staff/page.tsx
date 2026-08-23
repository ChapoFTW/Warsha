'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge, Empty, Identifier, Timestamp } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import {
  ReauthDialog, usePendingReauth, type ReauthRefusalReason,
} from '@/components/reauth-dialog';
import { GrantRoleForm, RevokeButton } from '@/components/staff-role-actions';
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
 * `manage_staff_roles` is also `dual_control = true`, and it is worth being
 * precise about what that means here rather than inventing a workflow. For
 * roles, the second person *is* the prohibition on granting to yourself:
 * `staff_grant_role` raises 42501 when the subject is the actor, and the
 * migration's own heading calls that the dual control. There is no approval
 * queue for role grants — `staff_request_dual_control` exists for the
 * capabilities that genuinely queue — so this page offers the grant directly
 * and refuses the operator's own account.
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
  const [continuation, setContinuation] = useState<string | null>(null);
  const onReauthRefused = useCallback((refusal: ReauthRefusalReason) => {
    setContinuation(refusal === 'another-action-pending' ? words.reauthAnotherPending
      : refusal === 'already-retried' ? words.reauthAlreadyRetried
        : words.reauthPendingExpired);
  }, [words]);
  const reauth = usePendingReauth(onReauthRefused);
  const { remember: rememberReauth } = reauth;

  const load = useCallback(async () => {
    if (!allowed) return;
    setBusy(true);
    setRefused(false);
    const { data, error } = await supabase().rpc('get_staff_role_directory');
    if (error) {
      // A freshness refusal is recoverable in place; anything else is not.
      if (isReauthRefusal(error)) rememberReauth('directory', 'manage_staff_roles', () => { void load(); });
      else setRefused(true);
      setDirectory(null);
    } else {
      setDirectory(parseRoleDirectory(data));
    }
    setBusy(false);
  }, [allowed, rememberReauth]);

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
            onClick={() => rememberReauth('directory', 'manage_staff_roles', () => { void load(); })}
          >
            {words.reauthConfirmNow}
          </button>
        </div>
      ) : null}

      {reauth.capability ? (
        <ReauthDialog
          capability={reauth.capability}
          onClose={reauth.discard}
          onSuccess={reauth.resume}
        />
      ) : null}

      {continuation ? <p className={styles.error} role="alert">{continuation}</p> : null}

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

          <GrantRoleForm
            roles={directory.roles}
            onDone={() => { void load(); }}
            onNeedsReauth={(key, retry) => rememberReauth(key, 'manage_staff_roles', retry)}
          />

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
                      <th>{words.colAction}</th>
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
                          <td>
                            <RevokeButton
                              grant={grant}
                              onDone={() => { void load(); }}
                              onNeedsReauth={(key, retry) => rememberReauth(key, 'manage_staff_roles', retry)}
                            />
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
