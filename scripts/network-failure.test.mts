/**
 * What Warsha does when the network stops answering.
 *
 * The failure this covers is the one that produces no error at all. A
 * connection that opens and then stalls leaves `fetch` pending indefinitely —
 * there is no default timeout — so every screen awaiting it kept a spinner that
 * nothing could ever end. Not slow: permanent, and silent.
 *
 * These run against a fake `fetch` and a fake clock, so they are deterministic
 * and instant. What they cannot tell anybody is whether fifteen seconds is the
 * right number on a real Cairo 3G cell at rush hour; that is a device task, and
 * the point of `resolveRequestTimeouts` reading the environment is that tuning
 * it afterwards is a configuration change rather than a release.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  classifyRequest,
  createBoundedFetch,
  defaultRequestTimeouts,
  isRequestTimeout,
  maxAttempts,
  requestTimeoutEnvNames,
  resolveRequestTimeouts,
  retryDelayMs,
  RequestTimeoutError,
  shouldRetry,
  UNBOUNDED,
  type RequestClass,
} from '../src/data/request-policy.ts';

const root = process.cwd();
let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };

const BASE = 'https://project.supabase.co';

// ---------------------------------------------------------------------------
// 1. Every Warsha operation lands in a class, and the slow ones are not reads
// ---------------------------------------------------------------------------
// Classification is what makes one policy possible without one number. Getting
// it wrong in the SLOW direction is the expensive mistake: an identity
// photograph classified as a read would be cancelled at fifteen seconds, and
// the worker would be told their document failed.

equal(classifyRequest(`${BASE}/rest/v1/bookings?select=*`, 'GET'), 'read', 'a list query is a read');
equal(classifyRequest(`${BASE}/rest/v1/rpc/get_my_notifications`, 'POST'), 'mutation',
  'an RPC is a POST, so it is treated as a mutation — the cautious classification');
equal(classifyRequest(`${BASE}/rest/v1/bookings`, 'POST'), 'mutation', 'creating a booking is a mutation');
equal(classifyRequest(`${BASE}/rest/v1/bookings?id=eq.1`, 'PATCH'), 'mutation', 'so is updating one');
equal(classifyRequest(`${BASE}/auth/v1/token?grant_type=password`, 'POST'), 'auth', 'signing in is auth');
equal(classifyRequest(`${BASE}/auth/v1/signup`, 'POST'), 'auth', 'and so is signing up');
equal(classifyRequest(`${BASE}/auth/v1/recover`, 'POST'), 'auth', 'and password recovery');
equal(classifyRequest(`${BASE}/storage/v1/object/booking-attachments/x.jpg`, 'POST'), 'upload',
  'A PHOTOGRAPH IS AN UPLOAD, NOT A READ');
equal(classifyRequest(`${BASE}/storage/v1/object/booking-attachments/x.jpg`, 'GET'), 'read',
  'but fetching one back is a read');
equal(classifyRequest(`${BASE}/functions/v1/vision-extract`, 'POST'), 'ocr',
  'IDENTITY EXTRACTION IS OCR, WHICH IS ALLOWED TO TAKE A MINUTE');
equal(classifyRequest(`${BASE}/functions/v1/privacy-export`, 'POST'), 'privacy_export',
  'and building somebody’s data export is allowed to take two');
equal(classifyRequest(`${BASE}/functions/v1/location-proxy`, 'POST'), 'server_operation',
  'any other Edge Function is a server operation');
equal(classifyRequest(`${BASE}/realtime/v1/websocket`, 'GET'), 'realtime', 'the socket is its own thing');
equal(classifyRequest('nonsense', 'GET'), 'read',
  'and anything unrecognised gets the TIGHTEST bound, so a miss fails visibly');

// ---------------------------------------------------------------------------
// 2. The bounds
// ---------------------------------------------------------------------------
equal(defaultRequestTimeouts.realtime, UNBOUNDED,
  'THE WEBSOCKET IS NEVER TIMED OUT — IT HAS ITS OWN HEARTBEAT');
for (const requestClass of ['read', 'mutation', 'auth', 'upload', 'ocr', 'privacy_export', 'server_operation'] as const) {
  ok(defaultRequestTimeouts[requestClass] > 0, `${requestClass} is bounded`);
  ok(defaultRequestTimeouts[requestClass] <= 120_000, `${requestClass} is bounded by something a person would wait for`);
}
ok(defaultRequestTimeouts.read < defaultRequestTimeouts.mutation,
  'a read gives up before a write does, because an abandoned write may have happened');
ok(defaultRequestTimeouts.mutation < defaultRequestTimeouts.auth,
  'and auth waits longest of the three, because sign-up sends mail inline');
ok(defaultRequestTimeouts.ocr >= 2 * 20_000,
  'THE OCR BOUND COVERS THE EDGE FUNCTION’S OWN TWO 20s ATTEMPTS, SO WARSHA DOES NOT CANCEL A CALL IT PAID FOR');
// Derived, not guessed: the numbers the Edge Function actually uses.
const ocrProvider = read('supabase/functions/_shared/ocr-provider.ts');
match(ocrProvider, /OCR_TIMEOUT_MS = 20_000/, 'the OCR provider still allows 20s per attempt');
match(ocrProvider, /OCR_MAX_ATTEMPTS = 2/, 'and still allows two of them');

// ---------------------------------------------------------------------------
// 3. Thresholds are configurable, so a device can tune them without a build
// ---------------------------------------------------------------------------
equal(resolveRequestTimeouts({}), defaultRequestTimeouts, 'no environment means the documented defaults');
equal(resolveRequestTimeouts({ EXPO_PUBLIC_WARSHA_TIMEOUT_READ_MS: '9000' }).read, 9_000,
  'a device build can lower the read bound');
equal(resolveRequestTimeouts({ NEXT_PUBLIC_WARSHA_TIMEOUT_READ_MS: '9000' }).read, 9_000,
  'and so can the web, through its own prefix');
equal(resolveRequestTimeouts({ EXPO_PUBLIC_WARSHA_TIMEOUT_READ_MS: '5' }).read, defaultRequestTimeouts.read,
  'an absurdly small value is ignored rather than obeyed');
equal(resolveRequestTimeouts({ EXPO_PUBLIC_WARSHA_TIMEOUT_READ_MS: 'soon' }).read, defaultRequestTimeouts.read,
  'and so is nonsense');
for (const [requestClass, name] of Object.entries(requestTimeoutEnvNames) as [RequestClass, string][]) {
  ok(name.startsWith('WARSHA_TIMEOUT_'), `${requestClass} has a documented environment name`);
}

// ---------------------------------------------------------------------------
// 4. Retrying, and the one rule that matters
// ---------------------------------------------------------------------------
// Warsha creates bookings, quotes and payment attempts with POST. A timeout
// does not mean the server did nothing — it means Warsha stopped listening. A
// retried POST is how one tap becomes two bookings.

equal(maxAttempts('mutation', 'POST'), 1, 'A MUTATION IS ATTEMPTED ONCE, EVER');
equal(maxAttempts('auth', 'POST'), 1, 'and so is an auth call');
equal(maxAttempts('upload', 'POST'), 1, 'and an upload');
equal(maxAttempts('ocr', 'POST'), 1, 'and OCR, which costs money per call');
equal(maxAttempts('read', 'GET'), 2, 'a read may be asked for twice');

for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
  equal(shouldRetry({ requestClass: 'mutation', method, attempt: 1, outcome: { kind: 'timeout' } }), false,
    `a ${method} is NEVER retried after a timeout`);
  equal(shouldRetry({ requestClass: 'mutation', method, attempt: 1, outcome: { kind: 'network' } }), false,
    `a ${method} is not retried after a network failure either`);
}
equal(shouldRetry({ requestClass: 'read', method: 'GET', attempt: 1, outcome: { kind: 'timeout' } }), true,
  'a read is retried after a timeout, because asking twice costs a request');
equal(shouldRetry({ requestClass: 'read', method: 'GET', attempt: 2, outcome: { kind: 'timeout' } }), false,
  'but only once — retrying is bounded');
equal(shouldRetry({ requestClass: 'read', method: 'GET', attempt: 1, outcome: { kind: 'aborted' } }), false,
  'A CANCELLED REQUEST IS NEVER RESURRECTED — SOMEBODY CLOSED THAT SCREEN');
equal(shouldRetry({ requestClass: 'read', method: 'GET', attempt: 1, outcome: { kind: 'response', status: 503 } }), true,
  'a 503 is the server asking for patience');
equal(shouldRetry({ requestClass: 'read', method: 'GET', attempt: 1, outcome: { kind: 'response', status: 429 } }), true,
  'and so is a 429');
equal(shouldRetry({ requestClass: 'read', method: 'GET', attempt: 1, outcome: { kind: 'response', status: 404 } }), false,
  'a 404 will still be a 404 the second time');
equal(shouldRetry({ requestClass: 'read', method: 'GET', attempt: 1, outcome: { kind: 'response', status: 401 } }), false,
  'and an unauthorised request is not a network problem');
ok(retryDelayMs(1) > 0 && retryDelayMs(3) <= 2_000, 'the backoff is short and bounded');

// ---------------------------------------------------------------------------
// 5. The bounded fetch, against a stalled connection
// ---------------------------------------------------------------------------
// This is the actual defect, reproduced: a `fetch` that never settles.

const noSleep = async () => undefined;

async function expectTimeout(url: string, method: string) {
  // A socket that opened and then went quiet: the promise settles only when
  // something aborts it, which before this module was nothing, ever.
  const bounded = createBoundedFetch({
    fetch: (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
    timeouts: { ...defaultRequestTimeouts, read: 20, mutation: 20, auth: 20, upload: 20, ocr: 20, privacy_export: 20, server_operation: 20, realtime: 0 },
    sleep: noSleep,
  });
  return bounded(url, { method }).then(
    () => ({ settled: 'response' as const }),
    (error: unknown) => ({ settled: 'error' as const, error }),
  );
}

const stalledRead = await expectTimeout(`${BASE}/rest/v1/bookings`, 'GET');
equal(stalledRead.settled, 'error', 'A STALLED READ SETTLES INSTEAD OF SPINNING FOREVER');
ok(isRequestTimeout((stalledRead as { error: unknown }).error),
  'and it settles as a timeout the interface can name');

const stalledMutation = await expectTimeout(`${BASE}/rest/v1/bookings`, 'POST');
equal(stalledMutation.settled, 'error', 'a stalled mutation settles too');
ok(isRequestTimeout((stalledMutation as { error: unknown }).error), 'as a timeout');

// The message must not carry the URL: it reaches logs and the error reporter,
// and a Warsha URL contains record identifiers.
const timeoutError = new RequestTimeoutError('read', 15_000);
ok(!timeoutError.message.includes('http'), 'THE TIMEOUT MESSAGE CARRIES NO URL AND THEREFORE NO IDENTIFIER');
match(timeoutError.message, /read/, 'but it does say which kind of request gave up');

// ---------------------------------------------------------------------------
// 6. A read is retried exactly once; a mutation is not retried at all
// ---------------------------------------------------------------------------

let readAttempts = 0;
const retryingFetch = createBoundedFetch({
  fetch: async () => { readAttempts += 1; return new Response('', { status: 503 }); },
  sleep: noSleep,
});
const retried = await retryingFetch(`${BASE}/rest/v1/bookings`, { method: 'GET' });
equal(readAttempts, 2, 'a failing read is attempted twice');
equal(retried.status, 503, 'and the second failure is returned rather than thrown');

let mutationAttempts = 0;
const mutationFetch = createBoundedFetch({
  fetch: async () => { mutationAttempts += 1; return new Response('', { status: 503 }); },
  sleep: noSleep,
});
await mutationFetch(`${BASE}/rest/v1/bookings`, { method: 'POST' });
equal(mutationAttempts, 1, 'A FAILING MUTATION IS ATTEMPTED ONCE, SO ONE TAP IS ONE BOOKING');

let uploadAttempts = 0;
const uploadFetch = createBoundedFetch({
  fetch: async () => { uploadAttempts += 1; throw new Error('connection reset'); },
  sleep: noSleep,
});
await uploadFetch(`${BASE}/storage/v1/object/x`, { method: 'POST' }).catch(() => undefined);
equal(uploadAttempts, 1, 'and neither is an interrupted upload, which would double a file');

// A successful request is not retried and is returned unchanged.
let okAttempts = 0;
const okFetch = createBoundedFetch({
  fetch: async () => { okAttempts += 1; return new Response('{}', { status: 200 }); },
  sleep: noSleep,
});
const okResponse = await okFetch(`${BASE}/rest/v1/bookings`, { method: 'GET' });
equal(okAttempts, 1, 'a request that works is made once');
equal(okResponse.status, 200, 'and its response is passed straight through');

// ---------------------------------------------------------------------------
// 7. A caller's own cancellation still works
// ---------------------------------------------------------------------------
// Search-as-you-type cancels its previous request. That must stay possible, and
// must be reported as a cancellation rather than as a timeout, or the interface
// shows "check your connection" to somebody whose connection is fine.

const controller = new AbortController();
let cancelAttempts = 0;
const cancellable = createBoundedFetch({
  fetch: (_input, init) => new Promise<Response>((_resolve, reject) => {
    cancelAttempts += 1;
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }),
  sleep: noSleep,
});
const pending = cancellable(`${BASE}/rest/v1/search`, { method: 'GET', signal: controller.signal });
controller.abort();
const cancelled = await pending.then(() => null, (error: unknown) => error);
ok(cancelled !== null, 'a cancelled request settles');
ok(!isRequestTimeout(cancelled), 'AND IS NOT REPORTED AS A TIMEOUT, BECAUSE NOTHING TIMED OUT');
equal(cancelAttempts, 1, 'and is not retried');

// ---------------------------------------------------------------------------
// 8. Both clients use it, and neither invented its own
// ---------------------------------------------------------------------------

const nativeClient = read('src/lib/supabase.ts');
const webClient = read('web/lib/supabase-browser.ts');
match(nativeClient, /createBoundedFetch/, 'the mobile client is bounded');
match(webClient, /createBoundedFetch/, 'THE WEB CLIENT IS BOUNDED BY THE SAME MODULE');
match(webClient, /src\/data\/request-policy/, 'and reads the shared policy rather than restating it');
for (const source of [nativeClient, webClient]) {
  ok(/global:\s*\{[\s\S]{0,200}fetch:/.test(source),
    'the bound is installed as the client’s fetch, so no call site has to remember it');
}

// A timeout must reach the interface as something a person can act on.
const dataErrors = read('src/data/data-errors.ts');
match(dataErrors, /isRequestTimeout/, 'a timeout is recognised by the error mapper');
match(dataErrors, /isRequestTimeout\(reason\)\)return 'authNetworkError'/,
  'AND BECOMES "CHECK YOUR CONNECTION", WHICH IS BOTH TRUE AND ACTIONABLE');

console.log(`Network failure policy: ${checks} checks passed.`);
