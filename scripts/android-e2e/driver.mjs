/**
 * A small, reusable Android UI driver for Warsha.
 *
 * Built on adb + UIAutomator rather than a heavier framework, because Warsha's
 * screens already carry good accessibility labels — every control on the
 * welcome screen exposes a `content-desc` like "Sign in" or "Create account".
 * Selecting by those labels is stable across screen sizes, densities, locales
 * and Android versions, which is exactly what the compatibility matrix needs.
 * Coordinates are used only to tap the centre of a node the tree already
 * located, never to guess where something might be.
 *
 * This exists to be reused: the compatibility gate drives the same journeys on
 * every device, and a flow written here runs unchanged on an API 24 emulator
 * and a Test Lab device.
 *
 * Selectors are objects, and every field is optional except one:
 *   { desc: 'Sign in' }            content-desc, exact
 *   { descContains: 'Language' }   content-desc, substring
 *   { text: 'Warsha' }             visible text, exact
 *   { textContains: 'Welcome' }    visible text, substring
 *   { id: 'com.warsha.app:id/x' }  resource id
 *   { cls: 'EditText' }            class name suffix
 *   { index: 1 }                   which match, when several
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Where adb is.
 *
 * This machine keeps the SDK outside PATH, so that path stays the first guess
 * and nothing about a local run changes. But the compatibility matrix runs this
 * same driver on a Linux CI runner, where the Windows path cannot exist and adb
 * is on PATH -- so an absent file falls back to the PATH name rather than
 * failing with an ENOENT that reads like a broken device.
 *
 * WARSHA_ADB overrides both, and is what a runner should set when it knows.
 */
const WINDOWS_ADB = 'D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe';
const ADB = process.env.WARSHA_ADB
  ?? (existsSync(WINDOWS_ADB) ? WINDOWS_ADB : 'adb');

/**
 * Where artifacts land. Same reasoning: keep the local scratch directory when
 * it is there, and fall back to the OS temp directory when it is not, so a
 * checkout on a runner does not have to invent a D: drive.
 */
const WINDOWS_TEMP = 'D:\\Warsha-Temp';
const TEMP = process.env.WARSHA_TEMP
  ?? (existsSync(WINDOWS_TEMP) ? WINDOWS_TEMP : join(tmpdir(), 'warsha-qa'));
const ARTIFACTS = join(TEMP, 'android-e2e');
mkdirSync(ARTIFACTS, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function adb(args, { quiet = true } = {}) {
  try {
    return execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] });
  } catch (error) {
    return String(error.stdout ?? '');
  }
}

export const shell = (command) => adb(['shell', command]);

/** The current screen as a list of nodes, each with its bounds and labels. */
export function tree() {
  // UIAutomator writes to the device; the pull brings it back. Both paths are
  // device-absolute, which Git Bash would mangle -- hence execFileSync, not a
  // shell string.
  shell('uiautomator dump /sdcard/warsha-ui.xml');
  adb(['pull', '/sdcard/warsha-ui.xml', join(TEMP, 'warsha-ui.xml')]);
  const xml = readFileSync(join(TEMP, 'warsha-ui.xml'), 'utf8');
  return [...xml.matchAll(/<node[^>]*>/g)].map(([node]) => {
    const attr = (name) => (node.match(new RegExp(`${name}="([^"]*)"`)) ?? [, ''])[1];
    const bounds = attr('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return {
      text: attr('text'),
      desc: attr('content-desc'),
      id: attr('resource-id'),
      cls: attr('class'),
      clickable: /clickable="true"/.test(node),
      masked: /password="true"/.test(node),
      enabled: /enabled="true"/.test(node),
      focused: /focused="true"/.test(node),
      bounds: bounds ? {
        left: +bounds[1], top: +bounds[2], right: +bounds[3], bottom: +bounds[4],
        cx: Math.round((+bounds[1] + +bounds[3]) / 2),
        cy: Math.round((+bounds[2] + +bounds[4]) / 2),
      } : null,
    };
  });
}

const matches = (node, s) =>
  (s.desc === undefined || node.desc === s.desc)
  && (s.descContains === undefined || node.desc.includes(s.descContains))
  && (s.text === undefined || node.text === s.text)
  && (s.textContains === undefined || node.text.includes(s.textContains))
  && (s.id === undefined || node.id === s.id)
  && (s.cls === undefined || node.cls.endsWith(s.cls))
  && (s.clickable === undefined || node.clickable === s.clickable);

export function findAll(selector, nodes = tree()) {
  return nodes.filter((n) => matches(n, selector));
}

export function find(selector, nodes = tree()) {
  const hits = findAll(selector, nodes);
  return hits[selector.index ?? 0] ?? null;
}

/** Wait for a node to appear. Returns it, or null when the timeout expires. */
export async function waitFor(selector, { timeout = 20000, interval = 1000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const node = find(selector);
    if (node) return node;
    await sleep(interval);
  }
  return null;
}

