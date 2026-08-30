// Who can open the staff console, and what happens to everybody else.
//
// The admin surface has never been driven. Ten routes exist and the only thing
// asserting anything about them is source-level. This opens each one in a real
// browser as four different principals and records what each is shown.
//
// LOCAL ONLY. It grants a staff role to a throwaway account and takes it back.
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ADMIN = BASE.replace('//', '//admin.');
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!API.startsWith('http://127.0.0.1')) throw new Error('local only');
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SR_KEY;
if (!ANON || !SERVICE) throw new Error('ANON_KEY and SR_KEY are required');

const { execFileSync } = await import('node:child_process');
const sql = (statement) => execFileSync('docker',
  ['exec', 'supabase_db_warsha', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', statement],
  { encoding: 'utf8' }).trim();

let checks = 0;
let failures = 0;
const check = (ok, label, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : '!!  '}${label}${detail ? `  ${detail}` : ''}`);
};

const ROUTES = ['/', '/analytics', '/audit', '/help', '/platform', '/providers',
  '/staff', '/users', '/verification'];

const makeUser = async (tag) => {
  const email = `admin-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@warsha.test`;
  const password = 'Str0ng!Passw0rd123';
  const created = await (await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true,
      user_metadata: { display_name: `Admin probe ${tag}`, preferred_language: 'en' } }),
  })).json();
  return { id: created.id, email, password };
};

const customer = await makeUser('customer');
const staff = await makeUser('staff');

// A staff principal, granted locally and revoked at the end. This is a test
// fixture, not a person.
//
// It must be a GOVERNED grant. `private.is_staff` also honours a legacy
// `user_roles` row with role 'admin' or 'support', and that is enough for the
// thirty-six RLS policies gated on it -- but the console refuses it, answering
// "your account is authenticated but has no active staff role". Two definitions
// of staff exist, and only one of them opens this surface.
sql(`insert into public.staff_role_grants
       (user_id, role_key, granted_at, reason, idempotency_key)
     values ('${staff.id}', 'super_administrator', now(),
             'local admin boundary journey fixture', 'admin-journey-${Date.now()}')
     on conflict do nothing;`);
// Grant history is immutable -- `prevent_staff_role_grant_mutation` refuses a
// delete, which is the right answer for an audit trail. The fixture is revoked
// the way a real grant is revoked, so the row stays and the access does not.
process.on('exit', () => {
  try {
    sql(`update public.staff_role_grants set revoked_at = now()
         where user_id = '${staff.id}' and revoked_at is null;`);
  } catch { /* best effort on the way out */ }
});
// `private.is_staff` reads `auth.uid()`, so it cannot be asked about somebody
// else from a psql session. The capability list can.
check(sql(`select 'legacy_domain_staff_actions'
             = any(private.staff_capability_keys('${staff.id}'));`) === 't',
'THE STAFF FIXTURE HOLDS A GOVERNED GRANT THAT CARRIES CONSOLE CAPABILITY');

const { chromium } = await import('playwright');
const browser = await chromium.launch();

const signIn = async (context, who) => {
  const page = await context.newPage();
  await page.goto(`${ADMIN}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const fields = await page.locator('input:visible').count();
  if (fields >= 2) {
    await page.fill('input[type="text"], input[type="email"]', who.email);
    await page.fill('input[type="password"]', who.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(6000);
  }
  return page;
};

const visit = async (page, route) => {
  await page.goto(ADMIN + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2400);
  return page.evaluate(() => ({
    path: location.pathname,
    text: document.body.innerText.replace(/\s+/g, ' ').trim(),
  }));
};

// --- 1. Anonymous ----------------------------------------------------------
console.log('\n--- anonymous ---');
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const route of ROUTES) {
    const seen = await visit(page, route);
    const shutOut = seen.path.includes('sign-in') || /sign in|denied|not authorised|not authorized/i.test(seen.text);
    check(shutOut, `anon is shut out of /admin${route}`,
      `-> ${seen.path} :: ${seen.text.slice(0, 46)}`);
  }
  await context.close();
}

// --- 2. A signed-in customer, who is not staff -----------------------------
console.log('\n--- signed-in customer (not staff) ---');
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await signIn(context, customer);
  for (const route of ROUTES) {
    const seen = await visit(page, route);
    // The console must refuse a customer. It says so in as many words -- "this
    // console is not available to you… no active staff role" -- so the check is
    // that the refusal is present, not that particular words are absent. A
    // keyword blocklist fails here because the refusal itself contains the word
    // "staff".
    const refused = /not available to you|no active staff role|sign in|denied|not authoris|not authoriz/i
      .test(seen.text);
    check(refused, `A CUSTOMER IS REFUSED AT /admin${route}`,
      `-> ${seen.path} :: ${seen.text.slice(0, 44)}`);
  }
  await context.close();
}

// --- 3. Staff -------------------------------------------------------------
console.log('\n--- staff ---');
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await signIn(context, staff);
  const errors = [];
  const seenTexts = new Map();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 110)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/ERR_ABORTED|preload|favicon/.test(m.text())) return;
    errors.push(m.text().slice(0, 110));
  });
  for (const route of ROUTES) {
    const before = errors.length;
    const seen = await visit(page, route);
    const refused = /not available to you|no active staff role/i.test(seen.text);
    seenTexts.set(route, seen.text);
    check(!refused && seen.text.length > 40 && errors.length === before,
      `staff opens /admin${route}`,
      `${seen.text.length} chars${refused ? '  REFUSED' : ''}`
      + `${errors.length > before ? '  ERRORS: ' + errors.slice(before).join(' | ') : ''}`);
  }
  // Nine routes that all render the same thing are one route with nine names.
  const distinct = new Set([...seenTexts.values()].map((t) => t.slice(0, 400)));
  check(distinct.size > 1,
    'AND THE CONSOLE ROUTES ARE NOT ALL THE SAME PAGE',
    `${distinct.size} distinct renderings across ${seenTexts.size} routes`);
  await context.close();
}

await browser.close();
console.log(`\n${checks} admin boundary checks, ${failures} failed`);
if (failures) process.exitCode = 1;
