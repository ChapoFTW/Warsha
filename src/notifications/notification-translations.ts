import { useLocalization } from '@/src/i18n/localization';

import { copy } from './notification-copy';

/**
 * The hook form, for React Native screens.
 *
 * The copy itself lives in notification-copy.ts, which imports nothing and
 * is therefore usable from the web app too. Everything that was exported from
 * here still is, so no caller had to change.
 */
export type { NotificationCopyKey } from './notification-copy';
export {
  copy,
  legacyNotificationEventCopy,
  notificationBodyKey,
  notificationCopyKey,
} from './notification-copy';

import type { NotificationCopyKey } from './notification-copy';

export function useNotificationText() {
  const { language } = useLocalization();
  return (key: NotificationCopyKey) => copy[language][key];
}
