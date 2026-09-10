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

import { scrollDown } from './driver.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADB = process.env.WARSHA_ADB
  ?? (existsSync('D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe')
    ? 'D:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe'
    : 'adb');

const adb = (args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });



/**
 * The current screen's hierarchy, or a loud failure.
 *
 * `uiautomator dump` writes to the device and the pull brings it back, and both
 * steps can fail while leaving the PREVIOUS dump sitting on disk. Read blindly,
 * that stale file describes a screen the device left minutes ago: no consent
 * checkboxes on it, and identical to the last read, which is indistinguishable
 * from "everything is ticked and the page will not scroll".
 *
 * It announces success on stdout, so that is checked rather than assumed.
 */
function dumpScreen() {
  const out = adb(['shell', 'uiautomator', 'dump', '/sdcard/warsha-consents.xml']);
  if (!/dumped to/i.test(out)) {
    throw new Error(`uiautomator dump did not report success: ${out.trim().slice(0, 160)}`);
  }
  const local = join(tmpdir(), 'warsha-consents.xml');
  adb(['pull', '/sdcard/warsha-consents.xml', local]);
  return readFileSync(local, 'utf8');
}

/** The last labelled thing on screen, which says where the scroll has got to. */
function lastVisible() {
  const labels = [...dumpScreen().matchAll(/(?:text|content-desc)="([^"]{4,})"/g)]
    .map(([, value]) => value);
  return JSON.stringify(labels[labels.length - 1] ?? '').slice(0, 60);
}

