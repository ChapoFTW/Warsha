/**
 * Accept every consent on a form, exactly once each, and prove each one took.
 *
 * Consents are ACCEPTED, never bypassed. A walk that skips a required consent
 * is not walking the product, and a harness that could skip one would be a
 * harness that proves nothing about the screen where it matters most.
 *
 * ## Why this reads the raw dump
 *
 * `uiautomator`'s `checked` attribute is the only reliable answer, and the
 * driver's tree does not carry it. Three earlier attempts tapped blind:
 *
 *   - tapping every "I agree" across several scroll passes toggled the same
 *     consent an even number of times, which looks exactly like never having
 *     tapped it — the submit button stayed disabled and nothing said why;
 *   - comparing screen text before and after a tap could not tell a checkbox
 *     changing state from the list scrolling by a pixel;
 *   - looking for a tick character in the label found nothing, because the tick
 *     is a drawable rather than text.
 *
 * Each failure produced the same symptom: a disabled submit button and a walk
 * that reported "could not reach" the next screen. So state is read, one
 * unchecked box is tapped, and the read is repeated — which also means the
 * function can say honestly when a box refused to change.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADB = process.env.WARSHA_ADB
  ?? (existsSync('D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe')
    ? 'D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe'
    : 'adb');

const adb = (args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Every checkbox on screen, with the state the platform reports for it. */
export function checkboxes() {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/warsha-consents.xml']);
  const local = join(tmpdir(), 'warsha-consents.xml');
  adb(['pull', '/sdcard/warsha-consents.xml', local]);
  const xml = readFileSync(local, 'utf8');

  return [...xml.matchAll(/<node[^>]*class="[^"]*CheckBox"[^>]*>/g)].map(([node]) => {
    const attr = (name) => (node.match(new RegExp(`${name}="([^"]*)"`)) ?? [, ''])[1];
    const bounds = attr('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return {
      label: attr('content-desc') || attr('text'),
      checked: attr('checked') === 'true',
      enabled: attr('enabled') === 'true',
      cx: bounds ? Math.round((+bounds[1] + +bounds[3]) / 2) : 0,
      cy: bounds ? Math.round((+bounds[2] + +bounds[4]) / 2) : 0,
    };
  });
}

/**
 * Tick every unchecked consent, scrolling to find any below the fold.
 *
 * @returns {Promise<{accepted: string[], refused: string[]}>}
 */
export async function acceptAllConsents({ passes = 8 } = {}) {
  const accepted = [];
  const refused = [];

  for (let pass = 0; pass < passes; pass += 1) {
    const pending = checkboxes().filter((box) => !box.checked && box.enabled && box.cy > 0);

    if (pending.length === 0) {
      // Nothing left here; look further down before concluding.
      adb(['shell', 'input', 'swipe', '540', '1700', '540', '1000', '300']);
      await sleep(1000);
      if (checkboxes().filter((box) => !box.checked && box.enabled && box.cy > 0).length === 0) break;
      continue;
    }

    const box = pending[0];
    adb(['shell', 'input', 'tap', String(box.cx), String(box.cy)]);
    await sleep(1000);

    const after = checkboxes().find((entry) => entry.label === box.label);
    (after?.checked ? accepted : refused).push(box.label);
    // A box that refuses to change is a real finding, not something to retry
    // until it looks accepted.
    if (!after?.checked) break;
  }

  return { accepted, refused };
}

if (process.argv[1] && process.argv[1].endsWith('consents.mjs')) {
  const { accepted, refused } = await acceptAllConsents();
  for (const label of accepted) console.log(`  accepted  ${label.slice(0, 60)}`);
  for (const label of refused) console.log(`  REFUSED   ${label.slice(0, 60)}`);
  for (const box of checkboxes()) {
    console.log(`  state ${box.checked ? '[x]' : '[ ]'} ${box.label.slice(0, 56)}`);
  }
}
