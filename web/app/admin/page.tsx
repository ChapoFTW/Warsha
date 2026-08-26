'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ConsoleShell } from '@/components/console-shell';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import adminHelp from '@/lib/generated-admin-help.json';
import { buildCapabilityHelp, capabilityLabel, type HelpArticle } from '@/lib/capabilities';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './page.module.css';

const capabilityHelp = buildCapabilityHelp(
  (adminHelp as { articles: HelpArticle[] }).articles ?? [],
);

/**
 * The console dashboard.
 *
 * It states what this staff member actually is — roles and capabilities as the
 * server computed them — rather than presenting a menu of areas and letting
 * each one fail on entry. A console that shows you what you can do is easier
 * to trust than one that shows you everything and refuses most of it.
 *
 * Areas appear only when the capability behind them is present. That is a
 * courtesy, not a control: every operation is refused server-side regardless.
 */
export default function ConsoleDashboard() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();

  return (
    <ConsoleShell title={words.consoleTitle}>
      <p className={styles.lead}>{words.consoleLead}</p>

      <section className={styles.card} aria-labelledby="roles">
        <h2 id="roles" className={styles.cardTitle}>{words.consoleYourAccess}</h2>
        {session.roles.length ? (
          <ul className={styles.chips}>
            {session.roles.map((role) => (
              <li key={role} className={styles.chip}>{role.replace(/_/g, ' ')}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{words.consoleNoRoles}</p>
        )}
      </section>

      <section className={styles.card} aria-labelledby="capabilities">
        <h2 id="capabilities" className={styles.cardTitle}>
          {words.consoleCapabilities} ({session.capabilities.length})
        </h2>
        {session.capabilities.length ? (
          <ul className={styles.chips}>
            {session.capabilities.map((capability) => {
              const help = capabilityHelp(capability);
              return (
                <li key={capability} className={styles.chipQuiet} title={capability}>
                  {help ? (
                    <Link href={`/admin/help#${help.id}` as Route}>{capabilityLabel(capability)}</Link>
                  ) : (
                    capabilityLabel(capability)
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.muted}>{words.consoleNoCapabilities}</p>
        )}
      </section>

      <section className={styles.card} aria-labelledby="session">
        <h2 id="session" className={styles.cardTitle}>{words.consoleSession}</h2>
        <dl className={styles.facts}>
          <div><dt>{words.consoleEnvironment}</dt><dd>{session.environment ?? words.consoleUnbound}</dd></div>
          <div><dt>{words.consoleReauth}</dt><dd>{session.reauthValid ? words.consoleReauthValid : words.consoleReauthRequired}</dd></div>
          <div><dt>{words.consoleMfa}</dt><dd>{session.mfaRequired ? words.consoleYes : words.consoleNo}</dd></div>
          <div><dt>{words.consoleTimezone}</dt><dd>{session.displayTimezone ?? '—'}</dd></div>
        </dl>
      </section>
    </ConsoleShell>
  );
}
