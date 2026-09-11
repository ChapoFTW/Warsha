/**
 * Photograph the professional's application, step by step.
 *
 * The work picker is certified. Everything after it — the jobs you can take,
 * where you can work, identity, the criminal record, and the state you wait in
 * — has never been rendered this programme, and each is reachable only by
 * walking a real registration.
 *
 * ## What this deliberately does NOT do
 *
 * It fills in what is safe to fill in and stops at the documents. Identity and
 * the criminal record are captured as SCREENS, not submitted: the standing rule
 * is that no real person's ID or criminal record is ever uploaded, and a
 * synthetic photograph pushed through a verification queue would put a fake
 * document in front of whoever reviews that queue next. Rendering is the goal;
 * the review queue is not a place to leave litter.
 *
 * A development build, and asserted as one.
 *
 * Usage:
 *   node scripts/android-e2e/flows/professional-journey.mjs [--tag name] [--language ar-EG]
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describeScreen, screenshot, scrollDown, shell, sleep, tree } from '../driver.mjs';
import { assertBackendTarget } from '../backend-target.mjs';
import { installPhotoFixture } from '../photo-fixture.mjs';
import { apply, resetDevice, VIEWPORTS } from '../appearance-matrix.mjs';
import {
  findByScrolling, label, OPEN_PICKER, registerProfessional, settleScreen, tap, target,
} from '../professional-signup.mjs';
import { auditTargets } from '../touch-targets.mjs';
import { grantLocationPermission, PLACES, setDeviceLocation } from '../location.mjs';
import { professions } from '../../../src/providers/profession-taxonomy.ts';
import { specificServicesFor } from '../../../src/services/specific-services.ts';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};

const tag = arg('--tag', 'journey');
const language = arg('--language', 'en-US');
const started = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const ROOT = process.env.WARSHA_TEMP ?? 'D:/Warsha-Temp/design-sweep';
const OUT = join(ROOT, `${tag}-${started}`);
mkdirSync(OUT, { recursive: true });
console.log(`artifacts: ${OUT}`);

assertBackendTarget({ expect: 'development', purpose: 'the professional journey' });

const combination = {
  viewport: VIEWPORTS[argv.includes('--320dp') ? 1 : 0],
  appearance: argv.includes('--dark') ? 'dark' : 'light',
  scale: argv.includes('--large') ? 1.3 : 1.0,
  language,
  name: `${argv.includes('--320dp') ? '320dp' : '411dp'}-`
    + `${argv.includes('--dark') ? 'dark' : 'light'}-`
    + `${argv.includes('--large') ? '1.3x' : '1x'}-${language}`,
};

const findings = [];

async function capture(name, note = combination) {
  await sleep(900);
  const nodes = tree();
  copyFileSync(screenshot(`${tag}-${name}`), join(OUT, `${name}.png`));
  writeFileSync(join(OUT, `${name}.txt`), describeScreen(nodes));

  /*
   * No small-target check here any more.
   *
   * It measured rendered bounds, which uiautomator CLIPS to the containing
   * viewport — so a row scrolled half out of a list reports the height of the
   * part still showing, and a chip whose own style says `minHeight: 48` came
   * back as fourteen dp. Clipping and smallness are the same number, so the
   * check could not tell them apart, and every finding it produced all day was
   * clipping. One reached the certification record as a real defect on a
   * destructive control.
   *
   * A signal that has never once been right is worse than no signal, because it
   * gets believed. The question moved to `scripts/touch-target-contract.test.mts`,
   * where a style either declares a minimum or it does not — an answer that does
   * not depend on where the control happened to be when the screenshot was taken.
   */
  /*
   * An ellipsis is not always a truncation.
   *
   * "Locating…" and "Resolving address…" end in one on purpose, and this
   * flagged them as clipped text on a screen where nothing was clipped. A
   * truncation is the platform cutting a string it could not fit, which it
   * does at the end of a line filling its container — so a short label whose
   * ellipsis is the whole point is not one.
   */
  const widest = Math.max(...nodes.map((node) => (node.bounds?.right ?? 0) - (node.bounds?.left ?? 0)));
  const truncated = nodes.filter((node) => /…|\.\.\.$/.test(node.text ?? '')
    && node.bounds && (node.bounds.right - node.bounds.left) > widest * 0.6)
    .map((node) => node.text.slice(0, 34));
  // A composed accessibility name — one that starts with a comma — is the
  // defect the OptionRow rewrite removed. It must not come back on a new screen.
  const composed = nodes.filter((node) => /^\s*,/.test(node.desc ?? '')).length;

  findings.push({ name, note, truncated, composed });
  const flags = [
    truncated.length ? `TRUNCATED ${truncated.length}` : '',
    composed ? `COMPOSED ${composed}` : '',
  ].filter(Boolean).join('  ');
  console.log(`    ${name.padEnd(34)} ${flags || 'clean'}`);
}

