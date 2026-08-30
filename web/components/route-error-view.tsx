'use client';

import { useEffect } from 'react';

import { appCopy } from '@/lib/app-copy';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { reportClientError, type WarshaSurface } from '@/src/observability/client-error-reporter';

import styles from '@/components/product-surface.module.css';

/**
 * What a person sees when a page throws, and how Warsha finds out.
 *
 * There were no error boundaries anywhere. An uncaught render error produced
 * the framework's own screen in development and a blank one in production, and
 * nothing was recorded — so the first report of a broken page was a customer
 * describing it.
 *
 * Two jobs, in this order of importance: give the person a way out, and tell
 * the server the class of thing that failed. The words are the ones Warsha
 * already uses for a failed load, in all three languages, because a person who
 * hits this does not need new vocabulary — they need the same sentence they
 * would get from any other failure, and a button.
 */
export function RouteErrorView({
  error,
  reset,
  surface,
  component,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  surface: WarshaSurface;
  component: string;
}) {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;

  useEffect(() => {
    // Fatal: this boundary only renders because the tree below it did not.
    void reportClientError(
      (name, args) => supabase().rpc(name, args),
      { surface, error, component, fatal: true },
    );
  }, [error, surface, component]);

  return (
    <main className={styles.panel} role="alert">
      <h1 className={styles.title}>{words.loadFailed}</h1>
      <button type="button" className={styles.action} onClick={reset}>
        {words.retry}
      </button>
    </main>
  );
}
