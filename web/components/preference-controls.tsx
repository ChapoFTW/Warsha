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
 * Two triggers was still one too many. French proved it: `Comment fonctionne
 * Warsha` and `Travailler avec Warsha` are twice the width of their English
 * equivalents, and with a language menu and an appearance menu both sitting
 * permanently in the actions row the header had nothing left to give the
 * auth buttons. So the two collapse into one `SettingsMenu` — the same menu
 * primitive, one trigger, two labelled groups inside it.
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
 * Which way the popover opens.
 *
 * A menu in the footer that opened downward would push the page taller every
 * time it was used, so the one place with nothing beneath it opens upward.
 */
export type MenuPlacement = 'below' | 'above';

/**
 * One set of mutually exclusive choices with one in effect.
 *
 * `selected` is `null` while the stored value is still unknown, so nothing is
 * claimed before it is known.
 */
type MenuGroup = {
  label: string;
  options: MenuOption[];
  selected: string | null;
  onChoose: (value: string) => void;
};

/**
 * One disclosure menu, used by every preference control.
 *
 * `menuitemradio` rather than `menuitem`: these are mutually exclusive choices
 * with one in effect, and `aria-checked` is how that is announced. The open
 * menu is kept in the DOM and hidden, so the anchors the public site depends on
 * are present whether or not the menu has been opened.
 *
 * It takes *groups* rather than one flat option list, because Settings needs
 * Language and Appearance in a single popover and neither deserved a second
 * menu implementation. Arrow keys walk the flattened list across group
 * boundaries — a roving cursor over everything the menu contains is what a
 * keyboard user expects; stopping at a heading would not be.
 */