/*
 * The step headings, in every language, copied from `worker-copy` rather than
 * written from memory.
 *
 * The French one here was first written as "Envoyez le casier judiciaire" and
 * the product says "Téléversez l’extrait de casier judiciaire". Three runs were
 * lost earlier today to exactly that: a label close enough to read past and
 * different enough to stop the walk on a screen it had reached correctly.
 */
const STEPS = {
  services: ['Services you offer', 'الخدمات اللي بتقدمها', 'Les services que vous proposez'],
  area: ['Where can you work?', 'بتشتغل فين؟', 'Où pouvez-vous travailler ?'],
  identity: ['Verify your identity', 'اتحقق من هويتك', 'Vérifiez votre identité'],
  certificate: ['Upload the criminal-record certificate', 'ارفع الفيش والتشبيه',
    'Téléversez l’extrait de casier judiciaire'],
};
const DONE = ['Done', 'تم', 'Terminé'];
/* `removeProfession`, from the copy. The chip's accessibility name is this
   word followed by the trade, which is what the runtime audit looks for. */
const REMOVE = { en: 'Remove', ar: 'احذف', fr: 'Retirer' };
const SAVE_CONTINUE = ['Save and continue', 'احفظ وكمّل', 'Enregistrer et continuer'];
/* From `addAddress`; the French is “Ajouter l’adresse actuelle”, not the
   possessive form it would be easy to assume. */
const ADD_ADDRESS = ['Add current address', 'ضيف عنوانك الحالي', 'Ajouter l’adresse actuelle'];
const USE_LOCATION = ['Use my current location', 'استخدم موقعي الحالي', 'Utiliser ma position actuelle'];
const CONTINUE = ['Continue', 'كمّل', 'Continuer'];
/* From `addressChooseMap`: the Arabic is “اختار الموقع على الخريطة”. */
const CHOOSE_ON_MAP = ['Choose location on map', 'اختار الموقع على الخريطة', 'Choisir sur la carte'];
const CONFIRM_LOCATION = ['Confirm this location', 'أكّد المكان ده', 'Confirmer cette position'];

/**
 * Wait for a control to become usable, not merely present.
 *
 * A disabled button is on screen from the start, so "is it there" answers
 * nothing. This screen's Continue turns usable exactly when the address has
 * resolved, which makes it the product's own statement that the lookup
 * finished — better than any sleep this file could pick.
 */
async function waitForEnabled(names, { timeout = 20_000, each } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const node = target(names);
    if (node && node.enabled !== false) return true;
    if (each) await each();
    await sleep(1200);
  }
  return false;
}

/** Pick the first few work types, so the steps after this one have something to work with. */
async function chooseWork(count = 3) {
  if (!await tap(OPEN_PICKER, { settle: 2600 })) return 0;
  await settleScreen();

  const byLabel = new Map(professions.map((p) => [p.work[language.slice(0, 2)], p]));
  const chosenCategories = [];
  for (let attempt = 0; attempt < 12 && chosenCategories.length < count; attempt += 1) {
    const row = tree().find((node) => node.clickable && node.bounds
      && byLabel.has(label(node).trim()));
    if (!row) { await scrollDown(); continue; }
    const profession = byLabel.get(label(row).trim());
    shell(`input tap ${row.bounds.cx} ${row.bounds.cy}`);
    await sleep(1100);
    // Chosen rows leave the map, so the next pass finds a different one without
    // tracking which have been tapped.
    byLabel.delete(label(row).trim());
    chosenCategories.push(profession.categoryId);
  }
  const chosen = chosenCategories.length;

  await capture(`${combination.name}-picker-${chosen}-selected`);
  await tap(DONE, { settle: 2600, optional: true });
  await settleScreen();
  return chosenCategories;
}

/**
 * Open a trade's jobs and tick a few, so the step after this one can be reached.
 *
 * The services section lists the jobs belonging to each chosen trade behind a
 * disclosure. Until at least one is ticked, "Save and continue" is disabled --
 * correctly, since a professional who offers no jobs cannot be matched to work
 * -- and the walk would stop here reporting that the next step was not reached,
 * which would be true and useless.
 */
