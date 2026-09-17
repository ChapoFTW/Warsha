import { router } from 'expo-router';
import { Alert } from 'react-native';

import type { Language } from '@/src/i18n/translations';

import { isAccountRestrictedError, isCounterpartyUnavailableError } from './account-restriction';
import { trustText } from './trust-translations';

/**
 * Tells the person why the server refused an action, when the reason was an
 * account restriction (202609170006), and returns true. Anything else returns
 * false and the screen keeps its own message.
 *
 * A restricted person is offered the way to their status, which says why and
 * how to appeal. When the other person is the one who cannot take part, nobody
 * is told why.
 */
export function explainRestriction(reason: unknown, language: Language): boolean {
  if (isAccountRestrictedError(reason)) {
    Alert.alert(trustText(language, 'restrictedTitle'), trustText(language, 'restrictedBody'), [
      { text: trustText(language, 'close'), style: 'cancel' },
      { text: trustText(language, 'restrictedOpen'), onPress: () => router.push('/account-status') },
    ]);
    return true;
  }
  if (isCounterpartyUnavailableError(reason)) {
    Alert.alert(trustText(language, 'counterpartyUnavailable'));
    return true;
  }
  return false;
}
