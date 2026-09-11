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

This is worse than a malformed name. The inner control is visible to a finger
and absent to a screen reader. In Warsha that meant:

- a provider could not be favourited from a list or a discovery result,
- a notification could not be marked read or archived,
- a notification banner could not be dismissed at all, so it sat over the
  screen until it expired.

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

## What the gate deliberately does not judge

Whether a name is a *good* name. No static rule knows whether "Continue" was the
right word. This finds names that are malformed, not names that are unhelpful —
the same limit `axe-core` states in `web-accessibility-audit.mjs`, which covers
the rendered web surfaces alongside this.