async function chooseServices(chosenCategories, count = 3) {
  await settleScreen();

  // The disclosure headings are the work labels themselves, which is how the
  // services belonging to a trade are found without knowing their names.
  const workLabels = new Set(professions.map((p) => p.work[language.slice(0, 2)]));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const group = tree().find((node) => node.clickable && node.bounds
      && [...workLabels].some((work) => label(node).trim().startsWith(work)));
    if (group) {
      shell(`input tap ${group.bounds.cx} ${group.bounds.cy}`);
      await sleep(1400);
      break;
    }
    await scrollDown();
  }

  await capture(`${combination.name}-services-open`);

  /*
   * Ticked by NAME, from the catalogue.
   *
   * The first version looked for a clickable node reporting `checked="false"`,
   * which is every node on the screen — uiautomator emits that attribute
   * whether or not a control is checkable, so the filter would have tapped a
   * heading or a link. That is the same trap the consent helper fell into, and
   * it is worth stating once: `checked` on its own says nothing.
   *
   * The job names are not a guess either. `specificServicesFor` is the
   * catalogue that populates this screen, so asking it what the chosen trades
   * offer is asking the same authority the UI asked.
   */
  const jobs = new Set(
    chosenCategories.flatMap((categoryId) =>
      specificServicesFor(categoryId).map((service) => service[language.slice(0, 2)])),
  );
  if (jobs.size === 0) {
    console.log('    the catalogue lists no jobs for the chosen trades — nothing to tick');
    return 0;
  }

  let chosen = 0;
  for (let attempt = 0; attempt < 16 && chosen < count; attempt += 1) {
    const row = tree().find((node) => node.clickable && node.bounds
      && node.bounds.bottom - node.bounds.top > 0 && jobs.has(label(node).trim()));
    if (!row) { await scrollDown(); continue; }
    shell(`input tap ${row.bounds.cx} ${row.bounds.cy}`);
    await sleep(900);
    jobs.delete(label(row).trim());
    chosen += 1;
  }
  console.log(`    ticked ${chosen} jobs`);
  return chosen;
}

/*
 * The service area, driven through the real product path.
 *
 * Governorate, area and coordinate all name the same place: Cairo, the Abdin
 * district, and Abdin Square. It is a public square in central Cairo — a place
 * rather than a person — so nothing here points at anyone's home, and the three
 * values agreeing means the reverse-geocode has something coherent to return
 * instead of a coordinate stranded in a governorate it does not belong to.
 *
 * Real selection, real validation. The dropdowns are the product's own, the
 * location comes from the emulator's location provider through the permission
 * the product asks for, and nothing here relaxes a rule to make a walk pass.
 */
const QA_PLACE = {
  governorate: { en: 'Cairo', ar: 'القاهرة', fr: 'Cairo' },
  area: { en: 'Abdin', ar: 'قسم عابدين', fr: 'Abdin' },
};
const SELECT_GOVERNORATE = ['Choose governorate', 'اختار المحافظة', 'Choisir le gouvernorat'];
const SELECT_AREA = ['Choose area', 'اختار المنطقة', 'Choisir la zone'];

/** Open one of the two dropdowns, search, and take the exact row. */
async function pickPlace(opener, wanted) {
  if (!await tap(opener, { settle: 1800, optional: true })) return false;
  await settleScreen();

  // Typed into the modal's own search so a long list does not need scrolling,
  // and matched on the exact label so a substring cannot take a neighbour.
  const field = tree().find((node) => node.cls?.includes('EditText') && node.bounds);
  if (field) {
    shell(`input tap ${field.bounds.cx} ${field.bounds.cy}`);
    await sleep(600);
    shell(`input text '${wanted.replace(/ /g, '%s')}'`);
    await sleep(1400);
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const row = tree().find((node) => node.clickable && node.bounds
      && label(node).trim() === wanted);
    if (row) {
      shell(`input tap ${row.bounds.cx} ${row.bounds.cy}`);
      await sleep(1800);
      return true;
    }
    await scrollDown();
  }
  console.log(`    no row exactly matching ${JSON.stringify(wanted)}`);
  return false;
}

