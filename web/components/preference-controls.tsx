'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { copy } from '@/lib/copy';
import { languageChangeEvent } from '@/lib/use-app-locale';
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
  // Tell this tab. localStorage only notifies other tabs, and the unprefixed
  // surfaces have no navigation to re-render them.
  window.dispatchEvent(new Event(languageChangeEvent));
}

/**
 * Warsha has two locale architectures, and mixing them is what broke the
 * console.
 *
 * The public site is genuinely locale-prefixed: `/en/...` and `/ar/...` are
 * real routes under `app/[locale]`, so switching language there is a
 * navigation, and it should stay one — a real URL is bookmarkable, crawlable
 * and openable in a new tab.
 *
 * The customer, worker and staff applications are **not** prefixed. They read
 * the locale from the cookie and localStorage through `useAppLocale`, and no
 * `/en` or `/ar` route exists under them. The switcher used to prefix
 * unconditionally, so on admin.usewarsha.com it produced `/ar/users` — a route
 * that has never existed — and the operator got a 404 they could only escape by
 * editing the address bar.
 *
 * So the mode is explicit rather than guessed. `path` navigates; `preference`
 * records the choice and re-renders in place.
 */
export type LanguageSwitchMode = 'path' | 'preference';

export function LanguageSwitch({
  locale,
  mode = 'preference',
}: {
  locale: Locale;
  mode?: LanguageSwitchMode;
}) {
  const pathname = usePathname();
  const target = otherLocale(locale);
  const label = target === 'ar' ? copy[locale].languageArabic : copy[locale].languageEnglish;
  const ariaLabel = `${copy[locale].languageLabel}: ${label}`;

  if (mode === 'path') {
    const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/, '') || '';
    return (
      <a
        href={`/${target}${rest}`}
        hrefLang={target}
        lang={target}
        className={styles.language}
        onClick={() => rememberLanguage(target)}
        aria-label={ariaLabel}
      >
        {label}
      </a>
    );
  }

  // Unprefixed surfaces: record the preference and refresh in place. No path is
  // constructed, so no path can be wrong.
  return (
    <button
      type="button"
      lang={target}
      className={styles.language}
      onClick={() => rememberLanguage(target)}
      aria-label={ariaLabel}
    >
      {label}
    </button>
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
