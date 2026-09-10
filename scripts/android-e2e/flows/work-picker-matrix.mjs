/**
 * Photograph the work picker on every axis it has to survive.
 *
 * The picker is where a professional says what they do, and it is the screen
 * the redesign was anchored on. It is also the one most exposed to the axes:
 * long Arabic and French work labels at 320dp, category headings that appear
 * only for multi-row groups, a selection state expressed in three channels at
 * once — each of which can be right in one configuration and wrong in another.
 *
 * A development build, and asserted as one. Reaching this screen means
 * registering a professional and uploading a photograph, which belongs in
 * development; what it proves is layout and text, which render identically
 * against any backend.
 *
 * Usage: node scripts/android-e2e/flows/work-picker-matrix.mjs [--tag name]
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  describeScreen, screenshot, screenSize, scrollDown, shell, sleep, tree,
} from '../driver.mjs';
import { assertBackendTarget } from '../backend-target.mjs';
import { installPhotoFixture } from '../photo-fixture.mjs';
import { apply, combinations, resetDevice, VIEWPORTS } from '../appearance-matrix.mjs';
/*
 * The registration walk lives next door, because the screens after the work
 * step need exactly the same one and a second copy would be a second place for
 * its six defects to come back.
 */
import {
  label, OPEN_PICKER, registerProfessional, tap,
} from '../professional-signup.mjs';
import { professions } from '../../../src/providers/profession-taxonomy.ts';

const argv = process.argv.slice(2);
const tagIndex = argv.indexOf('--tag');
const tag = tagIndex >= 0 ? argv[tagIndex + 1] : 'work';
/*
 * Every run gets its own folder, stamped with when it started.
 *
 * Runs used to share one directory under a reusable tag, which means a stopped
 * run's screenshots sit there wearing the same names the current run is about
 * to write. I read a previous run's leftovers as this run's output and
 * concluded a healthy sweep had hung -- then killed it five minutes into its
 * first registration. The artifacts were four hours old and looked current.
 *
 * A folder per run makes "what did THIS run produce" answerable by looking,
 * which is the only way the timestamps can ever be trusted.
 */
const started = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const ROOT = process.env.WARSHA_TEMP ?? 'D:/Warsha-Temp/design-sweep';
const OUT = join(ROOT, `${tag}-${started}`);
mkdirSync(OUT, { recursive: true });
console.log(`artifacts: ${OUT}`);

assertBackendTarget({ expect: 'development', purpose: 'the work-picker matrix' });









const findings = [];

async function capture(name, note) {
  await sleep(900);
  const nodes = tree();
  // The image lands in the driver's artifact directory; bring it alongside the
  // text dump so the run folder holds the whole run and nothing else.
  copyFileSync(screenshot(`${tag}-${name}`), join(OUT, `${name}.png`));
  writeFileSync(join(OUT, `${name}.txt`), describeScreen(nodes));

  const width = Math.max(...nodes.map((node) => node.bounds?.right ?? 0));
  const overflow = nodes.filter((node) => node.bounds && node.bounds.right > width + 1).length;
  /*
   * A row scrolled half out of view is not a small touch target.
   *
   * uiautomator clips bounds to the visible region, so a row leaving the top of
   * the list reports a NEGATIVE height — `648x-493` — and a naive "under 44dp"
   * test calls that an accessibility defect. Thirty-five of them came out of one
   * sweep, all of them rows that were simply scrolled past, and a real small
   * target would have been somewhere in the middle of that list.
   *
   * So a control has to actually be on screen before its size means anything.
   */
  const onScreen = (bounds) => bounds
    && bounds.right - bounds.left > 0 && bounds.bottom - bounds.top > 0;
  /*
   * Measured in dp, which is what the 44 refers to.
   *
   * Bounds come back in PIXELS. Comparing them to 44 directly passes almost
   * everything on a modern phone: at 2.625x a 44px control is 17dp, less than
   * half the minimum, and the check called it fine. Every "clean" verdict this
   * produced about touch targets was measuring the wrong unit — which is worse
   * than not checking, because it was being recorded as evidence.
   */
  const { density } = screenSize();
  const dp = (pixels) => Math.round(pixels / density);
  const small = nodes.filter((node) => node.clickable && onScreen(node.bounds)
    && (dp(node.bounds.right - node.bounds.left) < 44
      || dp(node.bounds.bottom - node.bounds.top) < 44))
    .map((node) => `${label(node).slice(0, 28)} ${node.bounds.right - node.bounds.left}x${node.bounds.bottom - node.bounds.top}`);
  const composed = nodes.filter((node) => /^\s*,/.test(node.desc ?? '')).length;
  // A row whose label is clipped is the failure long Arabic and French labels
  // actually produce, and it does not show up as overflow.
  const truncated = nodes.filter((node) => /…|\.\.\.$/.test(node.text ?? '')).map((n) => n.text.slice(0, 34));

  findings.push({ name, note, overflow, small, composed, truncated });
  const flags = [
    overflow ? `OVERFLOW ${overflow}` : '',
    small.length ? `SMALL ${small.length}` : '',
    composed ? `COMPOSED ${composed}` : '',
    truncated.length ? `TRUNCATED ${truncated.length}` : '',
  ].filter(Boolean).join('  ');
  console.log(`    ${name.padEnd(34)} ${flags || 'clean'}`);
}

