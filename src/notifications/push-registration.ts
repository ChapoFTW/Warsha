/**
 * The device half of push: permission, token, lifecycle, and the tap.
 *
 * Everything that needs a phone is here. The rules it follows are in
 * `notification-push-adapter.ts`, which is pure and tested in Node; this file
 * is the wiring that supplies real inputs to them, so it stays deliberately
 * thin and makes no decisions of its own.
 *
 * ## The installation identifier, and why the token is not one
 *
 * A push token is not stable. The operating system reissues it after a
 * reinstall, a restore from backup, and sometimes for its own reasons. An app
 * that only ever registered would leave a trail of dead rows, and — worse —
 * a phone that received two live tokens would get every notification twice.
 *
 * So each installation generates one identifier the first time it needs one and
 * keeps it in the same secure storage the session lives in. The server treats
 * that as the identity of the device and REPLACES the token under it. Losing it
 * (a reinstall) is harmless: a new installation registers a new row, and the old
 * row's token stops working at the provider and is revoked on first failure.
 *
 * It is a random v4 UUID and nothing else. Not the advertising id, not the
 * Android id, not the vendor id — Warsha has no use for a value that follows a
 * person between applications, and asking for one would be a privacy claim it
 * cannot justify.
 *
 * ## Signing out
 *
 * `revokeOnSignOut` is the most important function here. A token that outlives
 * a session means the next person to hold that phone receives the previous
 * person's notifications, and no amount of server-side care fixes it, because
 * the server has no way to know the device changed hands. It is called from the
 * sign-out path before the session is cleared, because afterwards there is no
 * longer an authenticated caller to revoke with.
 */

import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  isExpoPushToken,
  pushRegistrationDecision,
  readPushCapability,
  unknownPushCapability,
  type PushCapability,
  type PushPlatform,
  type PushRegistrationDecision,
} from './notification-push-adapter';

/** Same shape as every other Warsha preference key. */
export const pushInstallationKey = 'warsha:push:installation:v1';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

/** The narrow slice of a Supabase client this module needs. */
export type PushRpc = (name: string, args?: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: unknown;
}>;

function currentPlatform(): PushPlatform | 'unsupported' {
  if (Platform.OS === 'android' || Platform.OS === 'ios') return Platform.OS;
  // The browser can carry a web push token, but Warsha's web surface is a
  // separate Next.js application with its own service worker story and no
  // registration path today. Claiming support here would register tokens
  // nothing ever delivers to.
  return 'unsupported';
}

/** A v4 UUID from the platform's own generator, with a portable fallback. */
function newInstallationId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.trunc(Math.random() * 16);
    const digit = character === 'x' ? value : (value & 0x3) | 0x8;
    return digit.toString(16);
  });
}

