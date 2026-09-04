// Warsha updates itself. This asserts that it does, and how.
//
// The defect this exists to prevent is not "realtime is broken" — it is
// "realtime is present on one platform". The web had none at all: a customer
// with a request open watched a page that would not change until they pressed
// reload, while the same customer on a phone saw the quote arrive. Same
// product, same database, two different answers to "is this current?".
//
// So the assertions are mostly about SHAPE rather than about behaviour, because
// shape is what stops the two platforms diverging again:
//
//   - one description of what each domain subscribes to, read by both;
//   - two transports and no third;
//   - a realtime event used as a signal to refetch, never as the data;
//   - more than one way to find out, because a websocket misses things;
//   - subscriptions that are named for an identity and torn down with it.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { realtimeChannels } from '../src/realtime/realtime-channels.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

const read = (path: string) => readFileSync(path, 'utf8');

// ---------------------------------------------------------------------------
// 1. One description, two transports
// ---------------------------------------------------------------------------

const channels = read('src/realtime/realtime-channels.ts');
const nativeTransport = read('src/realtime/realtime-service.ts');
const webTransport = read('web/lib/use-warsha-realtime.ts');

check(/realtimeChannels/.test(nativeTransport) && /realtimeChannels|RealtimeChannelSpec/.test(webTransport),
  'BOTH PLATFORMS READ THE SAME CHANNEL DESCRIPTIONS');
check(!/client\.channel\(/.test(channels),
  'and the description itself opens no sockets — it is data, not a transport');

// Anything else calling `.channel(` is a third transport nobody is maintaining.
function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

const sanctioned = new Set([
  join('src', 'realtime', 'realtime-service.ts'),
  join('web', 'lib', 'use-warsha-realtime.ts'),
  // The description file names `postgres_changes` in prose. It opens no
  // sockets, which is asserted separately above rather than assumed here.
  join('src', 'realtime', 'realtime-channels.ts'),
]);
const rogue = [...walk('src'), ...walk('app'), ...walk('components'), ...walk(join('web', 'app')), ...walk(join('web', 'components')), ...walk(join('web', 'lib'))]
  .filter((file) => !sanctioned.has(file))
  .filter((file) => /\.channel\(|postgres_changes/.test(read(file)));
assert.deepEqual(rogue, [],
  'NO SCREEN OPENS ITS OWN REALTIME CHANNEL — THERE ARE EXACTLY TWO TRANSPORTS');

// ---------------------------------------------------------------------------
// 2. The event is a signal, not the data
// ---------------------------------------------------------------------------
// A `postgres_changes` payload is one row from one table at one moment. A
// Warsha request is a request, its quotes, its deadlines and a computed count.
// Rebuilding that from a row diff would be a second implementation of every
// RPC — and wrong in exactly the conditions realtime is worst at.
//
// It also settles duplication and ordering for free: there is nothing to append
// and nothing to merge, so a duplicate event costs one extra refetch and an
// out-of-order event cannot regress a lifecycle state.

check(/doorbell, never a delivery|signal, not data/.test(webTransport),
  'the web transport treats an event as a signal to refetch');
check(/handler\.current\(\)/.test(webTransport) && !/payload\.new/.test(webTransport),
  'AND NEVER RENDERS THE PAYLOAD ITSELF');
check(/select: \['id'\]/.test(nativeTransport),
  'the native transport asks for the id and nothing else, so no row content crosses the socket');

// ---------------------------------------------------------------------------
// 3. Filters, because RLS is a boundary and not a router
// ---------------------------------------------------------------------------
// RLS decides what a subscriber is entitled to. It does not stop the server
// evaluating and forwarding every change on a table to everybody who can see
// any of it. An unfiltered binding is a client woken up to discover that most
// events were not about it.

const specs = [
  realtimeChannels.customerMarketplaceRequests('u'),
  realtimeChannels.workerMarketplaceInvitations('p'),
  realtimeChannels.notifications('u'),
  realtimeChannels.customerBookings('u'),
  realtimeChannels.providerJobs('p'),
  realtimeChannels.bookingConversation('b'),
];
for (const spec of specs) {
  for (const binding of spec.bindings) {
    // `worker_quotes` on the customer channel is the one exception, and it is
    // documented in the source: the table has no customer column to filter on.
    if (spec.name.startsWith('marketplace-requests') && binding.table === 'worker_quotes') continue;
    check(Boolean(binding.filter),
      `${spec.name} filters its ${binding.table} binding to the subscriber`);
  }
}
check(/no `customer_id` to filter on/.test(channels),
  'AND THE ONE UNFILTERED BINDING SAYS WHY, SO IT IS A DECISION RATHER THAN AN OVERSIGHT');

// A channel name carries the identity it serves, which is what makes a stale
// channel impossible to confuse with a fresh one after a sign-out.
check(realtimeChannels.notifications('abc').name === 'notifications:abc',
  'a channel is named for the identity it serves');
check(realtimeChannels.workerMarketplaceInvitations('p1').name !== realtimeChannels.workerMarketplaceInvitations('p2').name,
  'AND TWO IDENTITIES NEVER SHARE A CHANNEL NAME');

// ---------------------------------------------------------------------------
// 4. A websocket is never the only way to find out
// ---------------------------------------------------------------------------
// Events are missed while a tab is discarded, while a laptop sleeps, and in the
// window between a socket dropping and reconnecting.

check(/visibilitychange/.test(webTransport), 'the web revalidates when a tab becomes visible again');
check(/'online'/.test(webTransport), 'and when the browser comes back online');
check(/status === 'SUBSCRIBED'\) reconcile\(\)/.test(webTransport),
  'AND ON RESUBSCRIBE, WHICH IS WHAT TURNS A RECONNECT INTO A CATCH-UP');

const nativeContexts = ['src/marketplace-intelligence/marketplace-context.tsx',
  'src/bookings/booking-context.tsx', 'src/notifications/notification-context.tsx',
  'src/provider-jobs/provider-job-context.tsx'];
for (const path of nativeContexts) {
  check(/AppState\.addEventListener/.test(read(path)),
    `${path.split('/')[1]} refreshes when the app returns to the foreground`);
}
check(/status==='connected'\)reconcile\(\)/.test(read('src/marketplace-intelligence/marketplace-context.tsx')),
  'and the native marketplace reconciles on reconnect as well');
