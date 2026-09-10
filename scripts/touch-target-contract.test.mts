/**
 * Every control a finger has to hit declares a comfortable minimum height.
 *
 * This replaces a check that measured rendered bounds, which could not work and
 * did not. uiautomator CLIPS bounds to the containing viewport, so a row
 * scrolled half out of a list reports the height of the part still showing —
 * and a chip whose own style says `minHeight: 48` came back as fourteen dp.
 * There is no way to tell that apart from a genuinely small control, because
 * the two are the same number.
 *
 * That check produced findings all day and every one of them was clipping. One
 * was written into the certification record as a real defect on a destructive
 * control before the units were checked twice. A signal that has never once
 * been right is worse than no signal: it gets believed.
 *
 * So the question is asked where it has a definite answer. A style either
 * declares a minimum or it does not, and that is not affected by where the
 * control happens to be when a screenshot is taken.
 *
 * What this cannot see: a control shrunk by its parent, or one whose height
 * comes from padding and content rather than a declared minimum. Those are real
 * and this does not cover them — which is why it is a contract about intent,
 * not a measurement, and is named accordingly.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };

/** The Android and iOS guidance agree on this one: 44dp, or 48 for Material. */
const MINIMUM_DP = 44;

/*
 * Every style a finger lands on, named explicitly.
 *
 * A list rather than a sweep, because "which styles are interactive" is not
 * something a regex can decide — `badge` is 30dp and correct, since nobody taps
 * a badge. Adding an interactive primitive means adding it here, which is the
 * moment to ask whether it can be hit.
 */
const INTERACTIVE: [string, string, number][] = [
  ['components/warsha/OptionRow.tsx', 'row', 60],
  ['components/warsha/ProfessionSelector.tsx', 'chip', 48],
  ['components/warsha/BrandUI.tsx', 'button', 48],
  ['components/warsha/BrandUI.tsx', 'field', 48],
];

for (const [file, style, expected] of INTERACTIVE) {
  const source = readFileSync(file, 'utf8');
  /*
   * The style block is found by name and read for its own `minHeight`, so a
   * declaration inherited from somewhere else does not count as this one having
   * made a promise.
   */
  const block = new RegExp(`\\b${style}:\\s*\\{([^}]*)\\}`).exec(source);
  ok(block, `${file}: has a style called \`${style}\``);

  const declared = /minHeight:\s*(\d+)/.exec(block?.[1] ?? '');
  ok(declared, `${file} \`${style}\`: declares a minHeight — a control a finger `
    + 'has to hit should not be as tall as its text happens to be');

  const height = Number(declared?.[1] ?? 0);
  ok(height >= MINIMUM_DP,
    `${file} \`${style}\`: ${height}dp is under the ${MINIMUM_DP}dp minimum`);
  ok(height === expected,
    `${file} \`${style}\`: ${height}dp, expected ${expected}dp — if this changed `
    + 'deliberately, change the number here and say why in the commit');
}

// --- Badges are not buttons ---------------------------------------------------
/*
 * Recorded so the next person does not "fix" them. `badge` is 30dp and
 * `badgeCompact` 24dp, and both are correct: they are labels that report a
 * state — Required, Private, Verified — and nothing happens when you press one.
 */
{
  const source = readFileSync('components/warsha/BrandUI.tsx', 'utf8');
  for (const style of ['badge', 'badgeCompact']) {
    const block = new RegExp(`\\b${style}:\\s*\\{([^}]*)\\}`).exec(source);
    ok(block, `BrandUI has a \`${style}\` style`);
    ok(!/onPress|accessibilityRole:\s*'button'/.test(block?.[1] ?? ''),
      `\`${style}\` is not pressable, which is why it is allowed to be short`);
  }
}

console.log(`Touch target contract: ${checks} checks passed.`);
