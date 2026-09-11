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
 *   silent-contributor      composed name + an icon that never hid itself
 *   unnamed-control         composed name with no text at all — a silent button
 *   nested-interactive      a control inside a control, corrupting both names
 *   fragmented-group        a group holding an accessibility element of its own
 *   chip-pollution          status text absorbed into the name of what it labels
 *   state-said-twice        the label says what accessibilityState already says
 *   joined-name             a name assembled from parts, one of which can be empty
 *   duplicate-visible-label a phrase drawn twice because one copy holds a label
 *
 * ## The glyph
 *
 * Warsha draws every native icon through one component, `MaterialIcons`, whose
 * marks live in the Unicode private-use area. So the "empty segment" above is
 * not empty: read off emulator-5554, the criminal-record checkbox announced
 * `, I confirm this is my own criminal record…` — U+E835, the codepoint for
 * `check-box-outline-blank`, handed to a screen reader as the first thing in
 * the name. One icon family is the whole blast radius, and `silent-contributor`
 * covers every place one of them sits inside something that composes a name,
 * control or group alike.
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

/**
 * Which of Warsha's own components are accessibility elements in their own right.
 *
 * `<StateBadge />` says nothing at its call site; the `accessible` lives inside
 * the component, and a walker that only reads the call site cannot tell it from
 * a plain `<View>`. That is the difference between seeing the criminal-record
 * step's fragmented group and walking straight past it.
 *
 * A component qualifies when the element it returns carries `accessible` or a
 * name of its own. Only the returned root is examined — something accessible
 * deep inside a component does not make the component one, and treating it as
 * such would flag every screen that contains a button.
 */
function accessibilityElementComponents(sources) {
  const names = new Set();
  for (const [file, source] of sources) {
    const consider = (name, body) => {
      if (!name || !body) return;
      const roots = [];
      const findReturns = (n) => {
        if (ts.isReturnStatement(n) && n.expression) roots.push(n.expression);
        // A nested component defines its own root; do not borrow it.
        if (!ts.isFunctionDeclaration(n) && !ts.isFunctionExpression(n)
          && !ts.isArrowFunction(n)) n.forEachChild(findReturns);
      };
      if (ts.isArrowFunction(body) && !ts.isBlock(body)) roots.push(body);
      else body.forEachChild(findReturns);

      for (const root of roots) {
        const unwrapped = ts.isParenthesizedExpression(root) ? root.expression : root;
        if (!isJsx(unwrapped)) continue;
        if (attr(unwrapped, 'accessible') || hasExplicitName(unwrapped)) {
          names.add(name);
          return;
        }
      }
    };

    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) consider(node.name.getText(), node.body);
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const init = node.initializer;
        // forwardRef(function X(){}) and memo(() => …) both wrap the real body.
        const inner = ts.isCallExpression(init) ? init.arguments[0] : init;
        if (inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner))) {
          consider(node.name.getText(), inner.body ?? inner);
        }
      }
      node.forEachChild(visit);
    };
    visit(source);
    void file;
  }
  return names;
}

/**
 * The same heading, drawn twice, because one copy is holding a label.
 *
 * Four cards passed the same expression to their own title and to a field's
 * `label`, so "Upload the criminal-record certificate" appeared twice inside one
 * card, 190px apart, with a single line of body text between them. It reads as a
 * mistake because it is one: the visible hierarchy and the accessibility
 * labelling authority are two different jobs, and only the second one needed the
 * phrase repeated.
 *
 * A flag at the call site fixes a site. This is what stops the fifth one, by
 * noticing that a label a card already shows has not said it knows that.
 *
 * It reads expression SOURCE, not values — `wt.text('certificateTitle')` matching
 * `wt.text('certificateTitle')`. Two different expressions resolving to the same
 * string at runtime are invisible here, and a title built inline from a variable
 * will not match one built another way. It catches the copy-paste, which is how
 * all four of these arrived.
 */
function visibleTitlesAbove(node, stop) {
  const titles = new Set();
  for (let parent = node.parent; parent && parent !== stop; parent = parent.parent) {
    if (!isJsx(parent)) continue;
    const title = attrText(parent, 'title');
    if (title) titles.add(title);
    for (const other of descendants(parent)) {
      // Anything inside the element being judged is its own business.
      if (other === node || descendants(node).includes(other)) continue;
      if (!TEXT_TAGS.includes(tagOf(other))) continue;
      for (const child of childrenOf(other)) {
        if (ts.isJsxExpression(child) && child.expression) titles.add(child.expression.getText());
      }
    }
  }
  return titles;
}

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