/**
 * Photograph the ENTIRE list, not the first viewport.
 *
 * Thirty-six work labels do not fit on any of these screens, and the ones most
 * likely to be wrong are not at the top — the long French compounds, the
 * categories whose heading was dropped, the withdrawn rows. A sweep that
 * photographs the first screenful certifies about eight of them and calls the
 * list clean.
 *
 * So this scrolls to the bottom, photographs each viewport, and accumulates
 * every row label it saw. The accumulated set is then checked against the
 * taxonomy, which is what turns "the whole list was inspected" into something
 * the run either proves or fails to prove. A label the scroll never reached is
 * reported as UNSEEN rather than silently counting as inspected.
 */
async function captureWholeList(combination, language) {
  const expected = new Set(professions.map((profession) => profession.work[language]));
  const seen = new Set();
  const noteLabels = (nodes) => {
    for (const node of nodes) {
      const text = (node.text ?? '').trim();
      if (expected.has(text)) seen.add(text);
    }
  };

  /*
   * Scrolled with the shared `scrollDown`, which reads the screen's real size.
   *
   * The swipe here was `540 1500 -> 540 620`, written against a 1080x2400
   * device. On the 720x1600 compact device it is a short drag near the middle
   * of the screen, and Arabic at 320dp reported six of thirty-four labels seen
   * -- which the coverage line correctly called out as UNSEEN rather than
   * calling the list clean.
   *
   * Stopping early on "the screen stopped changing" is also gone. It ends the
   * sweep on one dropped frame, and the accounting below already knows when the
   * whole list has been seen, which is a better reason to stop.
   */
  for (let page = 0; page < 16; page += 1) {
    const nodes = tree();
    noteLabels(nodes);
    await capture(`${combination.name}-list-${String(page).padStart(2, '0')}`, combination);
    if (seen.size === expected.size) break;
    await scrollDown();
  }
  noteLabels(tree());

  const unseen = [...expected].filter((text) => !seen.has(text));
  console.log(`    list: ${seen.size}/${expected.size} work labels seen`
    + (unseen.length ? `  UNSEEN ${unseen.slice(0, 6).join(', ')}` : ''));
  findings.push({
    name: `${combination.name}-list-coverage`,
    note: combination,
    overflow: 0,
    small: [],
    composed: 0,
    truncated: [],
    unseen,
  });
  return unseen;
}

/**
 * The states the search box is actually seen in.
 *
 * Cross-language search is the whole point of the feature and the one state a
 * unit test cannot show: what a professional SEES when the word they typed is
 * not the language of the screen. The rule is that the query gets in through
 * any language and the result comes back in theirs, so an Arabic screen
 * answering "plumber" with "Plumbing" would be a defect the 2319 checks would
 * not catch — they assert the identity resolved, not what was drawn.
 */