check(/void market\.reloadOfferCapacity\(\)/.test(read('app/worker-quotes.tsx')),
  'the worker screen also refetches on focus, which covers a socket that dropped while the phone slept');

// ---------------------------------------------------------------------------
// 5. No aggressive polling
// ---------------------------------------------------------------------------
// The lazy fix for all of the above is a timer. A one-second poll multiplied by
// every open screen is a self-inflicted denial of service.

for (const file of [...walk('src'), ...walk(join('web', 'lib')), ...walk(join('web', 'app'))]) {
  const source = read(file);
  for (const match of source.matchAll(/setInterval\([^,]+,\s*(\d+)/g)) {
    check(Number(match[1]) >= 30_000,
      `${file} polls no faster than every 30 seconds (found ${match[1]}ms)`);
  }
}
check(!/setInterval/.test(webTransport) && !/setInterval/.test(nativeTransport),
  'NEITHER TRANSPORT POLLS AT ALL — EVENTS AND FOCUS ARE THE TRIGGERS');

// ---------------------------------------------------------------------------
// 6. Cleanup
// ---------------------------------------------------------------------------
// A channel left open after navigation is a leak that compounds with every page
// visit; one left open after a sign-out is a socket still delivering the
// previous account's rows.

check(/removeChannel\(channel\)/.test(nativeTransport) && /removeChannel\(channel\)/.test(webTransport),
  'both transports remove their channel on teardown');
check(/removeEventListener\('visibilitychange'[\s\S]*?removeEventListener\('online'/.test(webTransport),
  'AND THE WEB REMOVES ITS FRESHNESS LISTENERS TOO, SO A REMOUNT DOES NOT STACK THEM');
check(/\[spec\?\.name\]/.test(webTransport),
  'the subscription is keyed on the channel name, so an inline spec object does not resubscribe every render');

// ---------------------------------------------------------------------------
// 7. The surfaces the review named
// ---------------------------------------------------------------------------
// Each of these is a specific complaint: "I had to refresh to see it."

const liveSurfaces = [
  ['web/app/app/requests/page.tsx', 'customerMarketplaceRequests', 'a customer sees a quote arrive'],
  ['web/app/app/worker/opportunities/page.tsx', 'workerMarketplaceInvitations', 'a worker sees an invitation and their capacity change'],
  ['web/app/app/jobs/page.tsx', 'customerBookings', 'a customer sees the job move'],
  ['web/app/app/worker/jobs/page.tsx', 'providerJobs', 'a worker sees the customer respond'],
  ['web/app/app/notifications/page.tsx', 'notifications', 'a notification appears'],
] as const;

for (const [path, channel, story] of liveSurfaces) {
  const source = read(path);
  check(/useWarshaRealtime/.test(source), `${story} — the page subscribes`);
  check(source.includes(`realtimeChannels.${channel}`), `and to the right channel (${channel})`);
}

console.log(`Realtime coverage: ${checks} checks passed.`);
