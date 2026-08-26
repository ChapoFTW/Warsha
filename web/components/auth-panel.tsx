'use client';

import { BrandLockup } from '@/components/brand-mark';
import { PreferenceFooter } from '@/components/preference-controls';
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
      <main id="main" className={centred ? `${styles.panel} ${styles.state}` : styles.panel}>
        <BrandLockup locale={locale} size={30} />
        {children}
      </main>
      {/* Below the form. Somebody arriving from an Arabic email onto an English
          page still needs to fix that, but the first thing on the screen should
          be what they came to do, not the controls for how it is displayed. */}
      <div className={styles.controls}>
        <PreferenceFooter locale={locale} />
      </div>
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
  actions,
  busy = false,
}: {
  locale: Locale;
  title: string;
  body?: string;
  action?: string;
  href?: string;
  actions?: readonly { label: string; href: string }[];
  busy?: boolean;
}) {
  return (
    <AuthScreen locale={locale} centred>
      <h1 className={styles.title}>{title}</h1>
      {body ? <p className={styles.lead}>{body}</p> : null}
      {/* Deliberately a plain anchor, and the one place in the product where
          that is still right. These are session boundaries — signed out, just
          signed up, just signed in — and a full document load is exactly what
          they want: the session provider re-resolves from scratch and nothing
          composed under the previous identity is carried across. Everywhere
          *inside* the product uses `Link`, because there a reload is a reset. */}
      {!busy ? (actions ?? (action && href ? [{ label: action, href }] : [])).map((item, index) => (
        <a key={`${item.href}:${item.label}`} className={index === 0 ? styles.submit : styles.link} href={item.href}>
          {item.label}
        </a>
      )) : null}
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
