# The Warsha visual north star

The role-selection screen — **"How will you use Warsha?"** — is the reference for
the whole product, on every surface and in every appearance.

Rendered reference: the role question in `app/create-account.tsx` (copy key
`roleQuestion`), rendered on `emulator-5554`.

## The rule, in one line

> **Do not copy this screen everywhere. Make everything feel like it belongs with
> this screen.**

The test is: if two Warsha screens were shown with the logo removed, would they
obviously come from the same product? That answer should keep getting closer to
yes.

Turning every surface into a white rounded rectangle with a shadow and an icon
well would fail this, not pass it. What makes the screen good is *hierarchy* —
and hierarchy is destroyed by giving everything the same treatment.

## It is an artistic language, not a colour scheme

This matters enough to be its own rule, because the reference screenshot is a
light one and the obvious misreading is "make Warsha look like this white
screen."

**Light Warsha and Dark Warsha are siblings.** Both are first-class expressions
of one art direction. Dark is not an inversion, not an accessibility fallback,
and not a different aesthetic. The question to design against is: *if the same
designer had drawn this screen natively for dark mode on the same day, what would
it look like?*

System appearance chooses between two fully designed themes. It is not a third
one. Switching should feel like changing the lighting in a room, not opening a
different application.

## What the screen is doing

**A warm canvas.** The ground is not clinical white. It has a paper quality that
makes the surfaces on it feel physical. The dark equivalent is not `#000000`; it
is a very dark, slightly warm, comfortable ground that elevated surfaces can
still visibly sit on.

**Soft, believable depth.** The shadow is restrained and warm, not a generic drop
shadow. In dark mode a black shadow on a black canvas disappears, so depth there
comes from tonal separation, a restrained edge, and icon-well contrast — combined
deliberately, and never pushed into glossy or neumorphic territory.

**Surfaces have a reason.** The two role cards float because they are the decision
the screen exists for. Elevation, border, canvas, inset well and spacing are five
different tools for hierarchy, not five ways to say "card". **Not everything
floats.** If everything carries the role-card shadow, nothing has hierarchy.

**Icon wells.** The mark gets its own quiet space, which separates symbol from
content, aids recognition and creates rhythm down a list. Use it where an icon
genuinely carries the identity of an action, category, step or concept. Do not
put every small utility icon in a square. The well needs a dark expression that
does the same job without becoming a glowing patch or grey-on-grey noise.

**Typography does the explaining.** The screen is nearly understandable before it
is read: brand, then question, then choice, then supporting line, then secondary
action.

**Generous but controlled spacing.** It breathes without being a dashboard and
without wasting the screen.

**Related geometry.** Cards, wells and controls share a rounding family. The
radius looks decided, not independently invented per component.

**Restrained palette.** The character comes from type, spacing, shape, depth and
surface contrast rather than brand colour. Dark mode does not get to solve itself
with bright accents.

**Tactility.** Controls look touchable. This is not decoration: a large part of
Warsha's Professional audience reads slowly, and affordance that is understood
before the copy is read is a functional requirement, not a nicety.

## Elevation hierarchy

Roughly, and subordinate to whatever `elevationFor` already expresses:

| level | used for |
| --- | --- |
| 0 | canvas, structural content |
| 1 | quiet grouped surfaces, long lists, rows |
| 2 | important interactive cards and selections |
| 3 | temporary floating surfaces — sheets, dialogs |

A nineteen-item catalogue belongs at level 1 even though a two-choice role picker
belongs at level 2. Same art direction, different hierarchy. That is the point.

## How this gets applied

Progressively, through the certification programme — not as a search-and-replace
of styles. As each surface is reached: inspect it, compare it to the north star,
find the systemic mismatch, improve the primitive or token, propagate, render,
inspect, certify.

**Every north-star judgement must look at light AND dark.** A component certified
from its light rendering alone is not certified.

Questions worth asking at each surface: does the canvas/surface relationship hold?
Is hierarchy obvious? Does interaction feel tactile? Are borders and shadows
purposeful? Are icon wells earning their place? Does anything still look like
default React Native, Material, or browser chrome? Is anything sterile, busy, or
overdesigned?

## Where it applies

Everywhere: customer and Professional native, shared primitives, the public site,
customer and Professional web, and admin — where admin keeps its operational
density but shares the foundations (typography, colour tokens, spacing, controls,
states, iconography, accessibility). Density is legitimate; generic SaaS panels
and browser-default links are not.

Web is the same design language on a different canvas. Not an enlarged phone
screen, and not a separate flat marketing design either.

## Interaction states are part of it

A beautiful default with default interaction states is unfinished. Default,
pressed, selected, focused, disabled, loading, error and success all belong to
the same system.

## Localization is part of it

Arabic is first-class: RTL composition, reading-edge placement, natural hierarchy,
bidi, accessibility order. French must be allowed to grow. A pretty English
composition preserved by clipping localized text is a failure, not a success.

## Known gaps, on the record

- **Dark mode does not express this yet.** Read off `emulator-5554`: near-black
  canvas, rows barely separable from it, icon wells almost invisible, no warmth
  and no depth. It is currently the mechanical translation this document says not
  to do, and it is the largest open north-star gap.
- **Web has not been audited against this** at all yet.
- **Customer Home controls, found while certifying the vertical catalogue**
  (2026-09-16, `emulator-5554`, pre-existing — not introduced by that change):
  - the search placeholder wraps inside a single-line field at 1.3× text in
    French at 320dp; the clipped second line leaves a stray dot under
    "Rechercher un";
  - the search input's text area measures 22–29dp tall inside its 52dp box;
  - the filters icon measures 23dp (it carries `hitSlop: 10`, which a tree dump
    cannot show);
  - "View all" beside a shelf title measures 20–24dp.
  Category rows (66dp, growing when a label wraps) and the chat and notification
  controls (44dp) pass.

## Related

- `docs/ux/icon-semantics.md` — an icon that is technically correct and reads as
  something else is a defect. The appearance control that rendered a letterform
  beside a globe is the canonical example.
- `docs/decisions/accessible-names.md` — the accessibility rules these surfaces
  are held to.

## Design review

This is the standing art-direction authority for the Claude Design queue. It is
deliberately **not** a reason to spend shared Design usage screen by screen.
Claude Code formalizes and propagates the system first; at a meaningful milestone
one batched review covers representative rendered surfaces — this screen, Customer
Home, Professional onboarding, a request flow, an active job, a representative web
page and a representative dark surface — asking one question: *do these feel like
one coherent Warsha, and what systemic changes would most improve that?*
