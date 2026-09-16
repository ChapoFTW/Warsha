# An icon means what it looks like it means

## The rule

**Icon semantics must be self-evident in context.**

An icon that is technically the documented correct one, and visually suggests a
different function, is a defect. It is a defect in the icon, not in the person
reading it.

Context and grouping are part of the icon. A correct mark placed beside the
wrong neighbour still communicates the wrong thing.

## What produced this rule

Warsha's preference dock rendered three controls in a row:

```
[ 🌐  EN ] [ Ⓐ ]
```

The third control is **appearance** — light, dark, or follow the device. It was
read as a translation control by the person who owns the product, looking at
their own screen. They read it correctly.

Two mistakes stacked:

1. **The icon encoded state, not function.** The mark was
   `brightness-auto` / `light-mode` / `dark-mode`, chosen by the current
   preference. A fresh install is System, so the glyph shipped by default was
   `brightness-auto` — a brightness disc with a literal **letter A** inside it.
2. **The neighbour supplied the wrong context.** A letterform sitting
   immediately beside a globe and the text "EN" reads as language, typography,
   or translation. Any of those readings is more natural than "appearance".

Neither mistake is visible from the source. `brightness-auto` is the correct
Material name for automatic brightness, and the accessibility label said
"Appearance" the whole time. It needed someone to look at it.

## What follows from it

- **An icon on a control should say what the control does.** Current state
  belongs in a word beside it, or in the accessible name. A control whose icon
  changes with its state cannot be recognised before it is understood.
- **Icon-only is a claim that the icon is unambiguous.** If it is not, add the
  word. Warsha's dock now always shows Light / Dark / System in text, not only
  on a wide screen.
- **Judge the row, not the glyph.** Ask what the mark looks like beside the
  things it actually sits next to.
- **Do not group unrelated utilities so they read as one family.** Language and
  appearance are different settings. Presenting them as one row is only honest
  when the interaction model genuinely presents them together and each remains
  legible on its own.
- **The test is first glance, not informed reading.** "Can I tell what this does
  because I know how it is implemented?" is not the question. "What does this
  look like it does?" is.

## The current marks

| meaning | mark | why |
| --- | --- | --- |
| appearance (the control) | `contrast` | a disc split light and dark: no letterform, no device, nothing that reads as type |
| light (an option) | `light-mode` | a sun, beside the word Light |
| dark (an option) | `dark-mode` | a moon, beside the word Dark |
| follow the device (an option) | `contrast` | the same split disc; "follow this device" resolves to one of the two either way |
| language | `language` | a globe, beside the language's own code or name |

Options inside a menu may carry a mark each, because each sits beside its own
name and a sentence explaining it. A control in a row may not rely on one.
