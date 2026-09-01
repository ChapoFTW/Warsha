'use client';

import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';
import { installGlobalErrorHandlers } from '../../src/observability/global-error-handlers.ts';

/**
 * Reports the browser failures no error boundary sees.
 *
 * `error.tsx` catches what React throws while rendering a route. It does not
 * catch an unhandled promise rejection, an error inside an event handler, or
 * anything thrown outside the React tree — and those are the majority of the
 * ways a page actually misbehaves.
 *
 * Rendered once, from the one provider all three web trees share, so the public
 * site, the application and the admin console are covered by one mount rather
 * than by three that could drift apart.
 *
 * Renders nothing.
 */
export function GlobalErrorReporting() {
  useEffect(() => installGlobalErrorHandlers({
    rpc: (name, args) => supabase().rpc(name, args),
    surface: window.location.hostname.startsWith('admin.') ? 'admin' : 'web',
  }), []);
  return null;
}