export async function installationId(): Promise<string> {
  try {
    const stored = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(pushInstallationKey) ?? null
      : await SecureStore.getItemAsync(pushInstallationKey);
    if (stored && stored.length >= 8) return stored;
  } catch {
    // Unreadable storage is not a reason to give up on push; a fresh id
    // registers a new device row, which is the correct outcome anyway.
  }
  const created = newInstallationId();
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(pushInstallationKey, created);
    else await SecureStore.setItemAsync(pushInstallationKey, created, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch {
    // Same reasoning. An id that does not survive a restart still prevents the
    // duplicate-delivery case within one run.
  }
  return created;
}

export async function currentPermission(): Promise<PushPermission> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return 'granted';
    return settings.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function requestPermission(): Promise<PushPermission> {
  try {
    const settings = await Notifications.requestPermissionsAsync();
    if (settings.granted) return 'granted';
    return settings.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function fetchPushCapability(rpc: PushRpc): Promise<PushCapability> {
  try {
    const { data, error } = await rpc('get_my_push_state');
    if (error) return unknownPushCapability;
    return readPushCapability(data);
  } catch {
    return unknownPushCapability;
  }
}

/**
 * The Expo push token for this device, or null.
 *
 * The project id is required by `getExpoPushTokenAsync` on a bare build and is
 * read from the same place the updates URL is, so there is one answer to "which
 * Expo project is this".
 */
export async function devicePushToken(projectId?: string): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return isExpoPushToken(token?.data) ? token.data : null;
  } catch {
    return null;
  }
}

/**
 * Bring the server's idea of this device in line with the device's own.
 *
 * Called on sign-in, on app foreground, and after the notification preference
 * changes. It is idempotent by construction — the server's registration is an
 * upsert keyed by installation — so calling it more often than necessary costs
 * one request and changes nothing.
 */
export async function syncPushRegistration(input: {
  rpc: PushRpc;
  signedIn: boolean;
  appVersion: string;
  language: 'en' | 'ar' | 'fr';
  projectId?: string;
  deviceLabel?: string | null;
  /** Injected so the decision can be exercised without touching the OS. */
  permission?: PushPermission;
  capability?: PushCapability;
}): Promise<PushRegistrationDecision> {
  const platform = currentPlatform();
  const installation = await installationId();
  const capability = input.capability ?? (input.signedIn
    ? await fetchPushCapability(input.rpc)
    : unknownPushCapability);
  const permission = input.permission ?? (platform === 'unsupported'
    ? 'denied'
    : await currentPermission());

  const decision = pushRegistrationDecision({
    platform,
    signedIn: input.signedIn,
    capability,
    permission,
    hasRegisteredToken: capability.deviceCount > 0,
  });

  if (decision.action === 'revoke') {
    await revokeDevice(input.rpc, installation);
    return decision;
  }
  if (decision.action !== 'register') return decision;

  const token = await devicePushToken(input.projectId);
  if (!token) return { action: 'skip', reason: 'unavailable' };

  try {
    await input.rpc('register_my_push_device', {
      p_token: token,
      p_platform: platform,
      p_app_version: input.appVersion,
      p_installation_id: installation,
      p_locale: input.language,
      p_device_label: input.deviceLabel ?? null,
    });
  } catch {
    // A registration that fails is retried on the next foreground. Failing
    // loudly here would put an error in front of somebody who did not ask for
    // anything.
  }
  return decision;
}

/**
 * Stop this device receiving anything for the account signing out.
 *
 * Must be called while the session still exists: the RPC identifies the caller
 * from `auth.uid()`, and after `signOut()` there is nobody to identify.
 */
export async function revokeOnSignOut(rpc: PushRpc): Promise<void> {
  await revokeDevice(rpc, await installationId());
}

async function revokeDevice(rpc: PushRpc, installation: string): Promise<void> {
  try {
    await rpc('revoke_my_push_device', { p_installation_id: installation });
  } catch {
    // Best effort by necessity: a device with no connectivity cannot revoke.
    // The server-side backstops are what make this safe — a token the provider
    // rejects is revoked, and registering the same token for another account
    // revokes the previous holder's row.
  }
}

/**
 * How a notification behaves while the app is open.
 *
 * A banner over the screen somebody is already reading is noise, and Warsha
 * already shows an in-app banner from the realtime subscription. So a push that
 * arrives in the foreground is not presented again — it is allowed to update
 * the badge and nothing more.
 */
export const foregroundPresentation: Notifications.NotificationBehavior = {
  shouldPlaySound: false,
  shouldSetBadge: true,
  shouldShowBanner: false,
  shouldShowList: true,
};

export function installForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => foregroundPresentation,
  });
}

/**
 * The Android channel.
 *
 * Android requires one before anything is shown, and its importance is fixed at
 * creation — changing it later has no effect on an installed app. `HIGH` is
 * chosen because the events that justify a push at all are the ones WPS-014
 * marked `action_required` or `critical`; quiet hours are enforced server-side
 * by delaying the send rather than by the channel, so the channel does not need
 * to be quiet.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('warsha-default', {
      name: 'Warsha',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
  } catch {
    // A channel that cannot be created means notifications will not display.
    // There is nothing useful to tell somebody about that at this point.
  }
}
