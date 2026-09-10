# Autonomous remediation checkpoint

Written so the next session resumes without asking the owner to reconstruct
anything.

**Updated:** 2026-09-10 · **HEAD = origin/main = `33dba8e`** · working tree clean

---

## State

| | |
| --- | --- |
| Repository | `D:\Warsha`, branch `main` |
| Local validation | typecheck 0, `test:all` exit 0, lint clean on every touched file |
| Emulator | `emulator-5554`, AVD `warsha_pixel`, API 35. Cold-booted at 1080×2400 @420dpi (**411dp**). The sweep drives 320dp by `wm size 720x1600` + `wm density 360` and resets afterwards |
| Installed APK | Production-targeted, proven by `scripts/android-e2e/backend-target.mjs` |
| QA credential | `D:/Warsha-Temp/qa-worker.json`, **rotated 2026-09-10**, now carries `"environment": "production"` |
| Docker | still installed with auto-start disabled; **stack should be stopped when unused** |

---

## Security work completed this session

**The QA professional's password was rotated** through `auth.updateUser` on the
account's own session — the same call `auth-context.tsx:511` makes. Proven both
ways: the old credential returned HTTP 400 from the endpoint that had accepted
it a minute earlier, and the new one authenticated. The value is not in any
log, commit or transcript.

**The leak path that caused it is closed.** `setText` proves a value landed
where it was aimed and, when it has not, said what the field held instead —
which is the correct diagnostic and is how the password reached a transcript
after landing in the phone field. A screen containing any masked field is now
one where nothing is quoted, whatever the caller passed. `test:device-driver-secrecy`.

**Backend targeting is a hard gate.** `assertBackendTarget` resolves the
project ref out of the JavaScript bundle inside the APK the device is actually
running, located by `pm path` and cached under its on-device content hash. Both
directions refuse, and inability to prove is a refusal. Credentials name their
environment and cannot be loaded without the device agreeing.
`test:backend-target-gate`.

---

## The UX/UI redesign programme

Opened on the owner's assessment that the product feels primitive, anchored on
the profession/trade screens. Full findings and severities in
`docs/ux/mobile-visual-certification.md`.

### Foundations laid

| | |
| --- | --- |
| `OptionRow` | One selection control. Was four hand-rolled rows across trades, jobs, governorates and services, each with its own height and its own idea of "selected". Also ends the composed-name defect structurally: `label` is required and nothing is composed from children |
| Type scale | Restated on the web; `test:web-brand` asserts the two agree step for step and leading for leading |
| `rhythm` | Semantic spacing brought to mobile from the web, which already had it. The parity check asserts the ORDERING, not only the numbers |
| Dialog theme | A config plugin points `alertDialogTheme` at a Warsha overlay, reaching all eighteen `Alert.alert` call sites with no JavaScript change |
| Native colour scheme | `Appearance.setColorScheme` so platform surfaces follow Warsha's own Light/Dark/System choice rather than the phone's |
| `audit-typography` | A ratchet, app and web. Only falls |

### Numbers

| | Start | Now |
| --- | --- | --- |
| Hardcoded font sizes (app) | 369 | 227 |
| Hardcoded font sizes (web) | 150 | 137 |
| Files adopting the type scale | 9 | 28 |

---

## Open — highest priority first

### 1. The trade picker has not been seen

It is the screen the whole programme was anchored on, it is redesigned, and
there is no render of it. The QA account advanced past onboarding step 3, so the
selector is no longer on its path. Reach it from `app/worker/profile.tsx`, which
hosts the same component, once the application completes.

### 2. The professional journey stands at step 4 of 7

Steps 1–3 are done and saved (Plumber, three services, Cairo/Abdin). Step 4
needs the current address; the address search works and returns live Google
Places results. Then identity, criminal record, review.

**GPS is unexercised.** "Use my current location" needs the emulator console,
whose auth token file is sixteen null bytes, so `geo fix` is refused. A cold
boot with a written token would fix it. The address-search path is a
first-class alternative the screen itself offers, and that is what was used.

### 3. Dark theme and 1.3x text are unrendered this programme

Every finding so far was found in light at default text size.

### 4. Live arrival tracking

`src/tracking/route-refresh-policy.ts` exists and is the deviation test the
architecture note says must come before the map. Nothing else: no position
record, no RLS, no `route` operation in `location-proxy`, no foreground
service, no UI.

### 5. Not started

Customer journey end to end; job lifecycle states; settings IA; web visual
inspection beyond the token layer; 404 parity.

---

## Owner decisions

`docs/product/owner-decision-backlog.md` — **OD-001** Supabase Pro (deferred;
G22 stays open), **OD-002** Production staff identity for push activation,
**OD-003** role mark (resolved — the house and person are settled, and a
screenshot that looks busy is not grounds to reopen it).

---

## How to resume

```bash
# Build. The helper runs `expo prebuild` itself when app.json or any config
# plugin changes, and refuses on a gradle failure rather than reporting one.
set -a; . ./.env; . D:/Warsha-Temp/prod-env.txt; set +a
export EXPO_PUBLIC_DATA_MODE=supabase
node scripts/android-release-build.mjs

# Prove what the device is actually running before trusting any screenshot
export MSYS_NO_PATHCONV=1
node scripts/android-e2e/backend-target.mjs production

# Signed-out screens, both languages, both widths
node scripts/android-e2e/flows/design-sweep.mjs --tag <name>
```

`MSYS_NO_PATHCONV=1` is required under Git Bash or `/sdcard/x.xml` silently
becomes `/Files/Git/sdcard/x.xml` and every dump comes back empty.

---

## Lessons that cost time here

**A fixed sleep is not a readiness check.** The first sweep slept seven seconds
and photographed the splash screen four times, reporting all four clean —
because a loading screen has no overflow and no small tap targets. A sweep that
photographs the wrong screen is worse than one that fails, because it produces
evidence.

**A source-shape assertion cannot know a resource exists.** The dialog plugin
named `ThemeOverlay.AppCompat.DayNight.Dialog.Alert`, which AppCompat does not
define. Its test passed. The resource linker is the authority for that, and a
config plugin has to be built before it is believed.

**Prose matched code for the fifth and sixth time.** A comment explaining a
wrong resource name matched the assertion that the name was absent; a comment
citing a dollar figure tripped the currency gate. Comment-stripping is standard
here and both tests now do it.

**The simulation falsified three of my own thresholds.** The route refresh
policy's movement trigger was set at 250m, which fired more often than the
ninety-second ceiling and made a twenty-minute journey cost 25 requests rather
than 16 — the parameter meant to prevent runaway cost was causing it. Written
as prose it would have read fine.

**Measure before reverting, too.** The Arabic sign-in title wraps at 320dp and
looked like fallout from raising page titles to h1. It needs about 311dp on a
272dp screen, and needed more than the width at the old size as well. It wrapped
before. Two minutes of measurement saved undoing a correct change.
