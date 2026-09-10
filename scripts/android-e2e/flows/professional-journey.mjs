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
  label, OPEN_PICKER, registerProfessional, settleScreen, tap, target,
} from '../professional-signup.mjs';
import { professions } from '../../../src/providers/profession-taxonomy.ts';

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

  const onScreen = (bounds) => bounds
    && bounds.right - bounds.left > 0 && bounds.bottom - bounds.top > 0;
  const small = nodes.filter((node) => node.clickable && onScreen(node.bounds)
    && (node.bounds.right - node.bounds.left < 44 || node.bounds.bottom - node.bounds.top < 44))
    .map((node) => `${label(node).slice(0, 28)} `
      + `${node.bounds.right - node.bounds.left}x${node.bounds.bottom - node.bounds.top}`);
  const truncated = nodes.filter((node) => /…|\.\.\.$/.test(node.text ?? ''))
    .map((node) => node.text.slice(0, 34));
  // A composed accessibility name — one that starts with a comma — is the
  // defect the OptionRow rewrite removed. It must not come back on a new screen.
  const composed = nodes.filter((node) => /^\s*,/.test(node.desc ?? '')).length;

  findings.push({ name, note, small, truncated, composed });
  const flags = [
    small.length ? `SMALL ${small.length}` : '',
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
const SAVE_CONTINUE = ['Save and continue', 'احفظ وكمّل', 'Enregistrer et continuer'];

/** Pick the first few work types, so the steps after this one have something to work with. */
async function chooseWork(count = 3) {
  if (!await tap(OPEN_PICKER, { settle: 2600 })) return 0;
  await settleScreen();

  const workLabels = new Set(professions.map((p) => p.work[language.slice(0, 2)]));
  let chosen = 0;
  for (let attempt = 0; attempt < 12 && chosen < count; attempt += 1) {
    const row = tree().find((node) => node.clickable && node.bounds
      && workLabels.has(label(node).trim()));
    if (!row) { await scrollDown(); continue; }
    shell(`input tap ${row.bounds.cx} ${row.bounds.cy}`);
    await sleep(1100);
    // Chosen rows leave the unselected set, so the next pass finds a different
    // one without tracking which have been tapped.
    workLabels.delete(label(row).trim());
    chosen += 1;
  }

  await capture(`${combination.name}-picker-${chosen}-selected`);
  await tap(DONE, { settle: 2600, optional: true });
  await settleScreen();
  return chosen;
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
async function chooseServices(count = 3) {
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
   * Ticked by their checkbox state rather than by name, because the job names
   * are catalogue data and hardcoding any of them would be another guessed
   * label. A control that reports `checked` and is not yet checked is a job
   * waiting to be chosen.
   */
  let chosen = 0;
  for (let attempt = 0; attempt < 14 && chosen < count; attempt += 1) {
    const box = tree().find((node) => node.clickable && node.bounds
      && node.bounds.bottom - node.bounds.top > 0
      && !node.checked && label(node).trim().length > 2
      && !workLabels.has(label(node).trim()));
    if (!box) { await scrollDown(); continue; }
    shell(`input tap ${box.bounds.cx} ${box.bounds.cy}`);
    await sleep(900);
    chosen += 1;
  }
  console.log(`    ticked ${chosen} jobs`);
  return chosen;
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
    const chosen = await chooseWork();
    console.log(`    chose ${chosen} kinds of work`);
    await capture(`${combination.name}-step-work-chosen`);

    if (target(STEPS.services)) {
      await capture(`${combination.name}-step-services`);
      await chooseServices();
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
    }
  }
} finally {
  resetDevice();
}

console.log(`\n${findings.length} states captured into ${OUT}`);
const problems = findings.filter((entry) => entry.small.length
  || entry.truncated.length || entry.composed);
if (problems.length) {
  console.log('\nstates needing a look:');
  for (const entry of problems) {
    console.log(`  ${entry.name}`);
    for (const item of entry.small) console.log(`    small target: ${item}`);
    for (const item of entry.truncated) console.log(`    truncated: ${JSON.stringify(item)}`);
    if (entry.composed) console.log(`    composed accessibility names: ${entry.composed}`);
  }
}
