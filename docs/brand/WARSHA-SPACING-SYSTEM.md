# Warsha spacing system

Authority for vertical rhythm on every surface. Read this before adding a
margin, a gap, or a padding value anywhere in the product.

## Why this exists

Mobile has carried a 4px spacing scale in `constants/theme.ts` since the
beginning, and most React Native components use it. Web had radii, a page
gutter, and nothing else — so every module invented its own pixels. An audit on
2026-08-23 found **30 distinct hardcoded spacing values across 981 declarations
in 37 CSS files**, including 3px, 5px, 7px, 9px, 11px and 13px.

That is what "everything feels cramped" actually was. Not a page that needed a
bigger margin — an absent authority, filled in one screen at a time by whoever
was there.

## The scale

Both platforms use the same rhythm. They do **not** use the same pixels: a
finger is not a cursor, and a phone is not a 1440px viewport.

| Token | Web | Mobile (`spacing`) |
| --- | --- | --- |
| xs | 4px | 4 |
| sm | 8px | 8 |
| md | 12px | 12 |
| lg | 18px | 16 |
| xl | 28px | 24 |
| 2xl / xxl | 40px | 32 |
| — | — | xxxl 48 |

Web tokens live on `:root` in `web/app/globals.css` as `--space-*`. Mobile
tokens live in `constants/theme.ts` as `spacing`.

## Semantic spacing — use these, not the raw scale

The raw scale is the vocabulary. These name the *relationships*, and the
relationships are what has to stay consistent:

| Token | Web value | Relationship |
| --- | --- | --- |
| `--space-field-label` | 10px | label → control |
| `--space-field-help` | 6px | control → helper or error |
| `--space-field-gap` | 22px | one field group → the next |
| `--space-section-gap` | 14px | heading or explanation → its content |
| `--space-action-gap` | 24px | last content → primary action |
| `--space-action-between` | 12px | adjacent actions in a group |
| `--space-panel` | 24px | card and panel internal padding |

Two of these carry the whole hierarchy:

- **A label is nearer its control than the control is to the next field.**
  Otherwise the eye cannot tell which label belongs to which input.
- **Helper text is nearer its control than the label is.** It belongs to the
  thing above it; equal gaps make it float between two fields.

`.field` therefore uses the *tighter* gap as its base, and `.label` buys the
extra space above the control with a `margin-bottom`. Do not collapse these
into one `gap` — that is precisely the defect this replaced.

## The form field pattern

Every field, on every surface, in this order and with these gaps:

    Label  (+ required/optional indicator)
      ↓ --space-field-label
    Control
      ↓ --space-field-help
    Helper text, or validation error

Spacing stays the same whichever pieces are present. A field with no helper
text does not close up; a field that grows an error does not shift its label.

Web primitives: `.field`, `.label`, `.hint` in
`web/components/governed-actions.module.css` and
`web/components/console-table.module.css`. Width modifiers `.fieldNarrow` and
`.fieldMedium` exist so pages stop reaching for inline `style={{ flex }}`.

## Sections and panels

- Panel padding is `--space-panel`.
- A section heading is `.sectionTitle`, **not** `.label`. `.label` is 12px
  uppercase and means "this names a form control". A heading set in it reads as
  a field label, which is how the Staff form came to look cramped against its
  own explanatory line.
- Heading or explanation to content: `--space-section-gap`.

## Buttons and action groups

- Actions never sit against the content above them. `.actions` and
  `.formActions` carry `margin-top: var(--space-action-gap)`.
- Adjacent actions are `--space-action-between` apart.
- Minimum target is 44px high on web and mobile alike.
- **Do not add a global button margin.** Compact actions inside table rows must
  stay compact; that is why separation lives on the *group*, not the button.

## Responsive

Multi-column form rows are flex with `gap: var(--space-field-gap)`, so when they
wrap to one column the vertical gap is the same value that separated them
horizontally. Nothing doubles and nothing disappears at a breakpoint.

## Direction

Use logical properties: `margin-inline-start`, `padding-inline-end`,
`inset-inline-start`. Never `left`/`right` for spacing that should mirror.
Arabic is a first-class language, not a flipped afterthought.

## Accessibility

Spacing is never created with empty spacer elements. Use margin, gap or padding
on the real element, so screen-reader output and tab order stay meaningful.

## When adding new UI

1. Use a semantic token if a relationship in the table above fits.
2. Otherwise use the raw scale.
3. Only introduce a new value if you can say what relationship it names — and
   then add it here, so the next person inherits it instead of guessing.
