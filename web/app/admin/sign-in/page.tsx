'use client';

import { useEffect } from 'react';

import { useStaff } from '@/components/staff-gate';
import { canUseConsole } from '@/lib/staff';

/**
 * `admin.usewarsha.com/sign-in`.
 *
 * A real route, so refreshing or deep-linking here works rather than returning
 * a 404 — which is exactly what it did before, because the gate linked to a
 * path that had never been created.
 *
 * Reaching this component at all means the gate has already resolved a *staff*
 * session: an anonymous visitor is shown the sign-in form by the gate itself,
 * and an authenticated non-staff visitor gets the access-denied state. So the
 * only person who lands here is somebody already signed in and authorised, and
 * the right thing to do with them is send them to the console instead of
 * showing a sign-in form they do not need.
 *
 * `replace`, not `push`: a signed-in operator pressing Back should return to
 * wherever they came from, not bounce off this redirect.
 */
export default function AdminSignInPage() {
  const { session } = useStaff();

  useEffect(() => {
    if (canUseConsole(session)) window.location.replace('/');
  }, [session]);

  return null;
}
