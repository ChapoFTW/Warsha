/**
 * Keeps this device's push registration true, and opens what a tap points at.
 *
 * Renders nothing. It sits in the provider tree because the three things it
 * reacts to — the session, the language, and the app coming to the foreground —
 * are all context, and because registration has to be able to happen at any of
 * them, not only at launch.
 *
 * ## Why the sign-out revocation is here rather than in `signOut()`
 *
 * It looks like it belongs next to `auth.signOut()`. It does not, because a
 * session ends in more ways than somebody tapping Sign out: a refresh token
 * expires, a password change invalidates it elsewhere, an account is
 * deactivated by staff. Watching the session go covers all of them; hooking the
 * button covers one.
 *
 * The cost of missing one is precise and bad: a device that stays registered to
 * an account nobody is signed into any more keeps receiving that person's
 * notifications, and the next person to hold the phone reads them.
 *
 * ## Why nothing here decides anything
 *
 * Every rule lives in `notification-push-adapter.ts`, which Node can import and
 * the test suite exercises directly. This file supplies real inputs — is there
 * a session, what did the operating system say, what does the server allow —
 * and does what it is told.
 */

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/src/auth/auth-context';
import { environment } from '@/src/config/environment';
import { useLocalization } from '@/src/i18n/localization';
import { getSupabaseClient } from '@/src/lib/supabase';
import {
  notificationDestination,
  notificationModeFor,
} from '@/src/notifications/notification-destination';
import { readPushPayload } from '@/src/notifications/notification-push-adapter';
import {
  ensureAndroidChannel,
  installForegroundHandler,
  revokeOnSignOut,
  syncPushRegistration,
  type PushRpc,
} from '@/src/notifications/push-registration';
import type { NotificationMode } from '@/src/notifications/notification-types';
import { installGlobalErrorHandlers } from '@/src/observability/global-error-handlers';
import { useProviderFoundation } from '@/src/providers/provider-context';

const appVersion = Constants.expoConfig?.version ?? '1.0.0';
const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

export function PushNotificationSync() {
  const auth = useAuth();
  const provider = useProviderFoundation();
  const { language } = useLocalization();
  const signedIn = Boolean(auth.user?.id);
  const previousUser = useRef<string | null>(null);
  const mode: NotificationMode = provider.mode === 'provider' ? 'worker' : 'customer';
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (environment.dataMode !== 'supabase') return;
    installForegroundHandler();
    void ensureAndroidChannel();
  }, []);

  /*
   * The JavaScript failures no error boundary sees.
   *
   * `AppErrorBoundary` catches what React throws while rendering. It does not
   * catch an unhandled promise rejection — and this codebase is full of `void
   * somePromise()`, which is the idiom that makes them — nor anything thrown in
   * an event handler, a timer or a subscription callback. Those were silent.
   *
   * Installed here rather than in a component of its own because this is
   * already the root-level effect that renders nothing, and a second one would
   * be a second thing to remember to mount.
   */
  useEffect(() => {
    if (environment.dataMode !== 'supabase') return;
    return installGlobalErrorHandlers({
      rpc: (name, args) => getSupabaseClient().rpc(name, args),
      surface: 'native',
    });
  }, []);

  // Registration, and the revocation that has to happen before the session is
  // gone rather than after.
  useEffect(() => {
    if (environment.dataMode !== 'supabase') return;
    const rpc: PushRpc = (name, args) => getSupabaseClient().rpc(name, args);
    const userId = auth.user?.id ?? null;

    if (previousUser.current && previousUser.current !== userId) {
      void revokeOnSignOut(rpc);
    }
    previousUser.current = userId;

    if (!signedIn) return;
    void syncPushRegistration({ rpc, signedIn, appVersion, language, projectId });

    // The language is part of the registration, so changing it re-registers.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void syncPushRegistration({ rpc, signedIn: true, appVersion, language, projectId });
    });
    return () => subscription.remove();
  }, [auth.user?.id, language, signedIn]);

  // The tap. `resolve_notification_route` still decides whether this account may
  // open the thing, so a payload naming a booking somebody does not own opens
  // nothing — this only chooses which screen to ask for.
  useEffect(() => {
    if (environment.dataMode !== 'supabase') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = readPushPayload(response.notification.request.content.data);
      const destination = notificationDestination({
        routeType: payload.routeType as never,
        resourceId: payload.resourceId,
        mode: notificationModeFor(payload.audience, modeRef.current),
      });
      if (destination) router.push(destination as never);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
