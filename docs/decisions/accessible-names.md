# A control that does not name itself is named by the platform

## The defect, three times

Thirty-four trades in the profession picker announced as `, Plumber`. Three
checkboxes on the verification step announced as `, I confirm this is my own
criminal record`. Then twenty-six more across orders, bookings, quotes,
notifications and the tab bar.

Each was fixed in the place it was found. None of them was found by looking at
the product — they were found by reading the accessibility tree, because none
of this is visible in a screenshot.

## The cause

A control with no `accessibilityLabel` is not unnamed. The platform composes a
name for it by walking the children and joining what it finds with `", "`. A
decorative icon that never opted out of the tree contributes an empty segment,
the separator survives, and the name arrives with a hole in it.

The comma is a symptom. Grepping for `", "` finds nothing, because no literal
comma exists in the source — it is manufactured at runtime.

So the rule is structural, not textual:

> A control either carries its own name, or every child that cannot contribute
> one is out of the accessibility tree.

`scripts/accessible-names.mjs` enforces it over native and web together, and
`scripts/accessible-names.test.mts` shows each rule failing on purpose, because
a rule nobody has watched fail is a rule nobody knows works.

## A control inside a control is unreachable, not just badly named

`react-native`'s `Pressable` sets `accessible: accessible !== false`
(`Libraries/Components/Pressable/Pressable.js`). Every Pressable is therefore an
accessibility element, and a Pressable inside one is merged into it.

### What that actually costs, measured rather than assumed

The first version of this note said the inner control was "visible to a finger
and absent to a screen reader". That is true on iOS and **not** true on Android,
and the difference was found by reading a real accessibility tree rather than
reasoning about one.

A `uiautomator` dump of the notification banner on `emulator-5554` returns both
nodes as separately clickable:

```
[Button] clickable=true desc='Informational. Verification sent. …'
[Button] clickable=true desc='Close notification banner'
```

So on Android the nested control is reachable. On iOS, VoiceOver merges the
children of an accessibility element and it is not. The claim to make is the
narrow one: **a nested control is reachable on Android and unreachable under
VoiceOver, so a product that ships both cannot rely on it being there.**

An `accessibilityActions` entry is reachable on both — through TalkBack's
actions menu and through VoiceOver's rotor — which is why it is the form Warsha
uses. It trades a little Android discoverability for an affordance that exists
on every surface instead of most of them.

The iOS half of this is not yet certified on a device. It is the documented
behaviour of `accessible={true}` and it matches the Android measurement above,
but it has not been read off a real VoiceOver tree here, and this note should
not be read as saying it has.

**A card with inline actions exposes them with `accessibilityActions` and
`onAccessibilityAction`, and hides the inner control from the tree.** The finger
keeps the smaller, closer target; the reader gets the action. Offer an action
only while its control is actually on screen, so nobody is told about something
that is not there.

## What moves when the control moves

An `accessibilityState` belongs to a control. An accessibility action has a
label and no state. So when a control that carried state becomes an action, the
state has to be said somewhere else — in words, in the name of the row.

The discovery card's saved state moved this way, and the test that protected it
moved with it and gained a second half: that the state is announced, *and* that
the action is reachable. The requirement did not weaken. The place that
satisfies it changed, and the assertion now describes the property rather than
the old implementation.

## A group stops composing when something inside it is an element of its own

The mirror image of the same rule. `<View accessible>` around a label, its
badges and its explanation makes them one announcement instead of four
fragments — and that only holds while nothing inside is an accessibility
element in its own right.

`StateBadge` was `<View accessible accessibilityLabel>`, so on the
criminal-record step the group composed nothing at all:

```
[ViewGroup] focusable      desc='Required'
[ViewGroup] focusable      desc='Private'
[TextView]  not focusable  'Upload the criminal record'
[TextView]  not focusable  'Warsha uses this only for professional verification.'
```

Two bare words with nothing to attach them to, and the field's label and its
privacy disclosure left as text with no named ancestor and no focus of their
own. **A badge says something about the thing beside it**, so it contributes its
word to that thing's name rather than standing as a stop of its own.