async function completeServiceArea() {
  const code = language.slice(0, 2);
  await settleScreen();

  const gov = await pickPlace(SELECT_GOVERNORATE, QA_PLACE.governorate[code]);
  console.log(`    governorate ${gov ? 'chosen' : 'NOT chosen'}: ${QA_PLACE.governorate[code]}`);
  await capture(`${combination.name}-area-governorate`);

  const area = await pickPlace(SELECT_AREA, QA_PLACE.area[code]);
  console.log(`    area ${area ? 'chosen' : 'NOT chosen'}: ${QA_PLACE.area[code]}`);
  await capture(`${combination.name}-area-district`);

  /*
   * The address is a separate, real flow behind its own button. The device is
   * put at Abdin Square first so the product's own "use my location" path has
   * something to resolve — the permission is granted the way the product asks
   * for it, not bypassed.
   */
  grantLocationPermission();
  const placed = await setDeviceLocation(PLACES.abdinSquare, { verify: true });
  console.log(`    device placed at Abdin Square: ${placed ? 'yes' : 'NO'}`);

  if (await tap(ADD_ADDRESS, { optional: true, settle: 3000 })) {
    await settleScreen();
    await capture(`${combination.name}-address-open`);

    /*
     * Ask again, rather than re-sending a fix nobody is waiting for.
     *
     * The app requests a location ONCE per press. The first version of this set
     * the coordinate and then kept re-sending it while waiting — which changes
     * nothing, because the request had already returned and the screen was
     * already saying "Your device has no location fix yet". The fix was there;
     * nobody was asking for it any more.
     *
     * So the retry is on the PRESS. The coordinate is set and verified first,
     * then the product's own button is pressed, and only if that press comes
     * back empty is the whole thing tried again. The product still asks for the
     * permission, still requests the fix, and still refuses to continue without
     * one — the emulator is simply being driven properly.
     */
    let resolved = false;
    for (let attempt = 0; attempt < 3 && !resolved; attempt += 1) {
      const placed = await setDeviceLocation(PLACES.abdinSquare, { verify: true });
      if (!placed) {
        console.log('    the emulator would not take the coordinate');
        break;
      }
      if (!await tap(USE_LOCATION, { optional: true, settle: 4000 })) {
        console.log('    "use my current location" not offered — capturing what is');
        break;
      }
      resolved = await waitForEnabled(CONTINUE, { timeout: 20_000 });
      console.log(`    attempt ${attempt + 1}: address ${resolved ? 'resolved' : 'not resolved'}`);
    }

    await capture(`${combination.name}-address-located`);

    /*
     * The map picker, when the emulator will not give a fix.
     *
     * expo-location cannot get one here even with a verified coordinate in the
     * fused provider — the screen's own copy anticipates it: "If you are using
     * an emulator, set a simulated location and try again." That is an
     * environment limit, not a product defect, and the product offers two other
     * real routes for exactly this reason.
     *
     * So the pin is placed through the real map picker, which is the path the
     * owner asked for: a deterministic coordinate on a public square, resolved
     * by the real reverse-geocode, validated by the real rules. Nothing is
     * relaxed — the screen still refuses to continue until it has a pin it
     * accepts.
     */
    if (!resolved && await tap(CHOOSE_ON_MAP, { optional: true, settle: 4000 })) {
      /*
       * The map's two waiting states, captured by the clock rather than by luck.
       *
       * `GoogleMapRenderer` shows "Loading the map." until `onMapReady`, and
       * after `MAP_READY_TIMEOUT_MS` (12s) without one it replaces the whole
       * frame with "The map is unavailable right now." Both are real states a
       * customer on a bad connection sees, and a single `settleScreen()` capture
       * lands on whichever happened to be showing.
       *
       * So: one capture straight away, and one past the timeout. On this
       * emulator the tiles never load — the Maps key is not signed for this
       * build — so the second is the unavailable state, which is exactly the
       * path that has never been photographed.
       */
      await sleep(1200);
      const early = describeScreen(tree());
      copyFileSync(screenshot(`${tag}-map-waiting`), join(OUT, `${combination.name}-map-waiting.png`));
      writeFileSync(join(OUT, `${combination.name}-map-waiting.txt`), early);
      console.log(`    map at 1.2s: ${/Loading the map|جاري تحميل|Chargement de la carte/.test(early) ? 'LOADING shown' : 'not the loading state'}`);

      await sleep(13_000);
      const late = describeScreen(tree());
      copyFileSync(screenshot(`${tag}-map-timeout`), join(OUT, `${combination.name}-map-timeout.png`));
      writeFileSync(join(OUT, `${combination.name}-map-timeout.txt`), late);
      console.log(`    map at 14s: ${/unavailable|غير متاحة|indisponible/.test(late) ? 'UNAVAILABLE shown' : 'map became ready or is still loading'}`);

      await settleScreen();
      await capture(`${combination.name}-address-map`);

      /*
       * Tap the MAP, not a fraction of the screen.
       *
       * "Choose location on map" reveals the map inline, below the three
       * buttons, rather than opening a picker of its own — so a tap at 42% of
       * the screen landed back on "Use my current location". The map exposes
       * itself as a node called "Google Map", carrying the hint "Tap the map or
       * move the pin to your work location", which is the thing to press.
       */
      const map = await findByScrolling(['Google Map']);
      if (!map) {
        console.log('    the map did not appear');
      } else {
        shell(`input tap ${map.bounds.cx} ${map.bounds.cy}`);
        await sleep(2500);
      }
      await settleScreen();
      await capture(`${combination.name}-address-map-pinned`);

      resolved = await waitForEnabled(CONFIRM_LOCATION, { timeout: 25_000 });
      console.log(`    map pin accepted: ${resolved ? 'yes' : 'no'}`);
      if (resolved) {
        await tap(CONFIRM_LOCATION, { optional: true, settle: 3500 });
        await settleScreen();
        await capture(`${combination.name}-address-map-confirmed`);
      }
    }

    if (resolved && await tap(CONTINUE, { optional: true, settle: 3500 })) {
      await settleScreen();
      await capture(`${combination.name}-address-confirmed`);
    }
  }
  return gov && area;
}

