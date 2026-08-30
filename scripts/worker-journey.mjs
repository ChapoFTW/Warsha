// A worker signs in and uses the product, in a real browser.
//
// The worker surface had never been driven. This opens every worker route as a
// real signed-in professional and checks the things that matter to them: that
// each page renders, that the money surface tells the truth about payouts being
// switched off, and that they cannot reach the customer's or anybody else's.
//
// LOCAL ONLY. It creates an account and a provider profile.
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const APP = BASE.replace('//', '//app.');
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

const email = `worker-${Date.now()}@warsha.test`;
const password = 'Str0ng!Passw0rd123';
const created = await (await fetch(`${API}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true,
    user_metadata: { display_name: 'Journey Worker', preferred_language: 'en' } }),
})).json();
if (!created.id) throw new Error('could not create the worker account');

// A published, verified professional -- the state a working worker is in.
const providerId = sql(`
  insert into public.provider_profiles (
    user_id, display_name, primary_category_id, profession_key, about,
    experience_years, rating_average, review_count, completed_jobs,
    starting_price_egp, response_time_label, location_label, service_radius_km,
    languages, skills, avatar_url, is_verified, is_available, is_published,
    onboarding_status, cancellation_policy, guarantee_text)
  values ('${created.id}', 'Journey Worker', 'plumbing', 'plumbing',
          'Fixture professional for the worker journey.',
          5, 4.7, 30, 60, 200, 'Usually replies in 10 minutes', 'Cairo', 10,
          array['Arabic','English'], array['Home service'],
          '${created.id}/avatar.jpg', true, true, true, 'approved',
          'Free cancellation before acceptance.', 'Warsha service support terms apply.')
  returning id;`);
check(Boolean(providerId), 'the worker fixture has a provider profile', providerId);

const payoutMode = sql('select payout_mode from private.payment_configuration;');
check(payoutMode === 'disabled',
  'payouts are switched off, which is what this journey expects to see reflected',
  payoutMode);

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const problems = [];
page.on('pageerror', (e) => problems.push(String(e).slice(0, 120)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/ERR_ABORTED|preload|favicon|location-proxy|503/.test(t)) return;
  problems.push(t.slice(0, 120));
});

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());

await page.goto(`${APP}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2400);
await page.fill('input[type="text"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForTimeout(7000);
check(!page.url().includes('/sign-in'), 'the worker signs in',
  new URL(page.url()).pathname);

for (const [name, path] of [
  ['worker home', '/worker'],
  ['opportunities', '/worker/opportunities'],
  ['jobs', '/worker/jobs'],
  ['earnings', '/worker/earnings'],
  ['profile', '/worker/profile'],
  ['verification', '/worker/verification'],
  ['onboarding', '/worker/onboarding'],
]) {
  const before = problems.length;
  await page.goto(APP + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const body = await text();
  check(!page.url().includes('/sign-in') && body.length > 30 && problems.length === before,
    `worker opens ${name}`,
    `${body.length} chars${problems.length > before ? '  ERRORS: ' + problems.slice(before).join(' | ') : ''}`);
}

// The money surface must not offer a withdrawal that the backend now refuses.
await page.goto(`${APP}/worker/earnings`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const earnings = await text();
const withdrawControl = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('button, a'));
  const hit = nodes.find((n) => /withdraw|سحب|retrait/i.test(n.textContent || ''));
  return hit ? { text: hit.textContent.trim().slice(0, 40), disabled: hit.disabled === true } : null;
});
check(!withdrawControl || withdrawControl.disabled,
  'THE EARNINGS PAGE OFFERS NO ENABLED WITHDRAWAL WHILE PAYOUTS ARE OFF',
  withdrawControl ? JSON.stringify(withdrawControl) : 'no withdrawal control rendered');
check(!/error|failed|something went wrong/i.test(earnings),
  'and the earnings page is not an error state', earnings.slice(0, 60));

// A worker must not reach the staff console.
await page.goto(`${BASE.replace('//', '//admin.')}/admin/users`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2600);
const adminText = await text();
check(/not available to you|no active staff role|sign in/i.test(adminText),
  'A WORKER IS REFUSED AT THE STAFF CONSOLE', adminText.slice(0, 50));

await browser.close();

// The backend refuses the withdrawal even if the UI were bypassed entirely.
const session = await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})).json();
const direct = await fetch(`${API}/rest/v1/rpc/request_provider_withdrawal`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_amount_minor: 5000,
    p_payout_destination_id: '00000000-0000-4000-8000-000000000000',
    p_idempotency_key: `worker-journey-${Date.now()}`,
  }),
});
const directBody = await direct.text();
check(direct.status >= 400 && /not available/i.test(directBody),
  'AND THE BACKEND REFUSES A WITHDRAWAL POSTED DIRECTLY, UI OR NO UI',
  `HTTP ${direct.status} ${directBody.slice(0, 80)}`);

console.log(`\n${checks} worker journey checks, ${failures} failed`);
if (failures) process.exitCode = 1;
