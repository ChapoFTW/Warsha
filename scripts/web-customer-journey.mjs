// A customer signs in and uses the product, in a real browser.
//
// Everything else in this repository tests a layer: a policy, a function, a
// copy table. This drives the actual journey -- sign in, land, discover a
// professional, open the surfaces a customer reaches -- and reports what a
// person would see.
//
// LOCAL ONLY. It creates an account and signs in as it.
// Usage: node scripts/web-customer-journey.mjs
const APP = (process.env.BASE_URL ?? 'http://localhost:3000').replace('//', '//app.');
const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!API.startsWith('http://127.0.0.1')) throw new Error('local only');

const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SR_KEY;
if (!ANON || !SERVICE) throw new Error('ANON_KEY and SR_KEY are required');

const email = `journey-${Date.now()}@warsha.test`;
const password = 'Str0ng!Passw0rd123';

const created = await (await fetch(`${API}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email, password, email_confirm: true,
    user_metadata: { display_name: 'Journey Customer', preferred_language: 'en' },
  }),
})).json();
if (!created.id) throw new Error(`could not create account: ${JSON.stringify(created).slice(0, 200)}`);

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const noise = [/favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/,
  /ERR_ABORTED/, /preloaded using link preload/i];
const problems = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (noise.some((r) => r.test(m.text()))) return;
  problems.push(`console: ${m.text().slice(0, 160)}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));

const steps = [];
const step = async (name, fn) => {
  const before = problems.length;
  let outcome = 'ok';
  let detail = '';
  try {
    detail = (await fn()) ?? '';
  } catch (e) {
    outcome = 'FAIL';
    detail = String(e).split('\n')[0].slice(0, 170);
  }
  const newProblems = problems.slice(before);
  steps.push({ name, outcome, detail, problems: newProblems });
  console.log(`${outcome === 'ok' ? 'ok  ' : '!!  '}${name.padEnd(46)} ${detail}`);
  for (const p of newProblems) console.log(`      ${p}`);
};

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const settle = (ms = 2200) => page.waitForTimeout(ms);

// --- the journey ----------------------------------------------------------
await step('sign-in page loads', async () => {
  await page.goto(`${APP}/sign-in`, { waitUntil: 'domcontentloaded' });
  await settle();
  const inputs = await page.locator('input').count();
  if (inputs < 2) throw new Error(`expected email and password inputs, found ${inputs}`);
  return `${inputs} inputs`;
});

await step('rejects a wrong password with a message', async () => {
  await page.fill('input[type="text"]', email);
  await page.fill('input[type="password"]', 'definitely-not-the-password');
  await page.click('button[type="submit"]');
  await settle(2600);
  const body = await text();
  if (page.url().includes('/sign-in') === false) throw new Error('a wrong password signed the user in');
  return `stayed on sign-in, said: "${body.slice(0, 70)}"`;
});

await step('signs in with the right password', async () => {
  await page.fill('input[type="text"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/sign-in'), { timeout: 20000 });
  await settle();
  return `landed on ${new URL(page.url()).pathname}`;
});

await step('session survives a full page reload', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle();
  if (page.url().includes('/sign-in')) throw new Error('reload lost the session');
  return `still on ${new URL(page.url()).pathname}`;
});

for (const [name, path] of [
  ['discover', '/discover'], ['requests', '/requests'], ['new request', '/requests/new'],
  ['jobs', '/jobs'], ['notifications', '/notifications'], ['addresses', '/addresses'],
  ['account', '/account'], ['help', '/help'], ['support', '/support'],
]) {
  await step(`opens ${name}`, async () => {
    await page.goto(APP + path, { waitUntil: 'domcontentloaded' });
    await settle();
    if (page.url().includes('/sign-in')) throw new Error('bounced to sign-in while signed in');
    const body = await text();
    if (body.length < 20) throw new Error(`rendered ${body.length} characters`);
    return `${body.length} chars`;
  });
}

await step('discovery shows the seeded professionals', async () => {
  await page.goto(`${APP}/discover`, { waitUntil: 'domcontentloaded' });
  await settle(3200);
  const body = await text();
  const found = ['Nour El-Sayed', 'Dalia Aziz'].filter((n) => body.includes(n));
  const excluded = ['Hala Mansour', 'Rami Fouad'].filter((n) => body.includes(n));
  if (excluded.length) throw new Error(`showed a provider that must be excluded: ${excluded.join(', ')}`);
  if (!found.length) throw new Error(`no seeded professional rendered; page says "${body.slice(0, 110)}"`);
  return `showed ${found.join(', ')}; excluded the ineligible two`;
});

await step('signs out and the session is gone', async () => {
  await page.goto(`${APP}/sign-out`, { waitUntil: 'domcontentloaded' });
  await settle(2600);
  await page.goto(`${APP}/jobs`, { waitUntil: 'domcontentloaded' });
  await settle(2600);
  if (!page.url().includes('/sign-in')) throw new Error('a protected route opened after sign-out');
  return 'protected route redirects to sign-in again';
});

await browser.close();

const failed = steps.filter((s) => s.outcome !== 'ok');
const withProblems = steps.filter((s) => s.problems.length);
console.log(`\n${steps.length} steps, ${failed.length} failed, `
  + `${withProblems.length} with console errors`);
if (failed.length) process.exitCode = 1;
