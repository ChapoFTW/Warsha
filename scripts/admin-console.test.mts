import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appCopy } from '../web/lib/app-copy.ts';
import { CONSOLE_AREAS, mayEnter, visibleAreas } from '../web/lib/console-areas.ts';
import { parseStaffSession } from '../web/lib/staff.ts';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const readWeb = (...parts: string[]) => readFileSync(join('web', ...parts), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// These RPCs are defined across several migrations, so the whole corpus is
// searched rather than one file that happened to hold the first of them.
const migrations = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(join('supabase/migrations', name), 'utf8'))
  .join('\n');

// --- Navigation names the capability the RPC actually demands ---------------
// If these disagreed, the console would offer a door onto a refusal.
const CAPABILITY_OF: Record<string, string> = {
  users: 'safe_search',
  verification: 'review_worker_vetting',
  staff: 'manage_staff_roles',
  audit: 'view_audit_logs',
};
for (const [key, capability] of Object.entries(CAPABILITY_OF)) {
  const area = CONSOLE_AREAS.find((candidate) => candidate.key === key);
  check(area?.capability === capability,
    `the ${key} area requires the capability its RPC demands (${capability})`);
}

// The capability strings must exist in the database, not just in the client.
const RPC_CAPABILITY: Record<string, string> = {
  staff_safe_search: 'safe_search',
  staff_worker_vetting_queue: 'review_worker_vetting',
  get_staff_role_directory: 'manage_staff_roles',
  staff_audit_search: 'view_audit_logs',
};
for (const [rpc, capability] of Object.entries(RPC_CAPABILITY)) {
  const body = migrations.slice(migrations.indexOf(`function public.${rpc}`));
  check(body.slice(0, 900).includes(`require_staff_capability('${capability}')`),
    `${rpc} REALLY DOES REQUIRE ${capability} IN THE DATABASE`);
}

// --- A session without capabilities sees nothing but the dashboard ----------
const nobody = parseStaffSession({ isStaff: true, platformReady: true, capabilities: [] });
equal(visibleAreas(nobody).map((a) => a.key), ['dashboard'],
  'A STAFF ACCOUNT WITH NO CAPABILITIES IS OFFERED NO PRIVILEGED AREA');
for (const href of ['/users', '/verification', '/staff', '/audit']) {
  check(!mayEnter(nobody, href), `${href} is not offered without its capability`);
}

const support = parseStaffSession({
  isStaff: true, platformReady: true, capabilities: ['safe_search'],
});
equal(visibleAreas(support).map((a) => a.key), ['dashboard', 'users'],
  'a capability grants exactly its own area and no other');
check(mayEnter(support, '/users'), 'the granted area is reachable');
check(!mayEnter(support, '/staff'),
  'SEARCHING USERS DOES NOT IMPLY MANAGING STAFF ROLES');
check(!mayEnter(support, '/audit'), 'nor reading the audit log');

const anonymous = parseStaffSession(null);
equal(visibleAreas(anonymous).map((a) => a.key), ['dashboard'],
  'a non-staff session is offered nothing privileged');
check(!mayEnter(anonymous, '/users'), 'a non-staff session may enter nothing');

// --- Least privilege in the pages themselves --------------------------------
for (const [page, capability] of [
  ['users', 'safe_search'],
  ['verification', 'review_worker_vetting'],
  ['staff', 'manage_staff_roles'],
  ['audit', 'view_audit_logs'],
] as const) {
  const source = readWeb('app', 'admin', page, 'page.tsx');
  check(source.includes(`hasCapability(session, '${capability}')`),
    `the ${page} page checks ${capability} before it calls anything`);
  check(/if \(!allowed\) return;|disabled=\{!allowed/.test(source),
    `the ${page} page does not fetch when the capability is absent`);
}

// --- The audit view cannot write --------------------------------------------
const audit = strip(readWeb('app', 'admin', 'audit', 'page.tsx'));
check(!/insert|update|delete|staff_record|staff_grant|staff_revoke/i.test(audit),
  'THE AUDIT VIEW HAS NO WRITE PATH; AN EDITABLE AUDIT TRAIL IS NOT ONE');
check(/p_from/.test(audit) && /p_to/.test(audit),
  'the audit query is bounded rather than unbounded over an append-only log');

// --- No privileged credential in the console --------------------------------
const consoleSources = ['users', 'verification', 'staff', 'audit']
  .map((page) => readWeb('app', 'admin', page, 'page.tsx'))
  .concat(readWeb('components', 'console-shell.tsx'), readWeb('lib', 'console-areas.ts'))
  .join('\n');
check(!/service_role|SERVICE_ROLE|supabase_admin/i.test(consoleSources),
  'NO SERVICE ROLE CREDENTIAL APPEARS ANYWHERE IN THE CONSOLE');
check(!/from\('auth\.users'\)|from\('profiles'\)/.test(consoleSources),
  'the console reads through governed RPCs, not directly from account tables');

// --- Bilingual, like every other surface ------------------------------------
const enKeys = Object.keys(appCopy.en).sort();
const arKeys = Object.keys(appCopy.ar).sort();
equal(arKeys, enKeys, 'every console string exists in both languages');
for (const key of ['usersTitle', 'verificationTitle', 'staffTitle', 'auditTitle', 'usersRefused']) {
  check(/[؀-ۿ]/.test(appCopy.ar[key as keyof typeof appCopy.ar]),
    `ar.${key} is written in Arabic`);
}

// --- Direction and overflow ---------------------------------------------------
const tableCss = readWeb('components', 'console-table.module.css');
check(/overflow-x: auto/.test(tableCss),
  'wide tables scroll inside their own container, so the page never scrolls sideways');
check(/direction: ltr/.test(tableCss) && /unicode-bidi: isolate/.test(tableCss),
  'IDENTIFIERS STAY LEFT-TO-RIGHT INSIDE AN ARABIC PAGE');
check(!/margin-left|margin-right|text-align:\s*left/.test(tableCss),
  'the console holds no physical direction that would strand Arabic');
const shellCss = readWeb('components', 'console-shell.module.css');
check(/border-inline-end/.test(shellCss),
  'the sidebar sits on the reading edge and mirrors in Arabic');

console.log(`Admin console: ${checks} checks passed.`);
