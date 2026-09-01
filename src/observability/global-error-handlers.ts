/**
 * The failures the error boundaries never see.
 *
 * `AppErrorBoundary` and `route-error-view` catch what React throws while
 * RENDERING. That is a minority of the ways a client actually breaks:
 *
 *   * an unhandled promise rejection — and this codebase is full of
 *     `void somePromise()`, which is the idiom that produces them;
 *   * an error thrown inside an event handler, a `setTimeout`, or a subscription
 *     callback, none of which is a render;
 *   * a fatal JS error outside the React tree entirely.
 *
 * None of those reaches a boundary. Every one of them was, until now, exactly
 * as invisible as an uncaught render error was before the boundaries existed:
 * the app misbehaves, nothing is recorded, and the first anybody hears is a
 * person saying it stopped working.
 *
 * This closes that. It reports the same three fields the boundaries do — class,
 * location, surface — through the same `report_client_error`, into the same
 * operations log. Deliberately not a second reporting system.
 *
 * ## What it still cannot see, and why that is a vendor's job
 *
 * A NATIVE crash. When the process dies in Java, Kotlin, Objective-C or Swift,
 * there is no JavaScript left to run and no handler that could report anything.
 * Catching those needs a native crash SDK that installs a signal handler and
 * writes a report to disk for the NEXT launch to upload. That is a decision with
 * an account, a price and a data-processing agreement attached; see
 * `docs/operations/observability.md`.
 *
 * ## Why every path here swallows its own failure
 *
 * A reporter that throws inside a global error handler re-enters the handler
 * that called it. A reporter that rejects produces an unhandled rejection,
 * which is the very thing being handled. Losing a report is acceptable;
 * looping is not, and on a phone a loop is a flat battery.
 */

import { reportClientError, type ErrorReportRpc, type WarshaSurface } from './client-error-reporter.ts';

/**
 * How many failures one session will report before it stops.
 *
 * A render loop or a subscription that rejects on every tick produces failures
 * faster than anybody can read them. `report_client_error` is already rate
 * limited server-side at thirty in five minutes per account, which protects the
 * LOG; this protects the DEVICE, which would otherwise spend its battery making
 * requests that are being discarded.
 */
export const globalReportCeiling = 12;

export type GlobalErrorHandlerOptions = {
  rpc: ErrorReportRpc;
  surface: WarshaSurface;
  /** Injected in tests. Defaults to the real global. */
  target?: {
    addEventListener?: (type: string, listener: (event: unknown) => void) => void;
    removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };
};

/**
 * Installs the handlers. Returns the function that removes them again.
 *
 * Idempotent per target: installing twice replaces rather than stacks, because
 * a fast refresh in development would otherwise chain a dozen handlers and
 * report one error a dozen times.
 */
export function installGlobalErrorHandlers(options: GlobalErrorHandlerOptions): () => void {
  const target = options.target ?? (globalThis as GlobalErrorHandlerOptions['target']);
  if (!target) return () => undefined;

  let reported = 0;
  const report = (error: unknown, component: string, fatal: boolean) => {
    if (reported >= globalReportCeiling) return;
    reported += 1;
    try {
      void reportClientError(options.rpc, {
        surface: options.surface,
        error,
        component,
        fatal,
      });
    } catch {
      // See the header. Never louder than the thing being reported.
    }
  };

  const teardown: (() => void)[] = [];

  /*
   * React Native's global JS handler.
   *
   * The previous handler is called afterwards rather than replaced: it is what
   * shows the red box in development and what ends the process on a fatal error
   * in production, and silently swallowing either would be worse than the
   * problem this solves.
   */
  const errorUtils = target.ErrorUtils;
  if (errorUtils?.setGlobalHandler && errorUtils.getGlobalHandler) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      report(error, 'global', Boolean(isFatal));
      previous?.(error, isFatal);
    });
    teardown.push(() => { if (previous) errorUtils.setGlobalHandler?.(previous); });
  }

  /*
   * The browser's two events.
   *
   * `unhandledrejection` is the one that matters most here. React Native also
   * emits it under Hermes with rejection tracking enabled, so this is not
   * web-only by intent — it is simply where it is reliable.
   */
  if (target.addEventListener && target.removeEventListener) {
    const onError = (event: unknown) => {
      const detail = event as { error?: unknown; message?: unknown };
      report(detail?.error ?? detail?.message ?? event, 'window', false);
    };
    const onRejection = (event: unknown) => {
      const detail = event as { reason?: unknown };
      report(detail?.reason ?? event, 'promise', false);
    };
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    teardown.push(() => {
      target.removeEventListener?.('error', onError);
      target.removeEventListener?.('unhandledrejection', onRejection);
    });
  }

  return () => { for (const undo of teardown) undo(); };
}