function PreferenceMenu({
  controlLabel,
  trigger,
  groups,
  showGroupLabels = false,
  placement = 'below',
  className,
}: {
  controlLabel: string;
  trigger: React.ReactNode;
  groups: MenuGroup[];
  showGroupLabels?: boolean;
  /** `above` for a control near the foot of the page, which has nothing below it. */
  placement?: MenuPlacement;
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

  // The flattened cursor. Index here is position among every option in the
  // menu, so navigation crosses groups without the caller having to think.
  const flat = groups.flatMap((group, groupIndex) =>
    group.options.map((option, optionIndex) => ({ group, groupIndex, option, optionIndex })));

  const focusItem = (index: number) => {
    const count = flat.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    itemRefs.current[next]?.focus();
  };

  const openAt = (index: number) => {
    setOpen(true);
    // The menu is already mounted, so focus can move on the next frame without
    // waiting for a render pass that adds it.
    requestAnimationFrame(() => focusItem(index));
  };

  // Opening lands on what is already chosen, in the first group that has a
  // choice — never on a heading, never on nothing.
  const selectedIndex = Math.max(0, flat.findIndex(
    (entry) => entry.option.value === entry.group.selected));

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(selectedIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(flat.length - 1);
    }
  };

  const onItemKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); focusItem(index + 1); break;
      case 'ArrowUp': event.preventDefault(); focusItem(index - 1); break;
      case 'Home': event.preventDefault(); focusItem(0); break;
      case 'End': event.preventDefault(); focusItem(flat.length - 1); break;
      case 'Escape': event.preventDefault(); close(true); break;
      case 'Tab': close(false); break;
      default: break;
    }
  };

  let cursor = -1;
  return (
    <div className={`${styles.menuRoot} ${className ?? ''}`.trim()} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.menuTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={controlLabel}
        onClick={() => (open ? close(false) : openAt(selectedIndex))}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>

      <div
        id={menuId}
        role="menu"
        aria-label={controlLabel}
        className={`${styles.menuList} ${placement === 'above' ? styles.menuListAbove : ''}`.trim()}
        hidden={!open}
      >
        {groups.map((group) => (
          <div
            key={group.label}
            role="group"
            aria-label={group.label}
            className={styles.menuGroup}
          >
            {/* The group is named to assistive technology by `aria-label`, so
                the visible heading is decoration and is hidden from the
                accessibility tree rather than announced a second time. */}
            {showGroupLabels ? (
              <span className={styles.menuGroupLabel} aria-hidden="true">{group.label}</span>
            ) : null}
            {group.options.map((option) => {
              cursor += 1;
              const index = cursor;
              const checked = option.value === group.selected;
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
                  onClick={() => { group.onChoose(option.value); setOpen(false); }}
                >
                  {option.label}
                </a>
              ) : (
                <button
                  key={option.value}
                  {...common}
                  type="button"
                  lang={option.lang}
                  onClick={() => { group.onChoose(option.value); close(true); }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The trigger a single-preference menu uses: its current value, and a caret. */
function ValueTrigger({ label }: { label: string }) {
  return (
    <>
      <span className={styles.menuTriggerLabel}>{label}</span>
      <span aria-hidden="true" className={styles.menuCaret} />
    </>
  );
}

/**
 * A gear. Symmetrical, so it is one of the few icons that needs no mirroring
 * in Arabic — the same reason the hamburger and the close cross do not mirror.
 */
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 2.4v2M10 15.6v2M17.6 10h-2M4.4 10h-2M15.37 4.63l-1.41 1.41M6.04 13.96l-1.41 1.41M15.37 15.37l-1.41-1.41M6.04 6.04L4.63 4.63"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
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

/** The language group, shared by the standalone switch and Settings. */
function useLanguageGroup(locale: Locale, mode: LanguageSwitchMode): MenuGroup {
  const pathname = usePathname();
  const labels: Record<Locale, string> = {
    en: copy[locale].languageEnglish,
    ar: copy[locale].languageArabic,
    fr: copy[locale].languageFrench,
  };
  const rest = pathname.replace(/^\/(en|ar|fr)(?=\/|$)/, '') || '';
  return {
    label: copy[locale].languageLabel,
    options: LOCALES.map((option) => ({
      value: option,
      label: labels[option],
      lang: option,
      href: mode === 'path' ? `/${option}${rest}` : undefined,
    })),
    selected: locale,
    onChoose: (value) => rememberLanguage(value as Locale),
  };
}

/**
 * The appearance group, shared by the standalone switch and Settings.
 *
 * The stored preference is read after mount. The inline head script has already
 * painted the correct theme, so this only syncs the control with what is on
 * screen — it never causes the first paint, and there is no hydration flash.
 */
function useAppearanceGroup(locale: Locale): MenuGroup & { current: AppearancePreference } {
  const [preference, setPreference] = useState<AppearancePreference>('system');
  const [mounted, setMounted] = useState(false);

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

  return {
    label: copy[locale].appearanceLabel,
    options: appearancePreferences.map((option) => ({ value: option, label: labels[option] })),
    // Before mount the stored value is unknown. Claiming `system` is chosen
    // would be a guess, so nothing is claimed until it is known.
    selected: mounted ? preference : null,
    onChoose: (value) => choose(value as AppearancePreference),
    current: preference,
  };
}

export function LanguageSwitch({
  locale,
  mode = 'preference',
  placement = 'below',
}: {
  locale: Locale;
  mode?: LanguageSwitchMode;
  placement?: MenuPlacement;
}) {
  const group = useLanguageGroup(locale, mode);
  const labels: Record<Locale, string> = {
    en: copy[locale].languageEnglish,
    ar: copy[locale].languageArabic,
    fr: copy[locale].languageFrench,
  };
  return (
    <PreferenceMenu
      controlLabel={`${copy[locale].languageLabel}: ${labels[locale]}`}
      trigger={<ValueTrigger label={labels[locale]} />}
      groups={[group]}
      placement={placement}
    />
  );
}

export function AppearanceSwitch({
  locale,
  placement = 'below',
}: {
  locale: Locale;
  placement?: MenuPlacement;
}) {
  const group = useAppearanceGroup(locale);
  const labels: Record<AppearancePreference, string> = {
    system: copy[locale].appearanceSystem,
    light: copy[locale].appearanceLight,
    dark: copy[locale].appearanceDark,
  };
  return (
    <PreferenceMenu
      controlLabel={`${copy[locale].appearanceLabel}: ${labels[group.current]}`}
      trigger={<ValueTrigger label={labels[group.current]} />}
      groups={[group]}
      placement={placement}
    />
  );
}

/**
 * Language and appearance behind one control.
 *
 * This is what the header spends its width on now: one gear instead of two
 * value-bearing dropdowns whose triggers grow with the length of the localized
 * word inside them. `Système`/`Apparence` and `حسب الجهاز` are both wider than
 * `System`, so the old header got narrower in exactly the two languages that
 * needed the most room.
 *
 * `icon` is the compact form for a header actions row. `labelled` names itself
 * and is for places with vertical room and no competition — the console
 * sidebar, and the narrow navigation panel.
 */
export function SettingsMenu({
  locale,
  mode = 'preference',
  variant = 'icon',
  placement = 'below',
  className,
}: {
  locale: Locale;
  mode?: LanguageSwitchMode;
  variant?: 'icon' | 'labelled';
  placement?: MenuPlacement;
  className?: string;
}) {
  const language = useLanguageGroup(locale, mode);
  const appearance = useAppearanceGroup(locale);
  const label = copy[locale].settingsLabel;

  return (
    <PreferenceMenu
      controlLabel={label}
      className={`${variant === 'icon' ? styles.iconTrigger : styles.labelledTrigger} ${className ?? ''}`.trim()}
      trigger={
        <>
          <GearIcon />
          {variant === 'labelled' ? (
            <>
              <span className={styles.menuTriggerLabel}>{label}</span>
              <span aria-hidden="true" className={styles.menuCaret} />
            </>
          ) : null}
        </>
      }
      groups={[language, appearance]}
      showGroupLabels
      placement={placement}
    />
  );
}