/**
 * Tap a node found by selector.
 *
 * React Native often puts the accessibility label on a wrapper and the text on
 * a child, so a selector may match a node that is not itself clickable. Tapping
 * the centre of the matched node still lands on the control, because the
 * wrapper contains it.
 */
export async function tap(selector, { timeout = 20000 } = {}) {
  const node = await waitFor(selector, { timeout });
  if (!node?.bounds) return false;
  shell(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
  await sleep(700);
  return true;
}

export const hideKeyboard = async () => {
  // ESC closes the IME without navigating back, so the screen underneath is
  // unchanged and its node bounds become trustworthy again.
  shell('input keyevent 111');
  await sleep(600);
};

/**
 * Put an exact value into an exact field, and prove it landed there.
 *
 * The naive version — tap, then `input text` — silently typed a password into
 * the phone field. On a 640px-tall screen the second input sits UNDER the soft
 * keyboard that the first one opened, so the tap hit the keyboard, focus never
 * moved, and the text appended to whatever was still focused. Nothing in the
 * result said so.
 *
 * So this dismisses the keyboard before locating anything (bounds are only
 * trustworthy once the IME is down), re-reads the tree, taps, and then ASSERTS
 * the intended node reports `focused=true` before typing a character. It
 * verifies afterwards too: the target holds the value and no sibling field
 * changed. A test that cannot tell "typed into the wrong box" from "typed" is
 * worse than no test.
 */
export async function setText(selector, value, { timeout = 20000, attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await hideKeyboard();
    const before = tree();
    const target = find(selector, before);
    if (!target?.bounds) { await sleep(800); continue; }

    const others = findAll({ cls: 'EditText' }, before)
      .filter((n) => n.bounds?.cy !== target.bounds.cy)
      .map((n) => n.text);

    shell(`input tap ${target.bounds.cx} ${target.bounds.cy}`);
    await sleep(900);

    const focused = find({ ...selector, }, tree());
    if (!focused?.focused) {
      // Focus did not move. Say so on the last attempt rather than typing into
      // whatever happens to hold it.
      if (attempt === attempts) {
        console.log(`  setText: focus never reached ${JSON.stringify(selector)}`);
        return false;
      }
      continue;
    }

    // Clear whatever is there: select-all then delete.
    shell('input keyevent 123');            // MOVE_END
    for (let i = 0; i < 80; i += 1) shell('input keyevent 67'); // DEL
    await sleep(400);

    // `input text` treats spaces as argument separators and reads the rest as a
    // device-shell word, so spaces become %s and the value is single-quoted.
    const encoded = String(value).replace(/ /g, '%s').replace(/'/g, `'\\''`);
    shell(`input text '${encoded}'`);
    await sleep(700);

    const after = tree();
    const written = find(selector, after);
    const siblings = findAll({ cls: 'EditText' }, after)
      .filter((n) => n.bounds?.cy !== target.bounds.cy)
      .map((n) => n.text);
    /*
     * A password field reports its MASK, not its contents. Comparing the mask
     * to the plaintext can never match, and the first version of this check
     * reported a correctly-typed password as a failure -- eighteen bullets for
     * an eighteen-character password. For a masked field the honest assertions
     * are that it is masked and that the length is right.
     */
    const landed = written?.masked
      ? written.text.length === String(value).length && /^[^\w\s]+$/.test(written.text)
      : written?.text === String(value);
    const untouched = JSON.stringify(siblings) === JSON.stringify(others);
    if (landed && untouched) return true;
    if (attempt === attempts) {
      console.log(written?.masked
        ? `  setText: masked field holds ${written.text.length} characters, wanted ${String(value).length}`
        : `  setText: wanted ${JSON.stringify(value)}, field holds ${JSON.stringify(written?.text)}`);
      console.log(`  setText: siblings ${untouched ? 'unchanged' : 'CHANGED — text went astray'}`);
      return false;
    }
  }
  return false;
}

/** Kept for callers that only need a keystroke appended. */
export async function type(selector, value, { timeout = 20000 } = {}) {
  return setText(selector, value, { timeout });
}

export const back = async () => { shell('input keyevent 4'); await sleep(700); };
export const scrollDown = async () => { shell('input swipe 540 1400 540 600 300'); await sleep(700); };

export function screenshot(name) {
  const remote = '/sdcard/warsha-shot.png';
  const local = join(ARTIFACTS, `${name}.png`);
  shell(`screencap -p ${remote}`);
  adb(['pull', remote, local]);
  return local;
}

/** Everything the app has written to logcat since the last clear. */
export const logcat = (filter = '') => {
  const out = adb(['logcat', '-d', '-t', '2000']);
  return filter ? out.split('\n').filter((l) => new RegExp(filter, 'i').test(l)).join('\n') : out;
};
export const clearLog = () => adb(['logcat', '-c']);

export function describeScreen(nodes = tree()) {
  return nodes
    .filter((n) => n.text || n.desc)
    .map((n) => `${n.clickable ? '[tap] ' : '      '}${n.desc || n.text}`)
    .join('\n');
}