async function captureSearchStates(combination) {
  /*
   * Typed WITHOUT `setText`, which is why this has its own helper.
   *
   * `setText` opens by calling `hideKeyboard()`, and hideKeyboard sends ESC.
   * ESC on an open modal dismisses the modal — so the first version of this
   * closed the picker, photographed the step behind it, and left the run
   * reporting "no work row found to select" on a screen where the list had
   * been open a second earlier. The capture was filed under `-search-foreign`
   * and showed a validation error.
   */
  const typeInSearch = async (query) => {
    const field = tree().find((node) => node.cls?.includes('EditText') && node.bounds);
    if (!field) return false;
    shell(`input tap ${field.bounds.cx} ${field.bounds.cy}`);
    await sleep(700);
    shell('input keyevent 123');                                  // MOVE_END
    for (let i = 0; i < 40; i += 1) shell('input keyevent 67');    // DEL
    if (query) {
      // Spaces separate arguments to `input text`, and an apostrophe would end
      // the shell quoting early. Same encoding the driver uses.
      const encoded = query.replace(/ /g, '%s').replace(/'/g, `'\\''`);
      shell(`input text '${encoded}'`);
    }
    await sleep(1300);
    return true;
  };

  /*
   * Latin queries only, and that is a limit of the DEVICE rather than a choice.
   * `adb input text` sends ASCII; there is no way to type سباك through it
   * without installing a helper IME onto the device under test, which would
   * change what is being certified.
   *
   * The case this leaves unrendered is the mirror one — Arabic typed into an
   * English or French screen — and it is covered by the taxonomy matrix, which
   * walks every one of the six terms per identity against every screen
   * language. What only a render can show is the case below: a word in one
   * language producing rows in another, which is exactly the Egyptian
   * professional with an English keyboard open.
   */
  const language = combination.language.slice(0, 2);
  const queries = language === 'en'
    ? [['foreign', 'plombier'], ['partial', 'plumb'], ['none', 'zzzzqq']]
    : [['foreign', 'plumber'], ['partial', 'electric'], ['none', 'zzzzqq']];

  for (const [name, query] of queries) {
    if (!await typeInSearch(query)) {
      console.log('    no search field — search states not captured');
      return;
    }
    // Photographed with the keyboard up, because that is how a professional
    // sees the first results: still typing, half the list covered.
    await capture(`${combination.name}-search-${name}`, combination);
  }

  // Cleared, so the list is a list again for whatever runs after this.
  await typeInSearch('');
}




await installPhotoFixture('com.warsha.app');

try {
  /*
   * `--only` runs a single configuration.
   *
   * Reaching this screen means a full registration, so twenty-four
   * configurations is a long walk to discover the first one could not get
   * there. One first, then the rest.
   */
  /*
   * `--key` runs the configurations most likely to break THIS screen, rather
   * than all twenty-four. Each one costs a full registration, so the full
   * matrix is an hour; these four are where a work picker actually fails —
   * long Arabic labels in the narrowest column, dark, enlarged text, and the
   * language with the longest words.
   */
  /*
   * `--key` is the certification set for this screen: 320dp in all three
   * languages, ~411dp in all three, light and dark, default and enlarged text.
   *
   * Not the full twenty-four. Each configuration costs a full registration, so
   * the whole matrix is well over an hour, and the axes that break a list of
   * work labels are language against width, plus the two theme and text-size
   * cases that change how a control reads rather than where it sits. Arabic
   * appears at every width and at enlarged text because it is a hard gate.
   */
  const plan = argv.includes('--key')
    ? [
      { viewport: VIEWPORTS[1], appearance: 'light', scale: 1.0, language: 'ar-EG', name: '320dp-light-1x-ar-EG' },
      { viewport: VIEWPORTS[1], appearance: 'light', scale: 1.0, language: 'en-US', name: '320dp-light-1x-en-US' },
      { viewport: VIEWPORTS[1], appearance: 'light', scale: 1.0, language: 'fr-FR', name: '320dp-light-1x-fr-FR' },
      { viewport: VIEWPORTS[0], appearance: 'dark', scale: 1.0, language: 'ar-EG', name: '411dp-dark-1x-ar-EG' },
      { viewport: VIEWPORTS[0], appearance: 'dark', scale: 1.0, language: 'en-US', name: '411dp-dark-1x-en-US' },
      { viewport: VIEWPORTS[0], appearance: 'light', scale: 1.0, language: 'fr-FR', name: '411dp-light-1x-fr-FR' },
      { viewport: VIEWPORTS[0], appearance: 'light', scale: 1.3, language: 'ar-EG', name: '411dp-light-1.3x-ar-EG' },
      { viewport: VIEWPORTS[0], appearance: 'light', scale: 1.3, language: 'en-US', name: '411dp-light-1.3x-en-US' },
    ]
    : [...combinations()];

  /*
   * `--config <substring>` re-runs one configuration. Each costs a full
   * registration, so re-running four to look at the one that failed wastes
   * twenty minutes and creates three accounts nobody needed.
   */
  const wanted = argv.indexOf('--config');
  const filtered = wanted >= 0
    ? plan.filter((entry) => entry.name.includes(argv[wanted + 1]))
    : plan;
  if (wanted >= 0 && filtered.length === 0) {
    throw new Error(`no configuration matching ${argv[wanted + 1]}: `
      + plan.map((entry) => entry.name).join(', '));
  }

  for (const combination of filtered) {
    console.log(`\n--- ${combination.name} ---`);
    const actual = apply(combination);
    console.log(`    device: ${actual.size} @${actual.density} scale ${actual.scale} night ${actual.night}`);

    if (!await registerProfessional({ combination, apply, capture })) {
      console.log('    could not reach the work step in this configuration');
      continue;
    }
    await capture(`${combination.name}-01-step`, combination);
    await tap(OPEN_PICKER, { settle: 2800 });
    await capture(`${combination.name}-02-picker`, combination);
    await captureWholeList(combination, combination.language.slice(0, 2));

    /*
     * One row selected, so the ENABLED button is photographed too.
     *
     * The disabled state was the finding here -- a filled slab at 0 of 10 --
     * and a sweep that only ever photographs 0 of 10 certifies the fix for it
     * while saying nothing about the state it turns back into. The selected row
     * comes along for free, which is the other half of what this control exists
     * to express.
     */
    /*
     * Tap a row by its LABEL, not by its position.
     *
     * This used to take the first clickable node below y=600, and on the Arabic
     * dark run that was the search field: the capture shows an open keyboard, a
     * focused text box and a counter still reading 0 / 10. A screenshot named
     * "selected" showing nothing selected is worse than no screenshot, because
     * it is filed as evidence.
     *
     * The taxonomy already knows what a work row says in this language, so ask
     * for one of those.
     */
    const workLabels = new Set(professions.map((profession) =>
      profession.work[combination.language.slice(0, 2)]));
    /*
     * Matched on the accessibility label, not on `text`.
     *
     * `OptionRow` carries its name in `accessibilityLabel`, which reaches
     * uiautomator as `content-desc` and leaves the row container's `text`
     * empty. Matching `text` therefore found nothing and reported the enabled
     * button as uncertified on a screen showing thirty-four matching rows.
     */
    const row = tree().find((node) => node.clickable && node.bounds
      && workLabels.has(label(node).trim()));
    if (row) {
      shell(`input tap ${row.bounds.cx} ${row.bounds.cy}`);
      await sleep(1600);
      await capture(`${combination.name}-03-selected`, combination);

      // Proved, not assumed: the counter has to have moved, or the tap landed
      // on something that was not a row and the capture is not evidence.
      const counted = describeScreen(tree()).includes('1 / 10');
      console.log(`    selected "${label(row).trim()}"`
        + `${counted ? '' : ' — BUT THE COUNTER DID NOT MOVE'}`);
    } else {
      console.log('    no work row found to select — the enabled button is not certified here');
    }

    /*
     * Search LAST, because typing leaves a keyboard over the list and a query
     * in the box. Running it before the selected-state capture meant that
     * capture was taken through a keyboard, on a filtered list, with the field
     * still focused.
     */
    if (argv.includes('--search-states')) await captureSearchStates(combination);
  }
} finally {
  resetDevice();
}

console.log(`\n${findings.length} states captured into ${OUT}`);
const problems = findings.filter((entry) => entry.overflow || entry.small.length
  || entry.composed || entry.truncated.length || entry.unseen?.length);
if (problems.length) {
  console.log('\nstates needing a look:');
  for (const entry of problems) {
    console.log(`  ${entry.name}`);
    for (const item of entry.small) console.log(`    small target: ${item}`);
    for (const item of entry.truncated) console.log(`    truncated: ${JSON.stringify(item)}`);
    // Reported, not thrown: a label the scroll missed may be the scroll's fault
    // rather than the screen's, and the screenshots are there to tell which.
    for (const item of entry.unseen ?? []) console.log(`    never scrolled into view: ${item}`);
  }
}
