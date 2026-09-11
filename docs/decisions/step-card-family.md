# Is the step-card family one primitive, or several cards sharing tokens?

Asked before spending shared Design usage on it. The answer decides whether
there is a system to review at all.

## The answer

**Neither, cleanly. It is one component that had been typed out twice, sitting
inside a wider family of cards that are genuinely different.**

So there was nothing here for a design system review, and there was something
here for an afternoon's tidying. Those are not the same finding, and telling
them apart is the whole reason for asking first.

## The evidence

Five cards were the same thing. `JourneyCard`, defined locally in
`app/onboarding/worker.tsx`, and four cards in `app/worker/verification.tsx`:

| | `worker.tsx` | `verification.tsx` |
| --- | --- | --- |
| card | `{ gap: spacing.md }` | `{ gap: spacing.md }` |
| title | `{ ...typography.h2, bold, textPrimary }` | `{ ...typography.h2, bold, textPrimary }` |
| body | `{ ...typography.body, textSecondary }` | `{ ...typography.body, textSecondary }` |

Not similar values. The same values, declared separately in two files, under two
names — `sectionTitle` in one, `title` in the other. The structure matched too:
a title, an optional body, then the controls for that step.

The only real difference is the 58px icon tile, which the journey draws and
verification does not. That is a variant of one card, not evidence of two.

## What is genuinely different, and stayed that way

Looking similar is not being the same, so each of these was compared rather than
assumed:

- **The verification status card** draws a 48px mark inline rather than in a
  tile, carries no body, and reports an outcome instead of asking for anything.
  Different job.
- **The worker dashboard** heads its cards at `typography.h1`; **the help index**
  at `bodySmall` semibold. Those are different rungs of one hierarchy. Folding
  them together would be a regression wearing consistency's clothes.
- **`app/onboarding/address.tsx`** names raw sizes — 24, 16, 13 — instead of the
  scale. That is real debt and it is already counted: `audit:typography` holds
  `app` to a budget of 124 hardcoded sizes and ratchets it down. Converting it
  belongs to that ratchet, not to this extraction.

`BrandCard` was already the shared primitive underneath all of them — surface,
elevation, padding — which is exactly the "lower-level visual tokens" half of
the question. It did not need replacing. It needed one composition above it that
two files had each written for themselves.

## What this means for Design

**Do not queue the step-card family for a Design review.** There is no system
here to review: one primitive that was already correct, one duplicate now
extracted into `components/warsha/JourneyStepCard.tsx`, and a set of cards whose
differences are deliberate.

If Design time is spent on this area later, the question worth asking is not
"should these cards be consistent" — they now are — but whether the journey's
icon tile earns its 58px on a 320dp screen. That is a judgement about weight and
hierarchy, which is what the shared specialist is actually good for, and it is
not urgent.