/**
 * A group that gathers several things into one announcement.
 *
 * `<View accessible>` around a label, its badges and its explanation is a
 * deliberate pattern here — `OnboardingFieldMeta` uses it so a field arrives as
 * one announcement rather than four fragments. It only works if nothing inside
 * it is an accessibility element of its own, and when something is, the group
 * does not merely read badly: it stops composing at all.
 *
 * Read off `emulator-5554`, the criminal-record step showed exactly that. The
 * two `StateBadge` chips are `<View accessible accessibilityLabel>`, so they
 * became focusable nodes and the group around them composed nothing — leaving
 * the field's label and the sentence "Warsha uses this only for professional
 * verification." as non-focusable text with no named ancestor, and two bare
 * words, "Required" and "Private", with nothing to attach them to.
 */
const isGroup = (node) => Boolean(attr(node, 'accessible'))
  && !attr(node, 'onPress') && !attr(node, 'onClick');

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
 * @param {Set<string>} elementComponents  Warsha components that are themselves
 *   accessibility elements, from `accessibilityElementComponents`. Empty is a
 *   valid answer and simply means groups are judged on their call sites alone.
 * @returns {{file: string, line: number, rule: string, detail: string, why: string}[]}
 */
export function inspectSource(file, text, elementComponents = new Set()) {
  const findings = [];
  const record = (where, line, rule, detail, why) =>
    findings.push({ file: where, line, rule, detail, why });
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const visit = (node) => {
    if (isJsx(node)) {
      if (isJsx(node) && isGroup(node) && !isHidden(node) && !isHiddenAnywhereAbove(node)) {
        const fragments = descendants(node).filter((child) =>
          !isHidden(child) && !isHiddenAnywhereAbove(child)
          && (attr(child, 'accessible') || hasExplicitName(child) || controlKind(child)
            || elementComponents.has(tagOf(child))));
        if (fragments.length > 0 && !hasExplicitName(node)) {
          record(file, lineOf(source, node), 'fragmented-group',
            `${tagOf(node)} groups an announcement around ${[...new Set(fragments.map(tagOf))].join(', ')}`,
            'A group stops composing when something inside it is an accessibility '
            + 'element of its own, and its own text is then announced by nobody.');
        }

        /*
         * A group composes its name exactly the way a control does, so an icon
         * inside an unnamed one leaks the same way. Warsha draws every native
         * icon through one component, `MaterialIcons`, whose glyphs live in the
         * Unicode private-use area — which is why the criminal-record checkbox
         * announced `` and then a comma. A reader is handed the codepoint.
         */
        if (!hasExplicitName(node)) {
          const leaking = descendants(node).filter((child) => DECORATIVE.has(tagOf(child))
            && !isHidden(child) && !isHiddenAnywhereAbove(child)
            && !hasExplicitName(child) && !SELF_HIDING.has(tagOf(child)));
          if (leaking.length > 0) {
            record(file, lineOf(source, node), 'silent-contributor',
              `${tagOf(node)} groups an announcement over ${[...new Set(leaking.map(tagOf))].join(', ')}`,
              'The icon contributes an empty segment and the separator survives — '
              + 'this is the leading comma, before it is a comma.');
          }
        }
      }

      /*
       * A field label the card above already shows. The phrase is needed once
       * for the eye and once for the reader, not twice for the eye.
       */
      /*
       * Only things that DESCRIBE a field, not things that are one.
       *
       * The first version of this rule asked whether any `label` repeated an
       * ancestor's text, and reported fourteen — a Sign in button under a Sign
       * in heading, a toggle inside the section it is named for, a badge whose
       * label is its entire content. All correct as written: a control has to
       * carry its own name, and repeating a nearby heading is how a person knows
       * which button does the thing.
       *
       * A `label` beside a `purpose` is the shape of something explaining a
       * field rather than being it, and that is the only place the repetition is
       * a defect. Two real findings instead of fourteen mostly-wrong ones, and a
       * gate that survives being read.
       */
      if (attr(node, 'label') && attr(node, 'purpose') && !attr(node, 'labelShownElsewhere')) {
        const label = attrText(node, 'label');
        if (label && visibleTitlesAbove(node, source).has(label)) {
          record(file, lineOf(source, node), 'duplicate-visible-label',
            `${tagOf(node)} draws ${label} that an ancestor already shows`,
            'The visible hierarchy and the accessible name are different jobs, and '
            + 'only one of them needed the phrase twice.');
        }
      }

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

/*
 * Two passes: which of Warsha's own components are accessibility elements, and
 * only then what that means for the groups they sit inside. The second question
 * cannot be answered without the first — a `<StateBadge />` call site looks
 * exactly like a `<View />` one.
 */
const parsed = files.map((file) => [file, ts.createSourceFile(
  file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)]);
const elementComponents = accessibilityElementComponents(parsed);

const findings = files.flatMap((file) =>
  inspectSource(file.replaceAll('\\', '/'), readFileSync(file, 'utf8'), elementComponents));

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
