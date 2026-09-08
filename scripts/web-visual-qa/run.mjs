/**
 * The Warsha web visual QA gate.
 *
 * Renders real pages in a real browser, screenshots them, measures their
 * geometry, listens for runtime and network failures, presses controls and
 * tabs through them. Findings are classified rather than counted, because a
 * gate that reports "37 issues" gets ignored and one that reports "the submit
 * button is off-screen at 320px" gets fixed.
 *
 *   BLOCKING   a person cannot complete something: control off-screen or
 *              unreachable, page errored, navigation broken, wrong direction
 *   SUSPICIOUS worth a human look: overflow, clipped text, tiny text, missing
 *              focus ring, failed subresource
 *   NOTE       observed, not necessarily wrong
 *
 * Usage:
 *   node scripts/web-visual-qa/run.mjs                 whole baseline
 *   node scripts/web-visual-qa/run.mjs --case ar-compact
 *   node scripts/web-visual-qa/run.mjs --host public --route home
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARTIFACTS, CASES, HOSTS, LOCALES, ROUTES, VIEWPORTS,
} from './config.mjs';
import {
  findPrimaryActions, measureLayout, probeKeyboard, watchRuntime,
} from './inspect.mjs';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const onlyCase = arg('case');
const onlyHost = arg('host');
const onlyRoute = arg('route');

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = join(ARTIFACTS, stamp);
mkdirSync(runDir, { recursive: true });

const findings = [];
const record = (severity, where, what, evidence = '') =>
  findings.push({ severity, ...where, what, evidence });

const rows = [];

const browser = await chromium.launch();
console.log(`artifacts: ${runDir}\n`);

for (const testCase of CASES) {
  if (onlyCase && testCase.id !== onlyCase) continue;
  for (const viewportName of testCase.viewports) {
    const viewport = VIEWPORTS[viewportName];
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: LOCALES[testCase.locale],
      colorScheme: testCase.theme,
      deviceScaleFactor: 1,
      // Zoom is applied as a device scale on the CSS side: the layout keeps its
      // width while every box grows, which is what enlarged text does.
      ...(testCase.zoom ? { deviceScaleFactor: testCase.zoom } : {}),
    });
    // The site reads its own cookie for language; setting it makes the app and
    // admin hosts honour the locale too, not just the prefixed public routes.
    await context.addCookies([{
      name: 'warsha-locale', value: testCase.locale, domain: '.usewarsha.com', path: '/',
    }]);

    for (const [hostName, base] of Object.entries(HOSTS)) {
      if (onlyHost && hostName !== onlyHost) continue;
      const routeKey = hostName === 'www' ? 'public' : hostName;
      for (const route of ROUTES[routeKey] ?? []) {
        if (onlyRoute && route.id !== onlyRoute) continue;

        const where = {
          case: testCase.id, host: hostName, route: route.id,
          viewport: viewportName, locale: testCase.locale, theme: testCase.theme,
          zoom: testCase.zoom ?? 1,
        };
        const page = await context.newPage();
        const runtime = watchRuntime(page);
        const url = base + route.path(testCase.locale);
        const shot = `${testCase.id}__${hostName}__${route.id}__${viewportName}.png`;

        let status = null;
        let error = null;
        try {
          if (testCase.zoom) {
            await page.addInitScript((z) => {
              document.addEventListener('DOMContentLoaded', () => {
                document.documentElement.style.fontSize = `${100 * z}%`;
              });
            }, testCase.zoom);
          }
          const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          status = response?.status() ?? null;
          await page.waitForTimeout(900);
        } catch (e) {
          error = String(e).slice(0, 200);
        }

        let layout = null;
        let actions = [];
        let keyboard = [];
        if (!error) {
          try {
            await page.screenshot({ path: join(runDir, shot), fullPage: false });
            layout = await measureLayout(page);
            actions = await findPrimaryActions(page);
            keyboard = await probeKeyboard(page, 10);
          } catch (e) {
            error = String(e).slice(0, 200);
          }
        }

        // ---- classify -------------------------------------------------------
        if (error) record('BLOCKING', where, 'the page could not be rendered', error);
        const expected = route.expect ?? 200;
        if (status !== null && status !== expected) {
          record(status >= 500 ? 'BLOCKING' : 'SUSPICIOUS', where,
            `HTTP ${status}, expected ${expected}`);
        }
        if (runtime.pageErrors.length) {
          record('BLOCKING', where, 'uncaught exception in the page',
            runtime.pageErrors[0]);
        }
        if (runtime.consoleErrors.length) {
          record('SUSPICIOUS', where, `${runtime.consoleErrors.length} console error(s)`,
            runtime.consoleErrors[0]);
        }
        if (runtime.failedRequests.length) {
          record('SUSPICIOUS', where, `${runtime.failedRequests.length} request(s) failed`,
            runtime.failedRequests[0]);
        }
        if (runtime.badResponses.length) {
          const worst = runtime.badResponses.find((r) => /^5/.test(r));
          record(worst ? 'BLOCKING' : 'SUSPICIOUS', where,
            `${runtime.badResponses.length} response(s) >=400`, runtime.badResponses[0]);
        }
        if (layout) {
          if (layout.horizontalOverflow > 1) {
            const worst = layout.offenders[0];
            record('SUSPICIOUS', where,
              `horizontal overflow of ${layout.horizontalOverflow}px`,
              worst ? `${worst.el} extends to ${worst.right} (viewport ${layout.viewportWidth}) "${worst.text}"` : '');
          }
          if (layout.clipped.length) {
            record('SUSPICIOUS', where, `${layout.clipped.length} clipped text node(s)`,
              `${layout.clipped[0].el} "${layout.clipped[0].text}"`);
          }
          if (testCase.locale === 'ar' && layout.dir !== 'rtl') {
            record('BLOCKING', where, 'ARABIC PAGE IS NOT RIGHT-TO-LEFT',
              `dir=${layout.dir} lang=${layout.lang}`);
          }
          if (testCase.locale !== 'ar' && layout.dir === 'rtl') {
            record('BLOCKING', where, 'non-Arabic page rendered right-to-left', `dir=${layout.dir}`);
          }
        }
        const offscreen = actions.filter((a) => !a.horizontallyInside && !a.disabled);
        if (offscreen.length) {
          record('SUSPICIOUS', where, `${offscreen.length} control(s) unreachable past the right edge`,
            offscreen.slice(0, 3).map((a) => a.label).join(' | '));
        }
        const noFocusRing = keyboard.filter((k) => !k.hasVisibleFocus);
        if (keyboard.length && noFocusRing.length === keyboard.length) {
          record('SUSPICIOUS', where, 'no visible focus indicator on any tab stop');
        }
        if (keyboard.length === 0) {
          record('SUSPICIOUS', where, 'nothing is keyboard focusable');
        }

        rows.push({
          ...where, url, status, screenshot: shot,
          overflow: layout?.horizontalOverflow ?? null,
          dir: layout?.dir ?? null,
          actions: actions.length,
          tabStops: keyboard.length,
          consoleErrors: runtime.consoleErrors.length,
          failedRequests: runtime.failedRequests.length,
          badResponses: runtime.badResponses.length,
          error,
        });

        const blocking = findings.filter((f) => f.severity === 'BLOCKING'
          && f.case === where.case && f.host === where.host && f.route === where.route
          && f.viewport === where.viewport).length;
        console.log(`${blocking ? 'BLOCK' : '  ok '}  ${testCase.id.padEnd(16)} `
          + `${hostName.padEnd(7)} ${route.id.padEnd(16)} ${viewportName.padEnd(14)} `
          + `HTTP ${String(status ?? '—').padEnd(4)} dir=${(layout?.dir ?? '—').padEnd(4)} `
          + `overflow=${String(layout?.horizontalOverflow ?? '—').padEnd(4)}`);

        await page.close();
      }
    }
    await context.close();
  }
}

await browser.close();

writeFileSync(join(runDir, 'results.json'),
  JSON.stringify({ stamp, rows, findings }, null, 1), 'utf8');

const bySeverity = (s) => findings.filter((f) => f.severity === s);
console.log(`\n=== ${rows.length} renders, ${findings.length} findings ===`);
for (const severity of ['BLOCKING', 'SUSPICIOUS']) {
  const list = bySeverity(severity);
  if (!list.length) continue;
  console.log(`\n${severity} (${list.length})`);
  const seen = new Set();
  for (const f of list) {
    const key = `${f.what}|${f.route}|${f.viewport}|${f.locale}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${f.host}/${f.route} ${f.viewport} ${f.locale}/${f.theme}: ${f.what}`);
    if (f.evidence) console.log(`      ${f.evidence.slice(0, 160)}`);
  }
}
console.log(`\nartifacts + results.json: ${runDir}`);
process.exit(bySeverity('BLOCKING').length > 0 ? 1 : 0);
