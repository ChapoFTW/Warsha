const requests = new Map<string, Promise<void>>();

/** Coalesces simultaneous OTP requests while allowing a later explicit resend. */
export function runAuthSingleFlight(key: string, task: () => Promise<void>): Promise<void> {
  const existing = requests.get(key);
  if (existing) return existing;
  const pending = task().finally(() => requests.delete(key));
  requests.set(key, pending);
  return pending;
}

export function clearAuthSingleFlightsForTests() {
  requests.clear();
}
