/**
 * What Warsha's controls are actually called, when nobody names them.
 *
 * ## The defect, twice
 *
 * Thirty-four trades in the profession picker announced as `, Plumber`. Three
 * checkboxes on the verification step announced as
 * `, I confirm this is my own criminal record`. Same leading comma, same cause,
 * two days and one shared-component rewrite apart.
 *
 * The comma is not the bug. It is the symptom of one: a control with no
 * `accessibilityLabel` does not go unnamed — the platform composes a name by
 * walking the children and joining what it finds with `", "`. A decorative icon
 * that never opted out of the tree contributes an empty segment, the separator
 * survives, and the name arrives with a hole at the front.
 *
 * Grepping for `", "` would have found neither, because neither literal comma
 * exists anywhere in the source. It is manufactured at runtime by the platform.
 * So this audit does not look at punctuation. It looks at the structural
 * condition that produces it: a control whose name is composed, containing a
 * descendant that contributes nothing, or too much, or something already said.
 *
 * ## What it judges
 *
 *   silent-contributor    composed name + an icon that never hid itself
 *   unnamed-control       composed name with no text at all — a silent button
 *   nested-interactive    a control inside a control, corrupting both names
 *   chip-pollution        status text absorbed into the name of the thing it labels
 *   state-said-twice      the label says what accessibilityState already says
 *   joined-name           a name assembled from parts, one of which can be empty
 *
 * Native and web are read by the same walker, because the failure is the same
 * failure: `aria-hidden` and `accessibilityElementsHidden` are the same promise
 * made to two different screen readers.
 *
 * ## What it deliberately does not judge
 *
 * Whether a name is a good name. `axe-core` says the same thing in
 * `web-accessibility-audit.mjs`, and it is still true: no static rule knows
 * whether "Continue" was the right word. This finds names that are malformed,
 * not names that are unhelpful.
 *
 * Usage: node scripts/accessible-names.mjs [--all]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = process.cwd();
const ROOTS = ['app', 'components', 'web/app', 'web/components'];

// --- what counts as a control ----------------------------------------------
/*
 * A control is anything a screen reader will stop on and offer to activate. It
 * is reached three ways: a touchable component, an explicit role, or the web's
 * own interactive elements. All three get a name, and all three can get it
 * wrong in the same way.
 */
const TOUCHABLES = new Set([
  'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
]);
const CONTROL_ROLES = new Set([
  'button', 'checkbox', 'radio', 'switch', 'link', 'tab', 'menuitem',
  'combobox', 'imagebutton', 'togglebutton', 'spinbutton', 'slider', 'search',
]);
const WEB_INTERACTIVE = new Set(['button', 'a', 'select', 'textarea', 'summary']);

/*
 * Icons and images contribute nothing a reader can say. Each of these is a real
 * component in this repository; `WarshaIcon` is absent on purpose — it sets
 * accessibilityElementsHidden itself when it is given no label, which is the
 * primitive-level fix this audit exists to encourage, so flagging it would
 * punish the correct pattern.
 */
const DECORATIVE = new Set([
  'MaterialIcons', 'MaterialCommunityIcons', 'Ionicons', 'Feather', 'FontAwesome',
  'FontAwesome5', 'AntDesign', 'Entypo', 'Octicons', 'SimpleLineIcons',
  'Svg', 'ActivityIndicator',
]);
const SELF_HIDING = new Set(['WarshaIcon', 'BrandMark']);

// Words a chip says. A chip is a fine thing to show and a poor thing to be
// called: "Required" and "Private" are properties of a field, not its name.
const CHIP = new RegExp(
  '^(required|optional|private|new|verified|pending|beta|soon|free|recommended'
  + '|popular|obligatoire|facultatif|nouveau)$', 'i');
const STATE_WORD = new RegExp(
  '\\b(selected|checked|unchecked|expanded|collapsed|disabled|active|inactive)\\b', 'i');
/*
 * `.filter(Boolean).join()` is the fix for this, so flagging it would punish the
 * one pattern that cannot produce the defect. A bare `.join()` is flagged, and so
 * is an interpolation holding `??` or `&&`, because both reach for a fallback
 * that can be the empty string.
 *
 * This only reads a label written at the call site. A name assembled into a
 * local first and passed by reference arrives here as a bare identifier and is
 * not judged — the rule catches assembly in the attribute, not in the file.
 */
const GUARDED = new RegExp('\\.filter\\(Boolean\\)');
const ASSEMBLY = new RegExp('\\.join\\(|\\$\\{[^}]*\\?\\?|\\$\\{[^}]*&&');
const isAssembled = (label) => !GUARDED.test(label) && ASSEMBLY.test(label);