Catching this needs two passes. `<StateBadge />` at a call site is
indistinguishable from `<View />` until you know what `StateBadge` returns, so
`accessibilityElementComponents` answers that first — from the returned root
only, because something accessible deep inside a component does not make the
component one, and treating it that way would flag every screen containing a
button.

## Certified on a device, and what was not

Read off `emulator-5554`, comparing two release APKs — one built 11:19, one
built 17:42 — on the criminal-record step.

Before:

```
[CheckBox] desc=', I confirm this is my own criminal record and the details on it are mine.'
[ViewGroup] focusable desc='Required'
[ViewGroup] focusable desc='Private'
```

After:

```
[CheckBox] focusable checked=false desc='I confirm this is my own criminal record and the details on it are mine.'
[TextView] not focusable text='Required'
[TextView] not focusable text='Private'
```

Across that whole screen: no accessible name begins with a comma, and none
contains a private-use glyph. `checked=false` — the tree was read, and the
attestation was not ticked.

Note what the before-state actually was. `` is not an "empty segment"; it
is the MaterialIcons codepoint for `check-box-outline-blank`, read out as the
first thing in the name. The glyph is what a screen reader was being handed.

The artifact was checked rather than assumed, per the release invariant: the
bundle inside the 17:42 APK contains `savedProvider` and does not contain
"Choose a file", which places both `563eaad` and `4612c54` in it by content and
not by build time.

**Not certified on a device:** the tab bar, the order card, the provider and
discovery rows, and the notification row and banner actions. All sit behind a
signed-in customer, and this emulator holds a worker part-way through
onboarding. They are covered by `audit:accessible-names` and by the rendered
web audit, which is not the same thing as having been read off a tree, and this
note should not be read as claiming otherwise.

### iOS: UNVERIFIED

Every measurement in this note is Android, read from `uiautomator` on
`emulator-5554`. **No VoiceOver behaviour here has been observed on an Apple
device**, because that is behind the Apple enrolment boundary this machine does
not cross.

Shared implementation lowers the risk and does not replace the reading. Where
this note says a nested control is unreachable under VoiceOver, that is the
documented behaviour of `accessible={true}` and it is consistent with the
Android measurement — it is not runtime proof, and it stays marked UNVERIFIED
until somebody reads an iOS tree.

### The duplicate label, certified in three languages

The fix was read off the device in each locale, on the same card, switching
through Warsha's own language control rather than the platform's — a manual
choice wins over the device, so the per-app locale override did nothing and had
to be abandoned.

| | title drawn | announcement | Required/Private focusable |
| --- | --- | --- | --- |
| EN | once | `Upload the criminal-record certificate. Required. Private. Warsha uses this only for professional verification.` | 0 |
| AR | once | `ارفع الفيش والتشبيه. مطلوب. خاص. ورشة بتستخدمها بس للتحقق من الصنايعي.` | 0 |
| FR | once | `Téléversez l'extrait de casier judiciaire. Obligatoire. Privé. Warsha s'en sert uniquement pour la vérification des professionnels.` | 0 |

Each phrase appears once in each announcement — no "Required, Private, Required,
Private" — and the badges are ordinary text rather than focus stops of their
own.

The RTL order is right, and it is right because it is mirrored rather than
reordered. In Arabic the badges sit at `مطلوب` x≈834-924 and `خاص` x≈660-720, so
reading right to left gives Required then Private, which is the order the
announcement uses. `row-reverse` produces that; the announcement is built in a
fixed logical order and is not mirrored, because a sentence is read in its own
direction. The back control moves with it, `[923,170]` in Arabic against
`[42,170]` in English.

Worth noting what the announcement now contains that it could not before: the
sentence "Warsha uses this only for professional verification." Before the
grouping fix the group composed nothing, and that line was text with no named
ancestor.

## What the gate deliberately does not judge

Whether a name is a *good* name. No static rule knows whether "Continue" was the
right word. This finds names that are malformed, not names that are unhelpful —
the same limit `axe-core` states in `web-accessibility-audit.mjs`, which covers
the rendered web surfaces alongside this.
