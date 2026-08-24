'use client';

import { BrandLockup } from '@/components/brand-mark';
import { SettingsMenu } from '@/components/preference-controls';
import type { Locale } from '@/lib/preferences';

import styles from './auth-panel.module.css';

/**
 * The shell the account-entry screens share.
 *
 * Sign-in, forgot-password, reset-password and the two callback results are one
 * journey a person walks in a single sitting, often twice. Building each as its
 * own page produced five slightly different pages; this is the one page they
 * are all versions of.
 *
 * The language and appearance controls belong here rather than in each screen
 * because somebody arriving from an Arabic email onto an English page needs to
 * fix that before reading anything else — including on the screens that exist
 * only to deliver bad news about a link.
 */

export { styles as authPanelStyles };

export function AuthScreen({
  locale,
  children,
  centred = false,
}: {
  locale: Locale;
  children: React.ReactNode;
  /** Result screens centre their text; forms do not. */
  centred?: boolean;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <SettingsMenu locale={locale} />
      </div>
      <main id="main" className={centred ? `${styles.panel} ${styles.state}` : styles.panel}>
        <BrandLockup locale={locale} size={30} />
        {children}
      </main>
    </div>
  );
}

/**
 * A finished state: something worked, or a link cannot be used.
 *
 * There is always exactly one way forward. A dead end that only explains what
 * went wrong leaves somebody on a page with nothing to press, which is how a
 * recoverable problem becomes an abandoned account.
 */
export function AuthStateCard({
  locale,
  title,
  body,
  action,
  href,
  busy = false,
}: {
  locale: Locale;
  title: string;
  body?: string;
  action?: string;
  href?: string;
  busy?: boolean;
}) {
  return (
    <AuthScreen locale={locale} centred>
      <h1 className={styles.title}>{title}</h1>
      {body ? <p className={styles.lead}>{body}</p> : null}
      {action && href && !busy ? (
        <a className={styles.submit} href={href}>{action}</a>
      ) : null}
    </AuthScreen>
  );
}

/**
 * A password field with a reveal control.
 *
 * Typing a password you cannot see, twice, on a phone keyboard, is how people
 * end up locked out of the account they were trying to get back into. The
 * control is a labelled button rather than an icon so a screen reader announces
 * what it does.
 */
export function SecretField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  showLabel,
  hideLabel,
  showShort,
  hideShort,
  autoComplete = 'new-password',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  /** Announced to assistive technology: the full sentence. */
  showLabel: string;
  hideLabel: string;
  /** Rendered in the control: one word, because it sits inside the field. */
  showShort: string;
  hideShort: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={`secret-${label}`}>{label}</label>
      <span className={styles.secretField}>
        <input
          id={`secret-${label}`}
          className={styles.input}
          type={visible ? 'text' : 'password'}
          dir="ltr"
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className={styles.reveal}
          onClick={onToggle}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? hideShort : showShort}
        </button>
      </span>
    </div>
  );
}
