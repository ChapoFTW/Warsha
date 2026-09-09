import type { ThemeColors } from '@/constants/theme';

import type { NotificationPriority } from './notification-types';

/**
 * What a notification's priority looks like.
 *
 * There was one of these, privately, inside the notifications list screen — and
 * the banner did not have it. So a Critical security notice ("Password
 * changed") arrived looking exactly like an informational one: same bell, same
 * surface, same border. A screen reader heard "Critical."; the eye was told
 * nothing at all.
 *
 * That gap matters most for the person Warsha is hardest to build for. A
 * professional who does not read fluently cannot recover the severity from the
 * body text, so if the mark does not carry it, nothing does — and the alert
 * that says someone changed your password reads as routine.
 *
 * The mark itself is unchanged. This is the list's existing vocabulary moved
 * somewhere both surfaces can reach it, not a new one invented for the banner:
 * the same colour means the same thing in both places, which is the whole point
 * of having a mark at all.
 *
 * Colour keys are returned rather than resolved values because this module has
 * no business knowing which theme is active. Each surface maps the key through
 * its own `colors`.
 */
export const PRIORITY_COLOR_KEY: Record<NotificationPriority, keyof ThemeColors> = {
  // `errorText`, `warningText` and `actionPrimaryBackground` render exactly what
  // the list rendered before — they are the semantic names for the same values.
  // The legacy aliases `error`, `warning` and especially `white` are the ones
  // `scripts/audit-appearance.mjs` forbids in new code, and moving this mapping
  // was the moment to stop carrying them.
  critical: 'errorText',
  action_required: 'warningText',
  important: 'actionPrimaryBackground',
  informational: 'textMuted',
};

/** The colour a priority mark is painted, for the theme currently in use. */
export function priorityMarkColor(colors: ThemeColors, priority: NotificationPriority): string {
  return colors[PRIORITY_COLOR_KEY[priority]];
}
