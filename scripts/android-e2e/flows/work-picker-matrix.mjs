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
  describeScreen, screenshot, scrollDown, setText, shell, sleep, tree,
} from '../driver.mjs';
import { assertBackendTarget } from '../backend-target.mjs';
import { installPhotoFixture } from '../photo-fixture.mjs';
import { acceptAllConsents } from '../consents.mjs';
import { apply, combinations, resetDevice, VIEWPORTS } from '../appearance-matrix.mjs';
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

const label = (node) => `${node.text} ${node.desc}`.trim();

/*
 * Apostrophes are not one character.
 *
 * The French agreement button is "J'accepte" with a straight apostrophe, and
 * this file looked for "J’accepte" with a typographic one. They read as the
 * same word and compare as different strings, so the walk reported that it
 * could not reach the work step from a screen where registration had just
 * succeeded — the same failure mode as the Arabic أوافق/موافق mismatch, one
 * character further in.
 *
 * Folded on both sides rather than fixed by listing both spellings, because the
 * next label with an apostrophe would need listing too.
 */
const fold = (value) => value.toLowerCase().replace(/[’'‘´`]/g, "'");

function target(names) {
  const nodes = tree();
  for (const needle of [names].flat()) {
    const hits = nodes.filter((node) => node.bounds
      && fold(label(node)).includes(fold(needle)));
    const found = hits.find((node) => node.clickable) ?? hits[0];
    if (found) return found;
  }
  return null;
}

/**
 * Look for a control, scrolling if it is not already on screen.
 *
 * At 320dp almost every form in this walk is taller than the screen, so "not
 * visible" and "not there" are different answers and only one of them is a
 * defect. The first version of the scroll lived inside `hop` alone, which fixed
 * the create-account button and left the picker-opening button failing the same
 * way one screen later -- the final reachability check and `tap` were still
 * asking `target` directly. Same question, so it should be the same code.
 */
async function findByScrolling(names, { attempts = 4 } = {}) {
  let node = target(names);
  for (let attempt = 0; !node && attempt < attempts; attempt += 1) {
    // The shared scroll, which reads the screen's real size. The literal
    // `360 1200 -> 360 600` here happened to be within a 720x1600 screen and so
    // worked, which is luck rather than correctness.
    await scrollDown();
    node = target(names);
  }
  return node;
}

async function tap(names, { optional = false, settle = 2400 } = {}) {
  const node = await findByScrolling(names);
  if (!node) {
    if (optional) return false;
    throw new Error(`no control matching ${JSON.stringify([names].flat())}`);
  }
  shell(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
  await sleep(settle);
  return true;
}

/**
 * Wait for the screen to STOP CHANGING, not for a fixed number of seconds.
 *
 * The first version waited for "not loading, and at least four labels", which a
 * half-drawn screen satisfies. It tapped into transitions and reported "could
 * not reach the work step" with no indication of which hop failed — a
 * diagnostic that costs more than it saves.
 */
async function settleScreen({ timeout = 45_000 } = {}) {
  const deadline = Date.now() + timeout;
  let previous = '';
  while (Date.now() < deadline) {
    const now = describeScreen(tree());
    if (now === previous && now.trim().length > 40
      && !/Loading Warsha|تحميل|Chargement/i.test(now)) return true;
    previous = now;
    await sleep(1500);
  }
  return false;
}

/** Controls named in every language this walks. */
const START = ['Get started', 'يلا نبدأ', 'Commencer', 'C’est parti'];
const ROLE = ['Professional. Offer', 'صنايعي. قدّم', 'Professionnel'];
const CREATE = ['Create account', 'إنشاء حساب', 'Créer un compte'];
/*
 * The Arabic button says موافق ("agreed"), not أوافق ("I agree"). The walk
 * looked for the second, missed it, and reported that it could not reach the
 * work step -- from a screen where registration had in fact just succeeded.
 * Taken from `workerAgreementAccept` in the onboarding copy rather than guessed.
 */
const ACCEPT = ['I accept', 'موافق', 'J’accepte', 'Je suis d’accord'];
const ADD_PHOTO = ['Add your photo', 'ضيف صورتك', 'Ajoutez votre photo'];
/*
 * Taken from `chooseGallery` in the worker copy. The Arabic was guessed as
 * "اختار من المعرض" and the product says "اختار من الصور" — close enough to
 * read past, different enough that the walk stopped dead on a screen it had
 * reached correctly.
 */
const GALLERY = ['Choose from gallery', 'اختار من الصور', 'Choisir dans la galerie'];
const USE_PHOTO = ['Use this photo', 'استخدم الصورة دي', 'Utiliser cette photo'];
const SAVE = ['Save and continue', 'احفظ وكمّل', 'Enregistrer et continuer'];
const OPEN_PICKER = ['Choose your work', 'Change your work', 'اختار شغلك', 'غيّر شغلك',
  'Choisir votre travail', 'Changer de travail'];

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
  const small = nodes.filter((node) => node.clickable && node.bounds
    && (node.bounds.right - node.bounds.left < 44 || node.bounds.bottom - node.bounds.top < 44))
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
  const language = combination.language.slice(0, 2);
  /*
   * A word from another language, a partial in the screen's own, and something
   * that matches nothing. The foreign word differs per screen so that no
   * configuration is quietly testing its own language twice.
   */
  const queries = language === 'ar'
    ? [['foreign', 'plumber'], ['partial', 'كهرب'], ['none', 'zzzzqq']]
    : language === 'fr'
      ? [['foreign', 'سباك'], ['partial', 'plomb'], ['none', 'zzzzqq']]
      : [['foreign', 'plombier'], ['partial', 'كهرب'], ['none', 'zzzzqq']];

  for (const [name, query] of queries) {
    const field = tree().find((node) => node.cls?.includes('EditText'));
    if (!field) {
      console.log('    no search field — search states not captured');
      return;
    }
    await setText({ cls: 'EditText', index: 0 }, query);
    await sleep(900);
    // Photographed with the keyboard up, because that is how a professional
    // sees the first results -- half the list covered while they are still
    // typing.
    await capture(`${combination.name}-search-${name}-typing`, combination);

    // Then again with it dismissed, because the question this feature has to
    // answer is what came BACK, and the keyboard hides most of the answer.
    shell('input keyevent 111');
    await sleep(1200);
    await capture(`${combination.name}-search-${name}`, combination);
  }

  // Cleared, so the list below is photographed as a list rather than a result.
  await setText({ cls: 'EditText', index: 0 }, '');
  await sleep(1200);
}

/**
 * Register once per configuration and stop on the work step.
 *
 * `pm clear` before each is what makes the configurations comparable: a device
 * carrying the previous run's account skips straight past the screens being
 * photographed.
 *
 * Every hop reports itself. A walk that fails silently in the middle produces
 * an empty folder and no idea why.
 */
async function reachPicker(combination) {
  shell('pm clear com.warsha.app');
  await sleep(3000);
  apply(combination);
  await sleep(1200);
  shell('am start -n com.warsha.app/.MainActivity');

  const trace = [];
  const hop = async (name, names, { optional = false } = {}) => {
    await settleScreen();
    /*
     * Scroll to find it before giving up.
     *
     * At 320dp the signup form is taller than the screen, and once the consent
     * checkboxes are ticked the create-account button sits below the fold. The
     * first version looked only at what was visible and reported
     * "create account: NOT FOUND" -- which reads as a missing control and is
     * actually a control three swipes down. Arabic failed this way while
     * English at 411dp passed, so it looked like a localization defect.
     */
    const node = await findByScrolling(names);
    if (!node) {
      /*
       * Optional hops are traced too.
       *
       * Arabic failed three times with no NOT FOUND line and no capture,
       * because everything that could report was mandatory and everything
       * that actually varies between configurations -- the photo step, the
       * processing consent, the save button -- was optional and silent. A walk
       * that only narrates the parts that cannot fail tells you nothing about
       * the parts that do.
       */
      trace.push(`${name}: not found${optional ? ' (optional)' : ''}`);
      if (!optional) {
        console.log(`    ${name}: NOT FOUND`);
        await capture(`${combination.name}-FAILED-${name.replace(/\s+/g, '-')}`, combination);
      }
      return false;
    }
    /*
     * A disabled control is not a control you can press.
     *
     * The walk tapped a greyed-out "إنشاء حساب" and counted it as progress,
     * because finding a node and being able to use it were the same question
     * here. It then walked three more optional hops looking for screens that
     * were never going to arrive, and reported "could not reach the work step"
     * — true, and four screens away from the reason.
     *
     * The button was disabled because a consent below the fold was still
     * unticked. Saying so is the difference between a diagnosis and a symptom.
     */
    if (node.enabled === false) {
      trace.push(`${name}: DISABLED`);
      console.log(`    ${name}: found but DISABLED — something upstream is incomplete`);
      await capture(`${combination.name}-FAILED-${name.replace(/\s+/g, '-')}-disabled`, combination);
      return false;
    }
    trace.push(name);
    shell(`input tap ${node.bounds.cx} ${node.bounds.cy}`);
    await sleep(2200);
    return true;
  };

  await hop('gateway', START, { optional: true });
  if (!await hop('role', ROLE)) return false;

  await settleScreen();
  const phone = `010123${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0')}`;
  await setText({ cls: 'EditText', index: 0 }, 'Warsha Design QA');
  await setText({ cls: 'EditText', index: 1 }, phone);
  await setText({ cls: 'EditText', index: 2 }, 'Warsha!QA9pass');
  shell('input keyevent 111');
  await sleep(1200);

  /*
   * Wait for the form to finish rendering before reading it.
   *
   * The legal card arrives after the fields do, and until it does the scroll
   * view genuinely ends at the note above it -- so the consent step read an
   * empty screen and concluded there was nothing to accept. `hop` never hit
   * this because it settles first; the consent step went straight in on a
   * 1.2-second sleep, which is the fixed-delay mistake this file already
   * records once.
   */
  await settleScreen();
  await capture(`${combination.name}-00-before-consents`, combination);
  const { refused } = await acceptAllConsents();
  if (refused.length) {
    console.log(`    a consent refused to change: ${refused[0]}`);
    return false;
  }

  if (!await hop('create account', CREATE)) return false;
  await sleep(10_000);

  await hop('processing consent', ['I agree to Warsha processing', 'أوافق على معالجة',
    'J’accepte que Warsha'], { optional: true });
  await hop('accept', ACCEPT, { optional: true });
  await sleep(4000);

  if (await hop('add photo', ADD_PHOTO, { optional: true })) {
    await hop('gallery', GALLERY);
    await sleep(5000);
    await hop('pick photo', ['Photo taken on', 'صورة', 'Photo']);
    await sleep(6000);
    await hop('use photo', USE_PHOTO, { optional: true });
    await sleep(12_000);
  }
  await hop('save', SAVE, { optional: true });
  await sleep(6000);
  await settleScreen();

  // Scrolled, for the same reason every other lookup here is: at 320dp this
  // button sits below the fold, and reporting "could not reach the work step"
  // for a control that is simply further down is the exact wrong answer.
  const opener = await findByScrolling(OPEN_PICKER);
  if (!opener) {
    console.log(`    walked: ${trace.join(' -> ')}`);
    await capture(`${combination.name}-FAILED-open-picker`, combination);
  }
  return Boolean(opener);
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

    if (!await reachPicker(combination)) {
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
    if (argv.includes('--search-states')) await captureSearchStates(combination);

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
    const row = tree().find((node) => node.clickable && node.bounds
      && workLabels.has((node.text ?? '').trim()));
    if (row) {
      shell(`input tap ${row.bounds.cx} ${row.bounds.cy}`);
      await sleep(1600);
      await capture(`${combination.name}-03-selected`, combination);

      // Proved, not assumed: the counter has to have moved, or the tap landed
      // on something that was not a row and the capture is not evidence.
      const counted = describeScreen(tree()).includes('1 / 10');
      console.log(`    selected "${(row.text ?? '').trim()}"`
        + `${counted ? '' : ' — BUT THE COUNTER DID NOT MOVE'}`);
    } else {
      console.log('    no work row found to select — the enabled button is not certified here');
    }
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
