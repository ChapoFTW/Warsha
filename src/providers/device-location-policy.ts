/**
 * User-safe outcomes for a foreground-only device location request.
 *
 * This module is import-free so the native error vocabulary can be tested in
 * Node. It deliberately exposes only a bounded native error code for developer
 * diagnostics; provider messages can contain device-specific detail and never
 * belong in UI or telemetry.
 */
export type DeviceFixResult =
  | { outcome: 'succeeded'; position: { latitude: number; longitude: number } }
  | { outcome: 'permission_denied'; canAskAgain: boolean }
  | { outcome: 'services_disabled' }
  | { outcome: 'provider_unavailable' }
  | { outcome: 'timed_out' }
  | { outcome: 'location_error'; code: string };

export function classifyDeviceLocationError(error: unknown): DeviceFixResult {
  const source = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown }
    : null;
  const rawCode = typeof source?.code === 'string' ? source.code : 'native_location_error';
  const code = /^[a-z0-9_.-]{1,80}$/i.test(rawCode) ? rawCode : 'native_location_error';
  const normalizedCode = code.toLowerCase();
  const message = typeof source?.message === 'string' ? source.message.toLowerCase() : '';

  if (
    normalizedCode.includes('permission')
    || message.includes('permission denied')
    || message.includes('not authorized to use location')
  ) {
    return { outcome: 'permission_denied', canAskAgain: false };
  }
  if (
    normalizedCode.includes('settings_unsatisfied')
    || message.includes('services are disabled')
    || message.includes('location services disabled')
    || message.includes('unsatisfied device settings')
  ) {
    return { outcome: 'services_disabled' };
  }
  if (
    normalizedCode.includes('timeout')
    || /timed?\s*out|time\s*out/.test(message)
  ) {
    return { outcome: 'timed_out' };
  }
  if (
    normalizedCode.includes('location_unavailable')
    || message.includes('location is unavailable')
    || message.includes('current location is unavailable')
    || message.includes('current location is unknown')
    || message.includes('location request has been rejected')
    || message.includes('no location provider')
  ) {
    return { outcome: 'provider_unavailable' };
  }
  return { outcome: 'location_error', code };
}
