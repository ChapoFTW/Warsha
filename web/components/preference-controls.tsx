'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { copy } from '@/lib/copy';
import { languageChangeEvent } from '@/lib/use-app-locale';
import {
  appearanceExplicitKey,
  appearancePreferences,
  appearanceStorageKey,
  isAppearancePreference,
  languageExplicitKey,
  languageStorageKey,
  LOCALES,
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
 * On web both are menus: three languages and three appearances is more chrome
 * than a header should spend permanently, and the console sidebar has less room
 * than any of them. The mobile client keeps its own controls — same languages
 * and same appearance semantics, a control shaped for the platform.
 *
 * Language remains a link wherever a link is meaningful. On the locale-prefixed
 * public site each choice is a real URL, so it stays an anchor inside the menu:
 * bookmarkable, openable in a new tab, and unchanged for anyone who reaches it
 * without JavaScript.
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

type MenuOption = {
  value: string;
  label: string;
  /** Present when choosing this option is a navigation rather than a state change. */
  href?: string;
  lang?: string;
};

/**
 * One disclosure menu, used by both controls.
 *
 * `menuitemradio` rather than `menuitem`: these are a set of mutually exclusive
 * choices with one in effect, and `aria-checked` is how that is announced. The
 * open menu is kept in the DOM and hidden, so the anchors the public site
 * depends on are present whether or not the menu has been opened.
 */
function PreferenceMenu({
  controlLabel,
  triggerLabel,
  options,
  selected,
  onChoose,
  className,
}: {
  controlLabel: string;
  triggerLabel: string;
  options: MenuOption[];
  /** `null` while the stored value is still unknown, so nothing is claimed. */
  selected: string | null;
  onChoose: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const focusItem = (index: number) => {
    const count = options.length;
    const next = ((index % count) + count) % count;
    itemRefs.current[next]?.focus();
  };

  const openAt = (index: number) => {
    setOpen(true);
    // The menu is already mounted, so focus can move on the next frame without
    // waiting for a render pass that adds it.
    requestAnimationFrame(() => focusItem(index));
  };

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected));

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(selectedIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(options.length - 1);
    }
  };

  const onItemKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focusItem(index + 1); break;
      case 'ArrowUp': event.preventDefault(); focusItem(index - 1); break;
      case 'Home': event.preventDefault(); focusItem(0); break;
      case 'End': event.preventDefault(); focusItem(options.length - 1); break;
      case 'Escape': event.preventDefault(); close(true); break;
      case 'Tab': close(false); break;
      default: break;
    }
  };

  return (
    <div className={`${styles.menuRoot} ${className ?? ''}`.trim()} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.menuTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${controlLabel}: ${triggerLabel}`}
        onClick={() => (open ? close(false) : openAt(selectedIndex))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={styles.menuTriggerLabel}>{triggerLabel}</span>
        <span aria-hidden="true" className={styles.menuCaret} />
      </button>

      <div
        id={menuId}
        role="menu"
        aria-label={controlLabel}
        className={styles.menuList}
        hidden={!open}
      >
        {options.map((option, index) => {
          const checked = option.value === selected;
          const common = {
            role: 'menuitemradio' as const,
            'aria-checked': checked,
            className: styles.menuItem,
            tabIndex: -1,
            onKeyDown: (event: React.KeyboardEvent) => onItemKeyDown(event, index),
            ref: (node: HTMLElement | null) => { itemRefs.current[index] = node; },
          };
          return option.href ? (
            <a
              key={option.value}
              {...common}
              href={option.href}
              hrefLang={option.lang}
              lang={option.lang}
              onClick={() => { onChoose(option.value); setOpen(false); }}
            >
              {option.label}
            </a>
          ) : (
            <button
              key={option.value}
              {...common}
              type="button"
              lang={option.lang}
              onClick={() => { onChoose(option.value); close(true); }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Warsha has two locale architectures, and mixing them is what broke the
 * console.
 *
 * The public site is genuinely locale-prefixed: `/en/...`, `/ar/...`, and `/fr/...` are
 * real routes under `app/[locale]`, so switching language there is a
 * navigation, and it should stay one — a real URL is bookmarkable, crawlable
 * and openable in a new tab.
 *
 * The customer, worker and staff applications are **not** prefixed. They read
 * the locale from the cookie and localStorage through `useAppLocale`, and no
 * locale-prefixed route exists under them. The switcher used to prefix
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
  const labels: Record<Locale, string> = {
    en: copy[locale].languageEnglish,
    ar: copy[locale].languageArabic,
    fr: copy[locale].languageFrench,
  };
  const rest = pathname.replace(/^\/(en|ar|fr)(?=\/|$)/, '') || '';

  const options: MenuOption[] = LOCALES.map((option) => ({
    value: option,
    label: labels[option],
    lang: option,
    href: mode === 'path' ? `/${option}${rest}` : undefined,
  }));

  return (
    <PreferenceMenu
      controlLabel={copy[locale].languageLabel}
      triggerLabel={labels[locale]}
      options={options}
      selected={locale}
      onChoose={(value) => rememberLanguage(value as Locale)}
    />
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
    <PreferenceMenu
      controlLabel={copy[locale].appearanceLabel}
      triggerLabel={labels[preference]}
      options={appearancePreferences.map((option) => ({
        value: option,
        label: labels[option],
      }))}
      // Before mount the stored value is unknown. Claiming `system` is chosen
      // would be a guess, so nothing is claimed until it is known.
      selected={mounted ? preference : null}
      onChoose={(value) => choose(value as AppearancePreference)}
    />
  );
}
