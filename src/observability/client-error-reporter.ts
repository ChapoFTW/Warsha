/**
 * Telling Warsha that a client broke.
 *
 * Until this existed there was no path at all: no error boundary on either
 * surface, no unhandled-rejection handler, and no endpoint to report to. An
 * uncaught render error was a blank screen, and the first anybody heard of it
 * was a customer saying the app had stopped working.
 *
 * What is sent is deliberately thin: the error's class, the component it came
 * from, and which surface. Not the message, and not the stack.
 *
 * That is not laziness. `private.operational_payload_safe` refuses any log
 * value that looks like a JWT, an email address or an Egyptian phone number,
 * and refuses a key called `message` outright, because an operations log is
 * read by staff and a client error message is unbounded text from somebody's
 * device — it routinely carries the URL they were on and the record they were
 * opening. "TypeError in DiscoverPage on web" identifies a defect precisely and
 * says nothing about the person who met it.
 *
 * A crash reporter with messages and stacks is a vendor SDK's job, under its
 * own retention rules and its own data-processing agreement. See
 * `docs/operations/observability.md`.
 */

export type WarshaSurface = 'web' | 'native' | 'admin';

/** The shape of whatever client the caller already has. */
export type ErrorReportRpc = (
  name: 'report_client_error',
  args: {
    p_surface: WarshaSurface;
    p_name: string;
    p_component: string | null;
    p_fatal: boolean;
  },
) => PromiseLike<unknown>;

/**
 * The error's class, as narrowly as it can be established.
 *
 * `error.name` for a real Error, the constructor otherwise, and a plain label
 * for the things people throw that are not errors at all.
 */
export function errorClassOf(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  if (typeof error === 'string') return 'ThrownString';
  if (error && typeof error === 'object') {
    const named = (error as { name?: unknown }).name;
    if (typeof named === 'string' && named) return named;
    return error.constructor?.name ?? 'ThrownObject';
  }
  return 'ThrownValue';
}

/**
 * Reports a client failure, and never becomes one itself.
 *
 * Every failure path here is swallowed on purpose. A reporter that throws
 * inside an error boundary takes the boundary down with it, and a reporter that
 * rejects unhandled re-enters the very handler that called it. Losing a report
 * is acceptable; looping is not.
 */
export async function reportClientError(
  rpc: ErrorReportRpc,
  input: {
    surface: WarshaSurface;
    error: unknown;
    component?: string | null;
    fatal?: boolean;
  },
): Promise<void> {
  try {
    await rpc('report_client_error', {
      p_surface: input.surface,
      p_name: errorClassOf(input.error),
      p_component: input.component ?? null,
      p_fatal: input.fatal ?? false,
    });
  } catch {
    // Deliberately silent. See above.
  }
}