// --- AST helpers ------------------------------------------------------------
const tagOf = (node) => {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const text = opening.tagName.getText();
  return text.includes('.') ? text.split('.').pop() : text;
};
const attrsOf = (node) => {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.attributes.properties.filter(ts.isJsxAttribute);
};
const attr = (node, name) => attrsOf(node).find((a) => a.name.getText() === name);
const attrText = (node, name) => {
  const found = attr(node, name);
  if (!found) return null;
  const init = found.initializer;
  if (!init) return 'true';
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) return init.expression.getText();
  return null;
};
const isJsx = (node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
const childrenOf = (node) => (ts.isJsxElement(node) ? node.children : []);
const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

/** Every JSX element beneath this one, in order, without leaving the file. */
function descendants(node) {
  const out = [];
  const visit = (n) => {
    n.forEachChild((child) => {
      if (isJsx(child)) out.push(child);
      visit(child);
    });
  };
  visit(node);
  return out;
}

function controlKind(node) {
  const tag = tagOf(node);
  const role = attrText(node, 'accessibilityRole') ?? attrText(node, 'role');
  if (role && CONTROL_ROLES.has(role)) return role;
  if (TOUCHABLES.has(tag)) return 'touchable';
  if (WEB_INTERACTIVE.has(tag)) {
    // A bare <a> with no href is an anchor, not a control.
    if (tag === 'a' && !attr(node, 'href') && !attr(node, 'onClick')) return null;
    return tag;
  }
  if (attr(node, 'accessible') && attr(node, 'onPress')) return 'accessible';
  return null;
}

/** Does this element carry a name of its own, rather than borrowing one? */
function hasExplicitName(node) {
  const sources = ['accessibilityLabel', 'aria-label', 'accessibilityLabelledBy',
    'aria-labelledby', 'alt', 'title'];
  for (const name of sources) if (attr(node, name)) return name;
  return null;
}

/**
 * Hiding is inherited; naming is not.
 *
 * `importantForAccessibility="no-hide-descendants"` takes the whole subtree out
 * of the tree, so a control beneath it has no accessible name to get wrong —
 * which is the point of putting it there. Judging those anyway reported three
 * controls as unnamed immediately after they were deliberately removed from the
 * reader's reach, and would have pushed the next person to name something that
 * is not there.
 */
function isHiddenAnywhereAbove(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!isJsx(parent)) continue;
    if (attrText(parent, 'importantForAccessibility') === 'no-hide-descendants') return true;
    if (attrText(parent, 'aria-hidden') === 'true') return true;
  }
  return false;
}

/**
 * A name can also arrive from above.
 *
 * `<Field label={...}><select/></Field>` renders `<label><span/>{children}</label>`,
 * and an HTML `<label>` wrapping a control names it without the control saying
 * anything. Three selects were reported unnamed on that pattern alone, which
 * they are not — so the walker has to look up as well as down.
 *
 * The `label`-prop half of this is deliberately generous: any ancestor handed a
 * `label` is assumed to be doing something with it. That can hide a real miss
 * behind a wrapper that takes the prop and drops it, which no static read can
 * see. Being wrong in the quiet direction is the right trade for a gate: a
 * false alarm gets it switched off, and a switched-off gate finds nothing.
 */
function nameFromAncestor(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!isJsx(parent)) continue;
    if (tagOf(parent) === 'label') return 'wrapping <label>';
    if (attr(parent, 'label')) return `${tagOf(parent)} label prop`;
    if (hasExplicitName(parent)) return null; // a named ancestor absorbs, it does not lend
  }
  return null;
}

/** Has this element removed itself from the accessibility tree? */
function isHidden(node) {
  if (attr(node, 'accessibilityElementsHidden')) return true;
  if (attrText(node, 'aria-hidden') === 'true') return true;
  const important = attrText(node, 'importantForAccessibility');
  if (important === 'no' || important === 'no-hide-descendants') return true;
  if (attrText(node, 'accessible') === 'false') return true;
  return false;
}

