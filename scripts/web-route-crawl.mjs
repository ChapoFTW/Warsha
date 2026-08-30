// A real browser opens every web route Warsha ships, in every locale, and
// reports what the console says.
//
// Static analysis cannot see a hydration mismatch, a component that throws only
// on the client, a blank body, or a request that 404s after the page renders.
// This is the layer where a real user meets the product, and until now nothing
// in the repository looked at it.
//
// Usage: node scripts/web-route-crawl.mjs [--browser chromium|firefox|webkit]
//        BASE_URL defaults to http://localhost:3000
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const browserName = (() => {
  const i = process.argv.indexOf('--browser');
  return i > -1 ? process.argv[i + 1] : 'chromium';
})();

// --- the routes, read from the filesystem rather than a hand-kept list -----
const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry === 'page.tsx') out.push(p);
  }
  return out;
};

const SAMPLE = {
  '[locale]': null,               // expanded per locale below
  '[slug]': 'customer-terms',
  '[id]': '00000000-0000-4000-8000-000000000000',
  '[key]': 'customer-terms',
};

const routes = walk(join(process.cwd(), 'web', 'app'))
  .map((f) => f.split(/[\\/]/).join('/').replace(/.*\/web\/app/, '').replace(/\/page\.tsx$/, '') || '/')
  .filter((r) => !r.includes('('));

const expanded = [];
for (const route of routes) {
  if (route.includes('[locale]')) {
    for (const locale of ['en', 'ar', 'fr']) {
      let r = route.replace('[locale]', locale);
      for (const [token, value] of Object.entries(SAMPLE)) {
        if (value && r.includes(token)) r = r.replace(token, value);
      }
      if (!/\[/.test(r)) expanded.push({ path: r || '/', locale, group: 'public' });
    }
  } else {
    let r = route;
    for (const [token, value] of Object.entries(SAMPLE)) {
      if (value && r.includes(token)) r = r.replace(token, value);
    }
    if (!/\[/.test(r)) {
      expanded.push({ path: r, locale: 'en', group: r.startsWith('/admin') ? 'admin' : 'app' });
    }
  }
}

const { chromium, firefox, webkit } = await import('playwright');
const engines = { chromium, firefox, webkit };
const browser = await engines[browserName].launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

// Noise that is not a defect: the dev server's own websocket and favicon.
const IGNORE = [
  /favicon/i, /_next\/static\/development/, /webpack-hmr/, /Download the React DevTools/i,
  /\[Fast Refresh\]/, /react-devtools/i,
  // A client-side redirect cancels the prefetch that was already in flight for
  // the page being left. That is the redirect working, not a broken request.
  /ERR_ABORTED/, /NS_BINDING_ABORTED/, /Load request cancelled/i,
  // Next's dev server preloads a stylesheet it then uses a moment later.
  /was preloaded using link preload but not used/i,
];

// `app.` and `admin.` are separate origins by design -- the middleware refuses
// an application path on the public host, so crawling them there measures the
// redirect and nothing else.
const hostFor = (route) => {
  if (route.group === 'app') return BASE.replace('//', '//app.');
  if (route.group === 'admin') return BASE.replace('//', '//admin.');
  return BASE;
};

const results = [];
for (const route of expanded) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    if (IGNORE.some((r) => r.test(text))) return;
    consoleErrors.push(`${m.type()}: ${text.slice(0, 200)}`);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
  page.on('requestfailed', (r) => {
    const message = `${r.failure()?.errorText} ${r.url().slice(0, 120)}`;
    if (IGNORE.some((x) => x.test(message))) return;
    failedRequests.push(message);
  });

  let status = 0;
  let error = null;
  let bodyLength = 0;
  let title = '';
  let dir = '';
  let finalUrl = '';
  try {
    const response = await page.goto(hostFor(route) + route.path, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    status = response?.status() ?? 0;
    await page.waitForTimeout(2500);
    finalUrl = page.url().replace(hostFor(route), '');
    title = await page.title();
    dir = await page.evaluate(() => document.documentElement.getAttribute('dir') || '');
    bodyLength = await page.evaluate(() => document.body?.innerText?.trim().length ?? 0);
  } catch (e) {
    error = String(e).split('\n')[0].slice(0, 160);
  }

  results.push({
    ...route, status, finalUrl, title, dir, bodyLength, error,
    consoleErrors, pageErrors, failedRequests,
  });
  await page.close();
}

await browser.close();

// --- report ---------------------------------------------------------------
const bad = (r) => r.error || r.status >= 500 || r.status === 0
  || r.pageErrors.length || r.consoleErrors.length || r.failedRequests.length
  || (r.bodyLength < 30 && r.status === 200);

console.log(`\n=== ${browserName}: ${results.length} routes ===\n`);
for (const r of results) {
  const flag = bad(r) ? '!!' : 'ok';
  const redirect = r.finalUrl && r.finalUrl !== r.path ? ` -> ${r.finalUrl}` : '';
  console.log(`${flag} ${String(r.status).padEnd(3)} ${r.path.padEnd(34)}${redirect}`
    + ` [dir=${r.dir || '-'} chars=${r.bodyLength}]`);
  if (r.error) console.log(`      ERROR ${r.error}`);
  for (const e of r.pageErrors.slice(0, 3)) console.log(`      PAGEERROR ${e}`);
  for (const e of r.consoleErrors.slice(0, 3)) console.log(`      CONSOLE ${e}`);
  for (const e of r.failedRequests.slice(0, 3)) console.log(`      REQFAIL ${e}`);
}

const failing = results.filter(bad);
console.log(`\nroutes with findings: ${failing.length} / ${results.length}`);
writeFileSync(process.env.OUT ?? `crawl-${browserName}.json`, JSON.stringify(results, null, 1));
