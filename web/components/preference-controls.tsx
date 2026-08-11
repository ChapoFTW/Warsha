'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { copy } from '@/lib/copy';
import {
  appearanceExplicitKey,
  appearancePreferences,
  appearanceStorageKey,
  isAppearancePreference,
  languageExplicitKey,
  languageStorageKey,
  otherLocale,
  type AppearancePreference,
  type Locale,
} from '@/lib/preferences';

import styles from './preference-controls.module.css';

/**
 * Language and appearance controls.
 *
 * Both write the same keys the mobile client uses, and both record *explicit*
 * separately from the value. That distinction is the whole preference model:
 * "dark because you asked for dark" and "dark because your laptop is dark" look
 * identical on screen and must behave differently the moment the laptop
 * changes its mind.
 *
 * Language is a link, not a button. Each language is a real URL, so switching
 * is a navigation a browser can bookmark, a crawler can follow, and a person
 * can open in a new tab — none of which is true of a control that mutates the
 * page in place.
 */

function rememberLanguage(locale: Locale) {
  try {
    window.localStorage.setItem(languageStorageKey, locale);
    window.localStorage.setItem(languageExplicitKey, 'true');
  } catch {
    // Choosing a language must still work when storage is refused; it simply
    // will not be remembered for the next visit.
  }
  // The middleware decides what `/` serves and cannot read localStorage, so
  // the same choice is mirrored into a cookie it can see. One year, lax:
  // a language preference is not a credential.
  document.cookie = `warsha-locale=${locale};path=/;max-age=31536000;samesite=lax`;
}

export function LanguageSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const target = otherLocale(locale);
  const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/, '') || '';
  const href = `/${target}${rest}`;

  return (
    <a
      href={href}
      hrefLang={target}
      lang={target}
      className={styles.language}
      onClick={() => rememberLanguage(target)}
      aria-label={`${copy[locale].languageLabel}: ${
        target === 'ar' ? copy[locale].languageArabic : copy[locale].languageEnglish}`}
    >
      {target === 'ar' ? copy[locale].languageArabic : copy[locale].languageEnglish}
    </a>
  );
}

export function AppearanceSwitch({ locale }: { locale: Locale }) {
  const [preference, setPreference] = useState<AppearancePreference>('system');
  const [mounted, setMounted] = useState(false);

  // The stored preference is read after mount. The inline head script has
  // already painted the correct theme, so this only syncs the control with
  // what is on screen — it never causes the first paint.
  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(appearanceStorageKey);
      const explicit = window.localStorage.getItem(appearanceExplicitKey) === 'true';
      if (explicit && isAppearancePreference(stored)) setPreference(stored);
    } catch {
      // Fall through to `system`, which is the documented default.
    }
  }, []);

  const choose = (next: AppearancePreference) => {
    setPreference(next);
    const root = document.documentElement;
    try {
      window.localStorage.setItem(appearanceStorageKey, next);
      window.localStorage.setItem(appearanceExplicitKey, String(next !== 'system'));
    } catch {
      // Applying the choice matters more than remembering it.
    }
    if (next === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);
  };

  const labels: Record<AppearancePreference, string> = {
    system: copy[locale].appearanceSystem,
    light: copy[locale].appearanceLight,
    dark: copy[locale].appearanceDark,
  };

  return (
    <div
      className={styles.appearance}
      role="group"
      aria-label={copy[locale].appearanceLabel}
    >
      {appearancePreferences.map((option) => (
        <button
          key={option}
          type="button"
          className={styles.appearanceOption}
          // Before mount the stored value is unknown. Claiming `system` is
          // pressed would be a guess, so nothing is claimed until it is known.
          aria-pressed={mounted ? preference === option : undefined}
          onClick={() => choose(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
