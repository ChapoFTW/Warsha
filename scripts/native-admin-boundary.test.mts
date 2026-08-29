/**
 * Administration is web-only, and stays that way.
 *
 * `AGENTS.md` and `docs/constitution/cross-platform-parity.md` say Warsha's
 * administration lives on the web. For a long time that was true of the routes
 * and false of the code: `src/admin/` held a complete second staff console —
 * capability resolution, dual control, re-authentication, queue sorting, safe
 * search, a metric catalogue and its copy — alongside native staff repositories
 * for legal, privacy, onboarding and trust. None of it was reachable from any
 * screen, and none of it was noticed, because the only thing looking at it was
 * a set of tests reading its source text. It was retired on 2026-08-29.
 *
 * Nothing stops it coming back except this file.
 *
 * The rule is narrow on purpose. A worker verifying their own identity, a
 * customer reading their own privacy page, a provider seeing their own
 * earnings — those are self-service, they are native, and they must stay. What
 * may not exist on a phone is a surface for acting on OTHER people's records:
 * a staff repository, a staff console, an admin screen, a moderation queue.
 *
 * The distinction is capability. Self-service reads your own row under RLS; an
 * administration surface calls a `staff_*` RPC that begins with
 * `require_staff_capability`. So the test looks for the capability, not for the
 * word "admin", which appears legitimately in `EXPO_PUBLIC_ADMIN_SURFACE` and
 * in the icon gallery it gates.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const check = (condition: unknown, message: string) => { checks += 1; assert.ok(condition, message); };
const equal = <T,>(actual: T, expected: T, message: string) => {
  checks += 1; assert.equal(actual, expected, message);
};

const nativeFiles = execFileSync('git', ['ls-files', 'app', 'src', 'components'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((file) => /\.tsx?$/.test(file));

// ---------------------------------------------------------------------------
// 1. No native module calls a staff capability surface
// ---------------------------------------------------------------------------
// `staff_*` RPCs are the administration surface. A native file calling one is
// an admin client, whatever it is named.

const STAFF_RPC = /rpc\(\s*['"`]staff_[a-z_]+['"`]/;
const callers = nativeFiles.filter((file) => STAFF_RPC.test(read(file)));
equal(callers.join(', '), '',
  'NO NATIVE MODULE CALLS A staff_* RPC');

const capabilityUsers = nativeFiles.filter((file) =>
  /require_staff_capability|staff_capability_keys|hasEveryCapability/.test(read(file)));
equal(capabilityUsers.join(', '), '',
  'AND NONE RESOLVES A STAFF CAPABILITY ON DEVICE');

// ---------------------------------------------------------------------------
// 2. No native module is shaped like a staff or admin surface
// ---------------------------------------------------------------------------
// Belt and braces for the case where somebody adds the files before the calls.

const shaped = nativeFiles.filter((file) =>
  /(^|\/)admin[-/]|[-/]staff-(repository|console|types|copy)|moderation-queue/i.test(file));
equal(shaped.join(', '), '',
  'NO NATIVE FILE IS SHAPED LIKE AN ADMIN OR STAFF MODULE');

for (const gone of ['src/admin', 'src/trust', 'app/admin']) {
  check(!existsSync(join(root, gone)), `${gone} has not returned`);
}

// ---------------------------------------------------------------------------
// 3. The rule does not catch self-service
// ---------------------------------------------------------------------------
// A test that forbade the word "admin" would fail on the icon gallery, and a
// test that forbade "verification" would fail on the screen a worker uses to
// verify themselves. Both must keep passing, or the guard above is too broad
// and somebody will weaken it rather than argue with it.

for (const selfService of [
  'app/provider-verification.tsx',
  'app/privacy.tsx',
  'app/provider-earnings.tsx',
  'app/icon-gallery.tsx',
]) {
  check(existsSync(join(root, selfService)),
    `self-service surface ${selfService} still exists`);
  check(!STAFF_RPC.test(read(selfService)),
    `and ${selfService} reaches no staff surface`);
}
check(/adminSurfaceEnabled/.test(read('app/icon-gallery.tsx')),
  'THE ADMIN BUILD SWITCH IS STILL A LEGITIMATE NATIVE GATE');

// ---------------------------------------------------------------------------
// 4. The administration that does exist is the web one
// ---------------------------------------------------------------------------

check(existsSync(join(root, 'web/app/admin/page.tsx')),
  'the staff console exists on the web');
for (const area of ['analytics', 'audit', 'platform', 'providers', 'staff', 'users', 'verification']) {
  check(existsSync(join(root, 'web/app/admin', area, 'page.tsx')),
    `the web console still serves ${area}`);
}
const webStaffCallers = execFileSync('git', ['ls-files', 'web/lib', 'web/app'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((file) => /\.tsx?$/.test(file))
  .filter((file) => /staff_[a-z_]+/.test(read(file)));
check(webStaffCallers.length > 0,
  'AND IT IS THE WEB THAT CALLS THE STAFF SURFACES');

// ---------------------------------------------------------------------------
// 5. The constitution still says so
// ---------------------------------------------------------------------------
// If somebody decides administration should be native again, that is an
// architectural change and this rule should be deleted deliberately — starting
// with the sentence it enforces.

check(/[Aa]dministration is web-only/.test(read('AGENTS.md')),
  'AGENTS.md still states that administration is web-only');

console.log(`Native admin boundary: ${checks} checks passed.`);
