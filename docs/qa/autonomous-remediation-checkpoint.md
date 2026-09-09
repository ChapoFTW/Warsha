# Autonomous remediation checkpoint

Written so the next session resumes without asking the owner to reconstruct
anything.

**Updated:** 2026-09-09 · **HEAD = origin/main = `a4d1dde`** · working tree clean

---

## State

| | |
| --- | --- |
| Repository | `D:\Warsha`, branch `main` |
| HEAD / origin | `a4d1dde` — pushed, verified equal |
| Local validation | typecheck 0, `test:all` exit 0, lint 0 errors (4 pre-existing warnings) |
| CI | `f62948a` fully green (Validate 4/4, **API 24 ✓, API 25 ✓**); `990f886` Validate green, Android was still running; `a4d1dde` not yet checked |
| Emulator | `emulator-5554`, 320×640 @160dpi (320dp), API 35 |
| Installed APK | built 2026-09-09 19:28Z; carries the RTL baseline, role marks and bidi isolates. **Points at warsha-DEVELOPMENT**, because `.env` holds the development URL and key — see the backend-target note below |
| Docker | running; **must be stopped** — the owner wants it installed, auto-start disabled, stack down when unused |

**First action next session:** confirm CI on `a4d1dde` (Validate + Android API
24/25). If red, read the real logs and fix before anything else.

---

## Completed and evidenced

**Production database deployment** — `202609090001` and `202609090002` applied.
Verified: `staff_set_push_configuration` returned 404 before and **403 MFA
required** after, which proves the authority landed *and* the gate chain runs.
Configuration untouched: provider `disabled`, 0 devices, delivery and
registration off. Deployment installed authority only.

**RTL layout architecture — PROVEN.** Warsha had two mirroring layers of its
own. Root Yoga `direction` derived from language, plus 65 explicit
`row-reverse` rows, cancelled to no mirroring at all. Root pinned to constant
`ltr`; the explicit layer is now the only authority. Measured before/after,
first launch, cold relaunch, device EN and AR. `I18nManager.isRTL` stays `true`
throughout and no longer matters.

**RTL layout — RENDERED CORRECT** on the gateway, Arabic, 320dp: trust icons on
the reading edge beside their labels; links mirrored (Help 181–239, Privacy
81–143); English byte-identical to before (Help 59–90, Privacy 128–179).

**Other landed work:** currency authority (country → ISO 4217, never language);
role marks (house / person); Arabic help-content parity plus a guard; backup
exception mechanism covering whole deployment sets; guarded Production approval
helper; build helper that cannot report a success it did not have.

---

## Open — highest priority first

### 1. RTL visual certification — architecture PROVEN, sweep PARTIAL

Seven Arabic surfaces at 320dp now pass with numbers: gateway, role chooser,
signup fields, consent rows, navigation header (back on the right, arrow points
right), legal document, sign-in. Zero overflow and no sub-44dp tap target on any
of them. Also passing: AR dark, AR 1.3x text, AR at 411dp, FR, and EN
byte-identical to before the fix.

Navigation RTL is no longer merely wired — it is rendered and verified.

Still needed before the programme row closes:

- viewports 320dp and ~411dp
- device/app: EN/EN, EN/AR, **AR/AR**, AR/EN, AR/FR
- light and dark, default and enlarged text
- components: role cards, auth fields, consents, settings, lists, provider
  profile, booking creation, chat, job status, tabs, headers/back, modal/sheet
- bidi: Arabic + phone, + EGP, + dates, + Latin names, + address

Two specific items carried forward:

- **Authenticated surfaces are unreached**: settings, lists, chat, job cards,
  tabs, provider profile, booking creation. Every surface verified so far is
  signed-out, because the QA professional account's onboarding is incomplete and
  the app routes there.
- **Transitions, tabs and accessibility traversal order** remain unverified.
  Bounds prove visual order, not announcement order.
- **Chat preview close** was moved to trailing *without rendered evidence* —
  reaching it needs an authenticated conversation carrying an image.

### 2. Portals and separate native surfaces — unmeasured

The neutral baseline only helps descendants that inherit it. React Native
`Modal`, sheets, dialogs, navigation overlays and map overlays may mount their
own root and resolve RTL independently, reproducing the double-authority bug.
**Measure before adding anything**, and if a baseline is needed apply it at the
shared surface boundary, not in screens.

### 3. Currency visual gate — formatters proven, layout not

`formatMoney` is unit-proven and web/native agree character-for-character. No
money screen has been rendered at 320dp, in AR/FR, dark, or enlarged text.
Long currency strings could clip cards or buttons.

### 4. Certification Layer 2 — mostly UNTESTED

28 lifecycle transitions, 11 update messages, 11 cross-cutting capabilities.
Visual column is UNTESTED for everything except two gateway rows.

