/**
 * The accessible-name rules, each one shown failing.
 *
 * A rule nobody has watched fail is a rule nobody knows works. The
 * documentation gate spent a week reporting green over a range it could not
 * see, and the lesson generalises: every rule here is given a control written
 * badly on purpose, and then the same control written correctly, so the gate
 * has to demonstrate both halves — that it catches the defect, and that it
 * leaves the fix alone.
 *
 * The second half matters more than it looks. Three of these exemptions were
 * written while fixing the twenty-six real findings — self-hiding components,
 * a name supplied by a wrapping `<label>`, and a subtree removed from the
 * accessibility tree — and an exemption written in a hurry is exactly how a
 * gate quietly stops looking at things.
 */
import assert from 'node:assert/strict';

import { inspectSource } from './accessible-names.mjs';

let checks = 0;
const rules = (source: string): string[] =>
  inspectSource('probe.tsx', source).map((finding) => finding.rule);

const fires = (rule: string, source: string, message: string) => {
  checks += 1;
  assert.ok(rules(source).includes(rule), `${message} — expected ${rule}, got [${rules(source)}]`);
};
const silent = (rule: string, source: string, message: string) => {
  checks += 1;
  assert.ok(!rules(source).includes(rule), `${message} — unexpected ${rule}`);
};

// --- silent-contributor: the leading comma, before it is a comma -------------
/*
 * The defect itself, twice over in the real product: thirty-four trades in the
 * profession picker and three checkboxes on the verification step. The icon
 * contributes an empty segment to a composed name and the separator survives.
 */
fires('silent-contributor',
  '<Pressable onPress={go}><MaterialIcons name="star" /><AppText>Rate</AppText></Pressable>',
  'an unnamed control composing over a bare icon');

silent('silent-contributor',
  '<Pressable onPress={go}><MaterialIcons accessibilityElementsHidden importantForAccessibility="no" name="star" /><AppText>Rate</AppText></Pressable>',
  'the icon marked decorative is the fix, not a finding');

silent('silent-contributor',
  '<Pressable accessibilityLabel="Rate" onPress={go}><MaterialIcons name="star" /><AppText>Rate</AppText></Pressable>',
  'a control that names itself never composes one');

/*
 * `WarshaIcon` sets accessibilityElementsHidden itself when it is given no
 * label. Flagging it would punish the primitive-level fix this whole audit
 * exists to encourage — which is the failure mode of a rule that only knows
 * how to say no.
 */
silent('silent-contributor',
  '<Pressable onPress={go}><WarshaIcon name="plumber" /><AppText>Plumber</AppText></Pressable>',
  'a component that hides itself needs no help');

// --- nested-interactive: a control inside a control --------------------------
/*
 * react-native's Pressable sets `accessible: accessible !== false`, so a
 * Pressable inside one is merged into it: visible to a finger, unreachable to a
 * screen reader. This is how the favourite, archive and close controls were
 * lost.
 */
fires('nested-interactive',
  '<Pressable accessibilityLabel="Card" onPress={open}><AppText>Name</AppText>'
  + '<Pressable accessibilityLabel="Save" onPress={save}><AppText>Save</AppText></Pressable></Pressable>',
  'a pressable inside a pressable');

silent('nested-interactive',
  '<Pressable accessibilityLabel="Card" onPress={open}><AppText>Name</AppText>'
  + '<Pressable accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onPress={save}>'
  + '<AppText>Save</AppText></Pressable></Pressable>',
  'an inner control taken out of the tree, its job given to an accessibility action');

// --- unnamed-control: a button that says only "button" -----------------------
fires('unnamed-control',
  '<Pressable onPress={close}><MaterialIcons accessibilityElementsHidden importantForAccessibility="no" name="close" /></Pressable>',
  'an icon-only control with nothing left to say');

/*
 * `<Field label={...}><select/></Field>` renders `<label><span/>{children}</label>`.
 * The select is named by the wrapper, and reporting it unnamed — which this did
 * on three real fields — teaches the next person to add a redundant label.
 */
silent('unnamed-control',
  '<label><span>Preset</span><select value={v} onChange={set}><option>A</option></select></label>',
  'a wrapping label names what it wraps');

// --- inherited hiding: a control that is not in the tree at all --------------
silent('unnamed-control',
  '<View importantForAccessibility="no-hide-descendants">'
  + '<Pressable onPress={close}><MaterialIcons name="close" /></Pressable></View>',
  'a control under a hidden subtree has no name to get wrong');

// --- fragmented-group: a group that stops composing --------------------------
/*
 * Found by reading emulator-5554 rather than the source. `OnboardingFieldMeta`
 * wraps a field's label, its badges and its explanation in one `<View
 * accessible>` so they arrive as a single announcement. A group stops composing
 * the moment something inside it is an accessibility element of its own, and
 * the group's own text is then announced by nobody — which on the
 * criminal-record step meant two bare words, "Required" and "Private", and a
 * privacy disclosure no reader was offered.
 */
fires('fragmented-group',
  '<View accessible><AppText>Issue date</AppText>'
  + '<View accessible accessibilityLabel="Required" /><AppText>Why we ask</AppText></View>',
  'a group holding an accessibility element of its own');

silent('fragmented-group',
  '<View accessible><AppText>Issue date</AppText>'
  + '<View><AppText>Required</AppText></View><AppText>Why we ask</AppText></View>',
  'a group whose parts are only text composes exactly as intended');

/*
 * The cross-component half, and the reason the rule saw nothing on the first
 * run: `<StateBadge />` at a call site is indistinguishable from `<View />`
 * until you know what StateBadge returns.
 */
checks += 1;
assert.ok(
  inspectSource('probe.tsx', '<View accessible><AppText>Issue date</AppText><StateBadge label="Required" /></View>',
    new Set(['StateBadge'])).some((finding) => finding.rule === 'fragmented-group'),
  'a component known to be an accessibility element fragments the group it sits in');

checks += 1;
assert.ok(
  inspectSource('probe.tsx', '<View accessible><AppText>Issue date</AppText><StateBadge label="Required" /></View>',
    new Set()).length === 0,
  'and the same call site is innocent once StateBadge stops being one');

// --- chip-pollution: a status absorbed into a name ---------------------------
fires('chip-pollution',
  '<Pressable onPress={go}><AppText>National ID</AppText><AppText>Required</AppText></Pressable>',
  'a chip swallowed into the name of the field it decorates');

// --- state-said-twice: the reader says it from the state and the name --------
fires('state-said-twice',
  '<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} '
  + 'accessibilityLabel="Emergency, selected" onPress={go}><AppText>Emergency</AppText></Pressable>',
  'a label repeating what accessibilityState already carries');

// --- joined-name: a name with a hole in it -----------------------------------
/*
 * The same defect the platform makes, made by hand. `${a}. ${b ?? ''}` with an
 * absent `b` is "File. " — the trailing form of the leading comma, and a real
 * finding on the chat attachment row.
 */
fires('joined-name',
  '<Pressable accessibilityRole="link" accessibilityLabel={`${t("file")}. ${name ?? ""}`} onPress={go}>'
  + '<AppText>x</AppText></Pressable>',
  'a fallback that can be the empty string leaves the separator behind');

silent('joined-name',
  '<Pressable accessibilityRole="link" accessibilityLabel={[a, b, c].filter(Boolean).join(". ")} onPress={go}>'
  + '<AppText>x</AppText></Pressable>',
  'filter(Boolean) is the defence against this, and must not be flagged as the defect');

console.log(`Accessible names: ${checks} checks passed.`);
