/**
 * Register a professional and arrive at the work step.
 *
 * Extracted because two flows need it: the work-picker matrix, and anything
 * that wants to look at the screens AFTER the work step — services, service
 * areas, the work location, identity, the criminal record, the pending state.
 * Every one of those is reachable only by walking a real registration, and a
 * second copy of this walk would be a second place for the six defects already
 * found in it to come back.
 *
 * What lives here is the walk and the labels it looks for. Where the artifacts
 * go, and what gets photographed, belongs to the caller — which is why
 * `capture` is passed in rather than imported.
 *
 * The labels are taken from the copy, never guessed. Three of the six defects
 * were a guessed string that read past inspection and stopped the walk dead on
 * a screen it had reached correctly: أوافق for موافق, اختار من المعرض for
 * اختار من الصور, and J’accepte for J'accepte.
 */
import { describeScreen, scrollDown, setText, shell, sleep, tree } from './driver.mjs';
import { acceptAllConsents } from './consents.mjs';

export const label = (node) => `${node.text} ${node.desc}`.trim();

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

export function target(names) {
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
export async function findByScrolling(names, { attempts = 4 } = {}) {
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

export async function tap(names, { optional = false, settle = 2400 } = {}) {
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
export async function settleScreen({ timeout = 45_000 } = {}) {
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
export const START = ['Get started', 'يلا نبدأ', 'Commencer', 'C’est parti'];
export const ROLE = ['Professional. Offer', 'صنايعي. قدّم', 'Professionnel'];
export const CREATE = ['Create account', 'إنشاء حساب', 'Créer un compte'];
/*
 * The Arabic button says موافق ("agreed"), not أوافق ("I agree"). The walk
 * looked for the second, missed it, and reported that it could not reach the
 * work step -- from a screen where registration had in fact just succeeded.
 * Taken from `workerAgreementAccept` in the onboarding copy rather than guessed.
 */
export const ACCEPT = ['I accept', 'موافق', 'J’accepte', 'Je suis d’accord'];
export const ADD_PHOTO = ['Add your photo', 'ضيف صورتك', 'Ajoutez votre photo'];
/*
 * Taken from `chooseGallery` in the worker copy. The Arabic was guessed as
 * "اختار من المعرض" and the product says "اختار من الصور" — close enough to
 * read past, different enough that the walk stopped dead on a screen it had
 * reached correctly.
 */
export const GALLERY = ['Choose from gallery', 'اختار من الصور', 'Choisir dans la galerie'];
export const USE_PHOTO = ['Use this photo', 'استخدم الصورة دي', 'Utiliser cette photo'];
export const SAVE = ['Save and continue', 'احفظ وكمّل', 'Enregistrer et continuer'];
export const OPEN_PICKER = ['Choose your work', 'Change your work', 'اختار شغلك', 'غيّر شغلك',
  'Choisir votre travail', 'Changer de travail'];

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
export async function registerProfessional({ combination, apply, capture }) {
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