// --- the rules --------------------------------------------------------------
const TEXT_TAGS = ['Text', 'AppText', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em'];

/**
 * Read one component and report what its controls are called.
 *
 * Exported so the regression suite can hand it a control written badly on
 * purpose and check that the rule actually fires. A rule nobody has ever seen
 * fail is a rule nobody knows works — which is how the documentation gate spent
 * a week reporting green over a range it could not see.
 *
 * @param {string} file  a name for the report; it is not read from disk
 * @param {string} text  the component source
 * @returns {{file: string, line: number, rule: string, detail: string, why: string}[]}
 */
export function inspectSource(file, text) {
  const findings = [];
  const record = (where, line, rule, detail, why) =>
    findings.push({ file: where, line, rule, detail, why });
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const visit = (node) => {
    if (isJsx(node)) {
      const kind = controlKind(node);
      if (kind && !isHidden(node) && !isHiddenAnywhereAbove(node)) {
        const named = hasExplicitName(node) ?? nameFromAncestor(node);
        const inside = descendants(node);
        const line = lineOf(source, node);
        const tag = tagOf(node);

        // A control inside a control. Both names are now wrong: the outer one
        // absorbs the inner one's text, and the inner one may be unreachable.
        for (const child of inside) {
          if (controlKind(child) && !isHidden(child) && !isHiddenAnywhereAbove(child)) {
            record(file, lineOf(source, child), 'nested-interactive',
              `${tagOf(child)} inside ${tag}`,
              'A reader offers both, and the outer name now contains the inner one.');
            break;
          }
        }

        if (!named) {
          // The composed-name cases. Everything below only matters when the
          // platform is the thing writing the name.
          const visible = inside.filter((c) => !isHidden(c) && !isHiddenAnywhereAbove(c));
          const decorative = visible.filter((c) => DECORATIVE.has(tagOf(c))
            && !hasExplicitName(c) && !SELF_HIDING.has(tagOf(c)));

          if (decorative.length > 0) {
            record(file, line, 'silent-contributor',
              `${tag} composes its name over ${[...new Set(decorative.map(tagOf))].join(', ')}`,
              'The icon contributes an empty segment and the separator survives — '
              + 'this is the leading comma, before it is a comma.');
          }

          // No text anywhere beneath: the control has no name at all.
          const hasText = inside.some((c) => TEXT_TAGS.includes(tagOf(c)))
            || childrenOf(node).some((c) => ts.isJsxText(c) && c.text.trim())
            || childrenOf(node).some((c) => ts.isJsxExpression(c) && c.expression
              && !isJsx(c.expression));
          if (!hasText && inside.length > 0) {
            record(file, line, 'unnamed-control',
              `${tag} has no text beneath it and no label`,
              'A reader announces the role and nothing else: "button".');
          }

          // A chip is shown beside a control, and swallowed by it.
          for (const child of inside) {
            for (const grand of childrenOf(child)) {
              if (ts.isJsxText(grand) && CHIP.test(grand.text.trim())) {
                record(file, lineOf(source, child), 'chip-pollution',
                  `"${grand.text.trim()}" is absorbed into the name of ${tag}`,
                  'A status is a property of the control, not part of what it is called.');
              }
            }
          }
        } else if (named === 'accessibilityLabel' || named === 'aria-label') {
          const label = attrText(node, named) ?? '';
          const state = attrText(node, 'accessibilityState') ?? attrText(node, 'aria-checked')
            ?? attrText(node, 'aria-selected') ?? '';
          if (state && STATE_WORD.test(label)) {
            record(file, line, 'state-said-twice',
              `the label of ${tag} says state that accessibilityState already carries`,
              'A reader says it once from the state and once from the name.');
          }
          // A name assembled from parts is a name that can arrive with a hole,
          // which is the same defect the platform makes, made by hand.
          if (isAssembled(label)) {
            record(file, line, 'joined-name',
              `${tag}: ${label.replace(/\s+/g, ' ').slice(0, 70)}`,
              'If a part can be empty the separator stays, and the name opens on punctuation.');
          }
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return findings;
}

// --- run --------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('accessible-names.mjs')) runCli();

function runCli() {
const files = execFileSync('git', ['ls-files', ...ROOTS], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/).filter((f) => f.endsWith('.tsx'));

const findings = files.flatMap((file) =>
  inspectSource(file.replaceAll('\\', '/'), readFileSync(file, 'utf8')));

const byRule = new Map();
for (const finding of findings) {
  if (!byRule.has(finding.rule)) byRule.set(finding.rule, []);
  byRule.get(finding.rule).push(finding);
}

console.log(`\n=== Accessible names over ${files.length} components ===\n`);
const showAll = process.argv.includes('--all');
for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${rule} — ${list.length}`);
  console.log(`    ${list[0].why}`);
  for (const finding of showAll ? list : list.slice(0, 8)) {
    console.log(`      ${finding.file}:${finding.line}  ${finding.detail}`);
  }
  if (!showAll && list.length > 8) console.log(`      … ${list.length - 8} more (--all)`);
}
if (findings.length === 0) console.log('  Every control names itself.');
console.log(`\n${findings.length} finding(s) across ${new Set(findings.map((f) => f.file)).size} file(s).`);

/*
 * Non-zero, because a gate that cannot fail is a report. The whole point is
 * that the next control composed over an unhidden icon stops a push instead of
 * reaching a screen reader.
 */
if (findings.length > 0) process.exitCode = 1;
}
