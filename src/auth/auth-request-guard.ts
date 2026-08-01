const requests = new Map<string, Promise<unknown>>();

/** Coalesces simultaneous OTP requests while allowing a later explicit resend. */
export function runAuthSingleFlight<T = void>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = requests.get(key);
  if (existing) return existing as Promise<T>;
  const pending = task().finally(() => requests.delete(key));
  requests.set(key, pending);
  return pending;
}

export function clearAuthSingleFlightsForTests() {
  requests.clear();
}