/** Any node carrying a `checked` attribute, whatever class it claims to be. */
function checkedNodes() {
  const local = join(tmpdir(), 'warsha-consents.xml');
  if (!existsSync(local)) return [];
  const xml = readFileSync(local, 'utf8');
  return [...xml.matchAll(/<node[^>]*checked="[^"]*"[^>]*>/g)]
    .map(([node]) => {
      const attr = (name) => (node.match(new RegExp(`${name}="([^"]*)"`)) ?? [, ''])[1];
      const label = attr('content-desc') || attr('text');
      if (!label) return null;
      return `${attr('class')} checked=${attr('checked')} bounds=${attr('bounds')} ${label.slice(0, 40)}`;
    })
    .filter(Boolean);
}


/** Every checkbox on screen, with the state the platform reports for it. */
export function checkboxes() {
  const xml = dumpScreen();

  const read = (node) => {
    const attr = (name) => (node.match(new RegExp(`${name}="([^"]*)"`)) ?? [, ''])[1];
    const bounds = attr('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return {
      label: attr('content-desc') || attr('text'),
      cls: attr('class'),
      checked: attr('checked') === 'true',
      enabled: attr('enabled') === 'true',
      clickable: attr('clickable') === 'true',
      cx: bounds ? Math.round((+bounds[1] + +bounds[3]) / 2) : 0,
      cy: bounds ? Math.round((+bounds[2] + +bounds[4]) / 2) : 0,
    };
  };

  const nodes = [...xml.matchAll(/<node[^>]*>/g)].map(([node]) => read(node));

  const declared = nodes.filter((node) => /CheckBox/.test(node.cls));
  if (declared.length) return declared;

  /*
   * Nothing calls itself a CheckBox, so find them by what they say.
   *
   * `SignupLegalAcceptance` sets `accessibilityRole="checkbox"`, which a screen
   * reader honours and which uiautomator, on this build, reports as a plain
   * `android.view.View` carrying a `checked` attribute. Matching on the class
   * therefore found nothing at all — and because "no pending consents" and "all
   * consents accepted" looked identical from here, the walk went on to press a
   * Create account button that was disabled for want of the two boxes nobody
   * had ticked. Three fixes were aimed at the scrolling before the class was
   * ever in question.
   *
   * The fallback is deliberately narrow: a clickable node whose label opens
   * with the consent phrase Warsha actually uses, in one of its three
   * languages. Matching every clickable node with a `checked` attribute would
   * be simpler and would let this tap a link. Whatever it taps, the state is
   * read back afterwards, so a wrong guess reports a refusal rather than
   * pretending to have accepted something.
   */
  const CONSENT_PHRASES = ['أوافق', 'اوافق', 'I agree', 'J’accepte', "J'accepte"];
  return nodes.filter((node) => node.clickable && node.label
    && CONSENT_PHRASES.some((phrase) => node.label.includes(phrase)));
}

/**
 * Tick every unchecked consent, scrolling to find any below the fold.
 *
 * @returns {Promise<{accepted: string[], refused: string[]}>}
 */
export async function acceptAllConsents({ passes = 8, appearWithin = 25_000 } = {}) {
  const accepted = [];
  const refused = [];

  /*
   * Wait for the consents to exist before deciding there are none.
   *
   * The legal card is populated from a documents fetch, so for the first second
   * or two after the form is filled it is simply not in the tree. Reading the
   * screen at that moment gives an empty list, which is indistinguishable from
   * "all accepted" — and that is what sent the walk on to press a disabled
   * Create account button. Every earlier fix aimed at the scrolling, because
   * "nothing on screen" looks exactly like "nothing below the fold".
   */
  const appearedBy = Date.now() + appearWithin;
  while (checkboxes().length === 0 && Date.now() < appearedBy) {
    await sleep(1000);
  }

  for (let pass = 0; pass < passes; pass += 1) {
    const all = checkboxes();
    const pending = all.filter((box) => !box.checked && box.enabled && box.cy > 0);
    /*
     * Says what it sees, every pass.
     *
     * Three separate fixes were aimed at this function from screenshots of its
     * aftermath rather than from its own account of the screen, and two of them
     * were aimed at the wrong thing. A checkbox that is present but reports
     * enabled=false, or one whose class is not CheckBox at all, is invisible to
     * every one of those guesses and obvious in one line of this.
     */
    console.log(`  consents pass ${pass}: ${all.length} boxes, ${pending.length} pending`
      + all.map((box) => `
    ${box.checked ? '[x]' : '[ ]'}`
        + `${box.enabled ? '' : ' DISABLED'} @${box.cy} ${box.label.slice(0, 44)}`).join(''));
    if (all.length === 0) {
      // Nothing matched the CheckBox class. Report what carries a `checked`
      // attribute instead, so a control that is a checkbox to a screen reader
      // but a plain View to uiautomator is visible rather than guessed at.
      for (const node of checkedNodes()) console.log(`    (checked-capable) ${node}`);
    }

    if (pending.length === 0) {
      /*
       * Nothing pending HERE is not nothing pending.
       *
       * This used to scroll once and give up. At 320dp the signup form is tall
       * enough that after the password field is filled the consent card is more
       * than one screenful down, so a single swipe landed short, found no
       * checkboxes, and reported success having ticked nothing at all. The
       * walk then pressed a Create account button that was disabled for exactly
       * that reason.
       *
       * So it scrolls until something appears or the screen stops moving, which
       * is the only honest way to say "there is nothing further down".
       */
      /*
       * Scroll a fixed number of times, and stop early only on success.
       *
       * There was a "have we reached the bottom" heuristic here, and it was
       * wrong twice: first because it compared the checkbox list, which is
       * empty on a screen scrolled above the consent card, and then because two
       * dumps taken either side of one swipe can match while the view still has
       * further to go. Both times it reported the bottom of a page that had a
       * consent card below the fold, and both times the walk went on to press a
       * disabled button.
       *
       * `findByScrolling` in the flow has always just tried four swipes and
       * looked after each. That is less clever and it works, and "I scrolled
       * six times and found nothing" is an honest thing to report; "this is the
       * bottom" was not.
       */
      let appeared = false;
      for (let look = 0; look < 6 && !appeared; look += 1) {
        await scrollDown();
        const now = checkboxes().filter((box) => !box.checked && box.enabled && box.cy > 0);
        console.log(`    scroll ${look}: ${now.length} pending  last: ${lastVisible()}`);
        if (now.length) appeared = true;
      }
      if (!appeared) break;
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