### 5. Not started

Customer journey audit; professional journey past onboarding step 2 (photo
fixture exists, journey not driven); live arrival tracking (designed, decisions
recorded, nothing built); 404 parity for app./admin./native.

---

## Owner decisions

`docs/product/owner-decision-backlog.md` — **OD-001** Supabase Pro (deferred by
owner; G22 stays open), **OD-002** Production staff identity for push
activation, **OD-003** role mark (resolved).

Push Phase A/B is blocked only by OD-002. Everything else continues.

---

## Temporary infrastructure

**None outstanding.** The on-device RTL probe was removed — component deleted,
`welcome` unwired, no QA route left in the auth policy — and
`rtl-layout-baseline.test.mts` asserts all three.

`scripts/android-release-build.mjs` and
`scripts/approve-production-deployment.mjs` are **permanent** tooling, not
diagnostics.

---

## How to resume

```bash
# CI (authenticated; unauthenticated is 60/hour and this session exhausted it)
node scratchpad/ci.mjs <sha>

# Build — never pipe gradle; the helper requires exit 0 AND "BUILD SUCCESSFUL"
# AND an APK newer than a marker taken before the build
set -a; . ./.env; set +a
node scripts/android-release-build.mjs

# Emulator: adb device paths need MSYS_NO_PATHCONV=1 under Git Bash,
# or /sdcard/x.xml silently becomes /Files/Git/sdcard/x.xml and dumps empty.
export MSYS_NO_PATHCONV=1
adb shell cmd locale set-app-locales com.warsha.app --locales ar-EG
```

Arabic is reached **only** by per-app locale. `system_locales` alone does not
work, and clearing app data does not either — Warsha keeps its own preference
and defaults to English. Setting the *device* locale to Arabic destabilises this
emulator (Pixel Launcher and Digital Wellbeing ANRs, package-service broken pipe
mid-install); a reboot clears it, and device-EN/app-AR is both stable and the
more decisive configuration.

---

## The backend a local build points at

`.env` holds `EXPO_PUBLIC_SUPABASE_URL=https://lrhipbcapzfxuwixfoog.supabase.co`
— that is **warsha-development**. Production is `ekgwzljpcxpxnklzxuvj`.

So every APK built with plain `.env` is a development build. That is correct for
ordinary work and it cost an hour here, because signing in with the Production
QA credentials produced "Invalid sign-in details or password." and looked
exactly like a product defect: the same credential succeeded against the
Production auth boundary from the host, and the emulator had network.

It was not a defect. The account exists in Production and not in development.

Comparing the key FINGERPRINT in `.env` against the one extracted from
`warsha-prod.apk` is what settled it, and is the check to run first whenever an
authenticated journey fails on a locally-built APK:

```bash
node -e "…resolvePublicKey({apkPath:'D:/Warsha-Temp/apk-audit/warsha-prod.apk'})"
# compare url and fingerprint against .env
```

To exercise authenticated Production journeys, build with the Production values
layered over `.env`:

```bash
set -a; . ./.env; . D:/Warsha-Temp/prod-env.txt; set +a
export EXPO_PUBLIC_DATA_MODE=supabase
node scripts/android-release-build.mjs
```

**None of the RTL, bidi, role-mark or currency evidence depends on this.** Those
are layout and text concerns and render identically against either backend. Only
authenticated journeys are affected.

## Known flake

`test:recovery-state` failed once inside a `test:all` run and has passed **52
consecutive times** since, standalone and in CI. Not reproduced, so not fixed —
guessing at a fix for a failure I cannot trigger would be worse than recording
it.

What is known: it uses `Date.now()`, and the seal it exercises uses AES-GCM with
a random IV. The time-based assertions pass explicit timestamps, so the obvious
wall-clock explanation does not hold. If it recurs, capture the full assertion
output before anything else — the message was truncated to `deepStrictEqual`
when it happened, which is why it could not be diagnosed after the fact.

Validate has been green on every commit since, including the run that executes
the whole suite.

## Lessons that cost time here

**Three wrong RTL diagnoses came from inference.** A gap between an icon and its
label was read as a double mirror, then blamed on `I18nManager`, then on the
root style — each plausible, each wrong. Only on-device measurement of the
flattened style and the resolved child order settled it. **Measure before
concluding**; one screenshot cannot separate three candidate causes.

**A pipe hid a failed build for thirty minutes.** `gradlew … | tail` reports the
exit code of `tail`. Fixed permanently in the build helper.

**Prose matched code four times.** Tests searching for a construct matched the
comment explaining it. Comment-stripping is now standard for code-shape
assertions.

**Two assertions encoded beliefs that caused bugs** — `allowRTL(true)` and the
root direction style. Both were re-encoded to assert the architecture, not
deleted to go green.
