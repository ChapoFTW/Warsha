// Responsive layout, theme, and the metadata a search engine reads.
//
// Three things a browser can answer that source cannot: does anything overflow
// its viewport at a real width, does the dark theme actually repaint, and does
// each public page carry the title, description, canonical and locale
// alternates it needs.
//
// Usage: node scripts/web-presentation-audit.mjs
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const WIDTHS = [
  { name: 'narrow mobile', width: 320, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1512, height: 950 },
  { name: 'wide', width: 1920, height: 1080 },
];

const PAGES = [
  '/en', '/ar', '/fr', '/en/services', '/ar/services', '/en/categories',
  '/en/how-it-works', '/en/legal', '/en/legal/customer-terms', '/en/help',
  '/en/contact', '/en/trust-and-safety', '/en/become-a-worker',
  '/en/sign-in', '/en/create-account',
];

const { chromium } = await import('playwright');
const browser = await chromium.launch();

// --- 1. horizontal overflow at every width --------------------------------
console.log('=== responsive: does anything overflow the viewport? ===\n');
const overflow = [];
for (const size of WIDTHS) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await context.newPage();
  const offenders = [];
  for (const path of PAGES) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    const result = await page.evaluate((vw) => {
      const doc = document.documentElement;
      const scrolls = doc.scrollWidth > vw + 1;
      if (!scrolls) return null;
      const wide = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > vw + 1 || r.right > vw + 1) {
          wide.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`
            + ` (right=${Math.round(r.right)})`);
        }
        if (wide.length >= 3) break;
      }
      return { scrollWidth: doc.scrollWidth, wide };
    }, size.width);
    if (result) offenders.push({ path, ...result });
  }
  const flag = offenders.length ? '!!' : 'ok';
  console.log(`${flag} ${size.name.padEnd(15)} ${size.width}px  ${offenders.length} page(s) overflow`);
  for (const o of offenders.slice(0, 4)) {
    console.log(`      ${o.path} scrollWidth=${o.scrollWidth} :: ${o.wide.join(', ')}`);
  }
  overflow.push({ size: size.name, offenders });
  await context.close();
}

// --- 2. theme ---------------------------------------------------------------
console.log('\n=== theme: light, dark and system actually differ ===\n');
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const seen = [];
  for (const path of ['/en', '/en/services', '/en/legal']) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    seen.push(await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { bg: s.backgroundColor, fg: s.color };
    }));
  }
  console.log(`  prefers-color-scheme: ${scheme.padEnd(6)} body bg=${seen[0].bg} fg=${seen[0].fg}`);
  await context.close();
}

// --- 3. SEO / metadata ------------------------------------------------------
console.log('\n=== metadata on public pages ===\n');
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const meta = [];
for (const path of PAGES) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  meta.push({
    path,
    ...(await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content ?? '',
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
      robots: document.querySelector('meta[name="robots"]')?.content ?? '',
      ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? '',
      alternates: Array.from(document.querySelectorAll('link[rel="alternate"]'))
        .map((l) => l.getAttribute('hreflang')).filter(Boolean),
      h1: document.querySelectorAll('h1').length,
      lang: document.documentElement.lang,
    }))),
  });
}
for (const m of meta) {
  const issues = [];
  if (!m.title) issues.push('no title');
  if (!m.description) issues.push('NO DESCRIPTION');
  if (!m.canonical) issues.push('no canonical');
  if (m.h1 !== 1) issues.push(`${m.h1} h1`);
  if (!m.lang) issues.push('no lang');
  if (!m.ogTitle) issues.push('no og:title');
  if (!m.alternates.length) issues.push('no hreflang alternates');
  console.log(`${issues.length ? '!!' : 'ok'} ${m.path.padEnd(26)} lang=${(m.lang || '-').padEnd(3)}`
    + ` h1=${m.h1} alt=${m.alternates.length}${issues.length ? '  ' + issues.join(', ') : ''}`);
}

// Private surfaces must not invite indexing.
console.log('\n=== indexing boundary ===\n');
for (const [name, url] of [
  ['app sign-in', `${BASE.replace('//', '//app.')}/sign-in`],
  ['admin sign-in', `${BASE.replace('//', '//admin.')}/sign-in`],
]) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const robots = await page.evaluate(() =>
    document.querySelector('meta[name="robots"]')?.content ?? '');
  const noindex = /noindex/i.test(robots);
  console.log(`${noindex ? 'ok' : '!!'} ${name.padEnd(16)} robots="${robots || '(none)'}"`);
}

for (const file of ['/robots.txt', '/sitemap.xml']) {
  const res = await page.goto(BASE + file, { waitUntil: 'domcontentloaded' });
  // `document.body` is null for an XML document: Chromium renders the sitemap
  // through its XML viewer rather than as HTML. Reading `.innerText` off it
  // threw, and the audit died on a sitemap that was being served perfectly.
  const body = await page.evaluate(() =>
    (document.body?.innerText ?? document.documentElement?.textContent ?? '').slice(0, 220));
  console.log(`${res && res.status() === 200 ? 'ok' : '!!'} ${file.padEnd(16)} ${res?.status()}`
    + `  ${body.replace(/\s+/g, ' ').slice(0, 120)}`);
}

await browser.close();
