'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { copy } from '@/lib/copy';
import { useWarshaPreferences } from '@/lib/preferences-context';
import {
  appearancePreferences,
  LOCALES,
  pathWithoutLocale,
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
 * than a header should spend permanently. The mobile client keeps its own
 * controls — same languages and same appearance semantics, a control shaped for
 * the platform.
 *
 * These live at the *bottom* of every web surface and nowhere else. Two earlier
 * attempts put them in the header: first as two value-bearing dropdowns, then
 * behind a single gear. Both competed with navigation and account actions for
 * the same row, and French settled it — with labels that long, anything extra
 * between the navigation and the auth buttons reads as clutter however compact
 * it is. A preference somebody sets once does not belong in the row they
 * navigate from every time. The header now carries brand, navigation and
 * account actions, and nothing else.
 *
 * Language remains a link wherever a link is meaningful. On the locale-prefixed
 * public site each choice is a real URL, so it stays an anchor inside the menu:
 * bookmarkable, openable in a new tab, and unchanged for anyone who reaches it
 * without JavaScript.
 */

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
 * Every one of these controls now sits at the bottom of its surface, so `above`
 * is the normal case: opening downward there would push the page taller every
 * time somebody used it.
 */
export type MenuPlacement = 'below' | 'above';

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
  placement = 'below',
  className,
}: {
  controlLabel: string;
  triggerLabel: string;
  options: MenuOption[];
  /** `null` while the stored value is still unknown, so nothing is claimed. */
  selected: string | null;
  onChoose: (value: string) => void;
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
        className={`${styles.menuList} ${placement === 'above' ? styles.menuListAbove : ''}`.trim()}
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
  placement = 'below',
}: {
  locale: Locale;
  mode?: LanguageSwitchMode;
  placement?: MenuPlacement;
}) {
  const pathname = usePathname();
  const { setLocale } = useWarshaPreferences();
  const labels: Record<Locale, string> = {
    en: copy[locale].languageEnglish,
    ar: copy[locale].languageArabic,
    fr: copy[locale].languageFrench,
  };
  // The page, not the home page. Switching language keeps somebody exactly
  // where they were — same route, same query, same fragment — because being
  // sent Home to change language is itself a way of losing your place.
  const rest = pathWithoutLocale(pathname);

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
      /* One writer. `setLocale` records the choice in the device store and in
         the cross-origin cookie, updates every consumer of the context at
         once, and sets `lang`/`dir` on the document. In `path` mode it runs
         synchronously on the anchor's click, before the browser leaves — so
         the destination is already served in the chosen language and the
         middleware has no stale cookie to send anybody back with. */
      onChoose={(value) => setLocale(value as Locale)}
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
  // Same store as the language, for the same reason: appearance was also being
  // read after mount by whichever control happened to be on screen, so two
  // surfaces rendering the control could disagree about what was chosen.
  const { appearance, setAppearance, hydrated } = useWarshaPreferences();

  const labels: Record<AppearancePreference, string> = {
    system: copy[locale].appearanceSystem,
    light: copy[locale].appearanceLight,
    dark: copy[locale].appearanceDark,
  };

  return (
    <PreferenceMenu
      controlLabel={copy[locale].appearanceLabel}
      triggerLabel={labels[appearance]}
      options={appearancePreferences.map((option) => ({
        value: option,
        label: labels[option],
      }))}
      // Before the browser's stored value has been read it is unknown.
      // Claiming `system` is chosen would be a guess, so nothing is claimed.
      selected={hydrated ? appearance : null}
      onChoose={(value) => setAppearance(value as AppearancePreference)}
      placement={placement}
    />
  );
}

/**
 * The pair, as they appear at the bottom of every web surface.
 *
 * One component, so the six places that need them cannot drift into six
 * slightly different arrangements, and so "where do preferences live" has a
 * single answer in the codebase as well as on screen.
 *
 * It is a labelled group rather than two loose controls: at the foot of a page
 * two unexplained dropdowns are a puzzle, and the heading is what makes them
 * findable by somebody who is looking for them rather than stumbling on them.
 */
export function PreferenceFooter({
  locale,
  mode = 'preference',
  className,
}: {
  locale: Locale;
  mode?: LanguageSwitchMode;
  className?: string;
}) {
  return (
    <div
      className={`${styles.preferenceFooter} ${className ?? ''}`.trim()}
      role="group"
      aria-label={copy[locale].footerPreferences}
    >
      {/* Named to assistive technology by the group above, so the visible
          heading is decoration and is not announced a second time. */}
      <span className={styles.preferenceFooterHeading} aria-hidden="true">
        {copy[locale].footerPreferences}
      </span>
      {/* Upward, because every one of these sits at the bottom of something. */}
      <LanguageSwitch locale={locale} mode={mode} placement="above" />
      <AppearanceSwitch locale={locale} placement="above" />
    </div>
  );
}
