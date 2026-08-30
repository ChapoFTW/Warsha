// WCAG 2.2 AA, measured in a real browser rather than asserted in prose.
//
// axe-core cannot find everything -- it does not judge whether a label makes
// sense, and it cannot operate the keyboard -- so this also walks the tab order
// and checks that focus stays visible and reaches the primary action.
//
// Usage: node scripts/web-accessibility-audit.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

// The pages a customer actually meets before signing in, in both directions,
// plus the two signed-out application entry points.
const TARGETS = [
  { url: `${BASE}/en`, name: 'home (en)' },
  { url: `${BASE}/ar`, name: 'home (ar/rtl)' },
  { url: `${BASE}/fr`, name: 'home (fr)' },
  { url: `${BASE}/en/services`, name: 'services (en)' },
  { url: `${BASE}/ar/services`, name: 'services (ar/rtl)' },
  { url: `${BASE}/en/categories`, name: 'categories (en)' },
  { url: `${BASE}/en/how-it-works`, name: 'how it works (en)' },
  { url: `${BASE}/en/legal`, name: 'legal index (en)' },
  { url: `${BASE}/en/legal/customer-terms`, name: 'legal document (en)' },
  { url: `${BASE}/ar/legal/customer-terms`, name: 'legal document (ar/rtl)' },
  { url: `${BASE}/en/help`, name: 'help (en)' },
  { url: `${BASE}/en/contact`, name: 'contact (en)' },
  { url: `${BASE}/en/trust-and-safety`, name: 'trust and safety (en)' },
  { url: `${BASE}/en/become-a-worker`, name: 'become a worker (en)' },
  { url: `${BASE}/en/sign-in`, name: 'public sign-in (en)' },
  { url: `${BASE}/en/create-account`, name: 'public create account (en)' },
  { url: `${BASE.replace('//', '//app.')}/sign-in`, name: 'app sign-in' },
  { url: `${BASE.replace('//', '//app.')}/create-account`, name: 'app create account' },
  { url: `${BASE.replace('//', '//app.')}/forgot-password`, name: 'app forgot password' },
  { url: `${BASE.replace('//', '//admin.')}/sign-in`, name: 'admin sign-in' },
];

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const report = [];
for (const target of TARGETS) {
  const page = await context.newPage();
  const entry = { ...target, violations: [], keyboard: {}, error: null };
  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1800);
    await page.addScriptTag({ content: axeSource });

    const axeResult = await page.evaluate(async () => {
      // WCAG 2.0/2.1/2.2 at A and AA, which is the standard Warsha is held to.
      const run = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      });
      return run.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => ({
          target: n.target.join(' '), summary: (n.failureSummary || '').slice(0, 180),
        })),
        count: v.nodes.length,
      }));
    });
    entry.violations = axeResult;

    // Keyboard: can a person reach anything, and can they see where they are?
    const keyboard = await page.evaluate(() => {
      const focusable = Array.from(document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.offsetParent !== null || el === document.activeElement);
      return { focusableCount: focusable.length };
    });
    // Next's development error overlay mounts a focusable <nextjs-portal> ahead
    // of the page's own content. It does not exist in a production build, so
    // treating it as the first tab stop reports a focus failure that no user
    // can ever meet.
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.tagName.toLowerCase() === 'nextjs-portal')) {
      await page.keyboard.press('Tab');
    }
    const first = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 50),
        outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth || '0') > 0,
        boxShadow: style.boxShadow !== 'none',
      };
    });
    entry.keyboard = {
      ...keyboard,
      firstStop: first,
      focusVisible: Boolean(first && (first.outline || first.boxShadow)),
    };
  } catch (e) {
    entry.error = String(e).split('\n')[0].slice(0, 160);
  }
  report.push(entry);
  await page.close();
}
await browser.close();

// --- report ---------------------------------------------------------------
const byRule = new Map();
let total = 0;
for (const entry of report) {
  for (const v of entry.violations) {
    total += v.count;
    if (!byRule.has(v.id)) byRule.set(v.id, { impact: v.impact, help: v.help, pages: [], nodes: 0 });
    const r = byRule.get(v.id);
    r.pages.push(entry.name);
    r.nodes += v.count;
  }
}

console.log(`\n=== WCAG 2.2 AA over ${report.length} pages ===\n`);
for (const entry of report) {
  const n = entry.violations.reduce((a, v) => a + v.count, 0);
  const kb = entry.keyboard.focusVisible === undefined ? '?'
    : entry.keyboard.focusVisible ? 'focus visible' : 'FOCUS NOT VISIBLE';
  console.log(`${n === 0 ? 'ok' : '!!'} ${String(n).padStart(3)} ${entry.name.padEnd(28)}`
    + ` [${entry.keyboard.focusableCount ?? '?'} focusable, ${kb}]`
    + (entry.error ? `  ERROR ${entry.error}` : ''));
}

console.log(`\n=== violations by rule (${total} nodes total) ===`);
for (const [id, r] of [...byRule].sort((a, b) => b[1].nodes - a[1].nodes)) {
  console.log(`\n  [${r.impact}] ${id} -- ${r.nodes} node(s) on ${r.pages.length} page(s)`);
  console.log(`    ${r.help}`);
  const sample = report.find((e) => e.violations.some((v) => v.id === id));
  const v = sample.violations.find((x) => x.id === id);
  for (const node of v.nodes.slice(0, 2)) {
    console.log(`    on ${sample.name}: ${node.target}`);
    if (node.summary) console.log(`      ${node.summary.replace(/\s+/g, ' ').slice(0, 150)}`);
  }
}
if (total === 0) console.log('  none');

writeFileSync(process.env.OUT ?? 'a11y-report.json', JSON.stringify(report, null, 1));
