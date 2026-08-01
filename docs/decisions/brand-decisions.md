# Warsha Brand Decisions

## Decision record

- Date: 2026-08-01
- Status: implemented locally; manual visual acceptance pending
- Authority: Warsha Constitution and `docs/brand/Warsha marketplace logo design.pdf`
- Scope: visual identity and presentation only

## 1. The Current is the sole active mark

Decision: adopt The Current, a rounded protective frame containing one concealed W-shaped flow trace, as the only active primary Warsha mark.

Reason: it communicates protection, flow, verified progress, and work completion without relying on a particular trade or a construction cliché. It remains legible at app-icon and 16 px UI sizes.

Consequence: all active product, Expo, native, and web references use the new Current asset/component family. Previous W-and-dot PNGs remain inactive history only.

## 2. Geometry is reconstructed, not captured

Decision: reconstruct the mark as vector/coordinate geometry in SVG, React Native SVG, and the deterministic raster generator.

Reason: screenshots from the PDF would be soft, hard to recolor, and unsuitable for adaptive/monochrome assets.

## 3. The locked dark palette governs all screens

Decision: set the shared theme to `#080808`, `#141414`, `#FAFAFA`, `#B8B8B8`, `#6E6E6E`, and `#2FBF71`, with optional attention `#E8A13A`.

Reason: shared tokens update every screen without duplicating styling or changing workflows. Tinted success/error/attention fills preserve calm hierarchy.

## 4. Inter and Cairo are first-class brand fonts

Decision: load Inter for English and Cairo for Arabic through Expo Font at the root.

Reason: the supplied identity system explicitly specifies both families. Root loading prevents screen-by-screen font drift, and `AppText` selects weight/language consistently.

Consequence: font changes require an Expo restart and may require a Metro cache clear. The font packages are JavaScript assets; they do not independently require a native development rebuild.

## 5. Brand motion communicates state

Decision: replace active spinner loading with the Current frame and travelling flow trace. Honor the platform reduced-motion preference with a static mark.

Reason: the supplied system says motion should communicate work/state, never decorate or rotate for effect.

## 6. Shared primitives, preserved workflows

Decision: provide shared brand buttons, cards, fields, badges, loading states, and empty states, while keeping existing screen order, actions, data calls, and routes unchanged.

Reason: visual consistency belongs in shared primitives and tokens. Business rules remain governed by the Constitution and WPS documents.

## 7. Native and web assets use one deterministic source

Decision: generate icon, adaptive, monochrome, notification, splash, favicon, and web-manifest assets with `scripts/render-brand-assets.ps1`.

Reason: deterministic generation prevents asset drift and makes geometry auditable.

The SDK 54 `notification` config field is used only to point Android at the new grayscale icon. This does not enable push delivery; notifications remain governed by the existing repository behavior and provider configuration.

## 8. Native cache behavior is documented, not hidden

Decision: require a native rebuild for icon/splash changes and uninstall/reinstall when an already-installed app retains cached launcher assets.

Reason: Metro and OTA JavaScript refreshes cannot replace native launcher/splash resources. Store/TestFlight inspection requires a new EAS build.

## 9. One approved motto, separate from the mission statement

Decision: the only active motto is `YOUR WORK, OUR MISSION` in English and `شغلك مهمتنا` in Arabic. The Constitution may retain "Warsha finishes your work safely, for the fairest price" as mission language, but active UI, splash, web metadata, notification templates, generators, and current tests must not use it as a motto.

Reason: one exact localized phrase prevents the splash, web shell, and product copy from drifting between historical taglines. The native splash uses English because it appears before the app knows the selected language; in-app surfaces use the shared localized value.

## Explicit non-decisions

This change does not:

- redesign any product workflow;
- alter WPS-007 money, ledger, payment, payout, or price-approval behavior;
- alter WPS-008 eligibility, ranking, invitation, quote, rescue, or marketplace behavior;
- alter authentication, OTP, RLS, account isolation, storage, realtime, or migrations;
- apply hosted migrations;
- enable live SMS, payments, payouts, webhooks, schedulers, or push delivery;
- claim manual visual acceptance.