try {
  await installPhotoFixture();
  console.log(`\n--- ${combination.name} ---`);
  const actual = apply(combination);
  console.log(`    device: ${actual.size} @${actual.density} scale ${actual.scale} night ${actual.night}`);

  if (!await registerProfessional({ combination, apply, capture })) {
    console.log('    could not reach the work step');
  } else {
    await capture(`${combination.name}-step-work`);
    const chosenCategories = await chooseWork();
    console.log(`    chose ${chosenCategories.length} kinds of work`);
    await capture(`${combination.name}-step-work-chosen`);

    /*
     * The runtime half of the touch-target question, on the control that
     * produced the false finding.
     *
     * The chip's own style declares 48dp and the source contract proves that.
     * What the source cannot prove is that the rendered chip is reachable and
     * unobscured, so it is measured here — scrolled into the middle of the
     * screen first, away from the edges that made every previous measurement
     * meaningless.
     */
    if (chosenCategories.length) {
      const first = professions.find((p) => p.categoryId === chosenCategories[0]);
      if (first) {
        await auditTargets([
          `${REMOVE[language.slice(0, 2)]} ${first.work[language.slice(0, 2)]}`,
        ]);
      }
    }

    if (target(STEPS.services)) {
      await capture(`${combination.name}-step-services`);
      await chooseServices(chosenCategories);
      await capture(`${combination.name}-step-services-chosen`);
    }

    /*
     * Each step is looked for by its heading rather than assumed to follow the
     * last. The journey is seven steps and a professional can be sent back to
     * an earlier one, so "what is on screen" is the only honest question.
     */
    for (const [name, names] of Object.entries(STEPS)) {
      await settleScreen();
      if (!target(names)) {
        // Try to advance: several steps sit behind a save.
        await tap(SAVE_CONTINUE, { optional: true, settle: 3000 });
        await settleScreen();
      }
      if (!target(names)) {
        console.log(`    step "${name}" not reached — stopping here rather than guessing`);
        break;
      }
      await capture(`${combination.name}-step-${name}`);

      // The service area is the one step that needs filling in before the
      // journey can go any further.
      if (name === 'area') {
        await completeServiceArea();
        await capture(`${combination.name}-area-complete`);
      }
    }
  }
} finally {
  resetDevice();
}

console.log(`\n${findings.length} states captured into ${OUT}`);
const problems = findings.filter((entry) => entry.truncated.length || entry.composed);
if (problems.length) {
  console.log('\nstates needing a look:');
  for (const entry of problems) {
    console.log(`  ${entry.name}`);
    for (const item of entry.truncated) console.log(`    truncated: ${JSON.stringify(item)}`);
    if (entry.composed) console.log(`    composed accessibility names: ${entry.composed}`);
  }
}
