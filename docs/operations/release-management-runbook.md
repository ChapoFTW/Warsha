# Release Management Runbook

Authority: Warsha Constitution → WPS-018.

## Source control, and why it is not publication

**Warsha has one canonical branch: `main`.** There is no development branch, no
pre-beta branch, and deliberately **no Production branch**.

```
NORMAL WORK      work -> validate -> commit -> push origin/main -> GitHub CI
GOING LIVE       an explicitly approved, CI-green SHA from main is deployed
                 and promoted as a separate authorized action
```

**A PUSH TO `main` IS NOT A PRODUCTION RELEASE.**

For most of Warsha's life it was. Vercel's Production Branch was `main`, so
`git push origin main` put whatever had just been committed in front of every
customer. That leaves no gap between "I saved my work" and "the world sees it",
and the only way to keep unfinished work off the live site was not to push it —
which is how fifty-one finished commits ended up living on one laptop with no
backup.

`web/vercel.json` closes the gap:

```json
{ "git": { "deploymentEnabled": false } }
```

With that setting Vercel creates **no deployment of any kind** from a Git push —
not Production, not Preview. Pushing is source control again. Publishing is a
deliberate, separately authorized act.

The boolean form is deliberate rather than the per-branch object form: an object
leaves every unlisted branch deploying, and a release boundary should be closed
by default. `scripts/release-boundary.test.mts` fails if the setting is removed,
weakened, or the file moved out of the `web/` root directory Vercel reads.

### Releasing to Production

Because nothing deploys automatically, a release is an explicit operation:

1. Choose an exact SHA on `main` and confirm its CI run is green.
2. Confirm the release QA gates for the surfaces involved.
3. Deploy that SHA to a Production-target Vercel deployment **without moving any
   domain**.
4. Verify against the deployment URL: the Git SHA, the environment, the backend
   it is talking to, health and readiness, smoke tests, and a credential scan.
5. Only with explicit publication authorization, promote/alias it live.
6. Verify the live domains after promotion.

Steps 1-4 are safe to perform at any time. Step 5 is the only irreversible one
and always needs a human decision.

### Validation and publication are separate phases

**Run the checks. Read the result. Then publish.** Never in one command.

```
make changes -> run checks -> CONFIRM THE RESULT -> commit -> push
             -> CI -> staged deployment -> verify the artifact -> promote
```

On 2026-09-11 work left the machine twice while a check was red, both times
because the checks and the publication were chained in a single shell command
and the output arrived after the push. A gate read too late is a gate that did
not run, and the green run that follows it is a result about the wrong tree.

`npm run hooks:install` points git at `.githooks`, whose `pre-push` runs
`typecheck`, `lint` and `test:help-docs` — fourteen seconds, and precisely the
three that escaped. The type error was invisible to the regression suite because
`--experimental-strip-types` removes types without checking them, and the
documentation gate's authority ends at the push.

`test:all` is deliberately NOT in the hook. Ten minutes of pre-push cost gets
bypassed, and a bypassed hook is worse than none because it looks like
protection. CI runs the full suite over the pushed range.

The scripted release paths were audited at the same time and are sound:
`qa-release.mjs` runs `validate()` through a `run()` that exits on any non-zero
status, so the build genuinely cannot start after a failed check. The gap was
never the scripts. It was the unscripted path, where a person is the only thing
between a red check and `origin/main`.

A local hook protects a machine, not the repository — it is bypassable with
`--no-verify`, which AGENTS.md already forbids. CI is the control; this is the
thing that makes the control arrive before the mistake.

### The staged artifact must prove which commit it contains

**Invariant, from the stale-preview incident of 2026-09-11.** Before promoting,
the staged deployment must be shown to contain the exact commit being released.

```
npm run deploy:web                                             # refuses a dirty tree, stamps the build
npm run test:release-artifact -- --url <deployment>            # before promoting: commit AND clean tree
npm run test:release-artifact -- --url https://usewarsha.com --promoted   # after: the commit
```

`test:release-artifact` asks the running deployment what it contains, over the
network, and compares it to the SHA being released. It refuses on a mismatch, on
a missing commit, on an unreachable endpoint, and on a build whose source state
is not `clean`.

The following are **not** evidence that a deployment is current, and none of
them is read by the gate:

- **its creation time** — a build takes minutes and a commit takes seconds,
  so "recent" and "current" are different properties
- **`readyState: READY`** — that says the build finished, not what it built
- **the existence of a preview URL** — one from ten minutes ago looks exactly
  like one from ten seconds ago
- **a green browser gate against it** — the gate proves the artifact behaves,
  not that it is the artifact you mean

What happened: a preview was deployed, returned a URL, reported READY, and
passed a 510-check browser gate. Two commits then landed. Every signal said the
release was verified, and promoting at that point would have published an
artifact predating both. It was caught by comparing against `git log` by hand —
which is a person remembering, not a control.

Each claim is checked where it can be checked. The stamp is an `--env`
override on one deployment, and promotion creates a new deployment record that
resolves its environment from the project, so the stamp does not survive
promotion — Production reports the right commit and a null source. The clean
tree is therefore required on the staged artifact, which is the moment it
decides anything, and `--promoted` verifies the commit on the live domain
afterwards. Setting the stamp as a project-level Production variable would make
it read `clean` forever regardless of what it was built from, which is a worse
answer than no answer.

A clean tree is part of the claim, not a separate courtesy.
`VERCEL_GIT_COMMIT_SHA` is the SHA of `HEAD` whether or not the uploaded files
match it, so a deploy from a dirty tree produces an artifact that truthfully
names a commit it does not contain. `deploy:web` refuses that, and stamps
`WARSHA_SOURCE_STATE` into the build so the claim can be checked later over the
network rather than trusted from whoever ran the deploy.

## Branches

| Branch | Purpose | Protection |
| --- | --- | --- |
| `main` | The canonical branch: development, integration and release source | Required: pull request, review, all CI checks, no force push |
| `v*` | Historical release lines | Same, plus a named release owner |
| feature branches | Work in progress | None |

**No deployment ever runs from an unreviewed branch.** The database deployment
workflow refuses any ref that is not `main` or `v*`, which is a second line of
defence behind branch protection rather than a replacement for it.

Required branch protection settings, to be configured on the remote:

- Require a pull request before merging, with at least one approving review
- Require every `validate.yml` job to pass
- Require branches to be up to date before merging
- Dismiss stale approvals on new commits
- Forbid force pushes and deletion
- Apply the rules to administrators too

## What CI runs

`validate.yml`, on every pull request and every push to a protected branch, in
four parallel jobs:

1. **Static** — install, typecheck, lint, mojibake, whitespace, secret scan,
   migration audit, environment audit, forbidden files
2. **Regressions** — the explicit deterministic inventory in
   `scripts/warsha-automation/policy.mjs`, including automation guard tests
3. **Database** — clean Supabase start applying the whole forward chain, then
   every pgTAP suite
4. **Build** — Expo Doctor, three cache-cleared exports, and a credential-shape
   scan of the exported bundles

Read-only permissions, concurrency cancellation, lockfile-exact `npm ci`, and
**no secret referenced anywhere in the workflow.**

## Versioning

- `expo.version` is the marketing version and is set deliberately, never
  automatically.
- Build numbers come from EAS (`appVersionSource: remote`), so two machines can
  never mint the same one.
- `runtimeVersion` uses the **fingerprint** policy: a hash, via
  `@expo/fingerprint`, of everything that affects the native project. It changes
  when the native layer changes and holds still for JS-only work, which is what
  makes a JS-only OTA safe and a native-incompatible one impossible.

  It used to be the `appVersion` policy, described here as "a native change
  forces a new binary rather than silently mismatching". It did not do that.
  `appVersion` follows the DECLARED version, and `expo.version` has been 1.0.0
  since the first build — so every binary ever produced shared one runtime
  version, and an update published against 1.0.0 was considered compatible with
  all of them. The policy's documented caveat is precisely this failure: forget
  to bump the version when the native runtime changes and you get a mismatch.
  Nothing bumped it, so nothing was ever protected.

  What the fingerprint hashes is wider than "native code". Generated on
  2026-09-16 it had 176 sources: config plugins and their dependencies (121),
  Expo and React Native autolinking (47), the evaluated app config, the app icon
  images, `google-services.json`, `eas.json` (reason `easBuild`), `.gitignore`,
  and the repository's own `plugins/warsha-android-*.js`. So an edit to
  `eas.json` — an env var, a build profile — changes the runtime version exactly
  as a native dependency would, and every binary built before it stops accepting
  new updates. Treat those files as native configuration when deciding whether a
  change can ship as an update.

  `fingerprint.config.js` skips two parts of the app config, and both were found
  the hard way. The build stamp puts `builtAt` into `extra`, so without skipping
  `extra` two fingerprints generated seconds apart differed (`49237f0d…`,
  `19cfbaac…`) — every build its own runtime version and no update ever
  applicable. Versions are skipped because an `autoIncrement` build number is
  identity, not compatibility. With both skipped, three consecutive runs gave
  one hash, and adding a single Android permission still moved it.
  `test:qa-preview` fails if either skip is removed.

  Consequence worth knowing: binaries already installed under runtime version
  `1.0.0` will not receive updates published under a fingerprint runtime. That
  is correct — they are a different native runtime — and they need a new binary,
  not an update.
- Preview over-the-air updates are enabled only on the `preview` channel. A
  JS/TS/style/compatible-asset change may use that channel after the explicit
  OTA compatibility review in `qa-preview-runbook.md`.
- A native dependency, config plugin, permission, manifest/plist value, SDK,
  icon, splash, or other native/config change requires an app-version bump and
  a new Preview binary. Never publish it as an OTA update.
- Production remains on the separate `production` channel. This runbook does
  not authorize publishing a Preview update to Production.

### Telling one build from another

Six things identify a build, and each answers a different question:

| | what it answers | where it comes from |
| --- | --- | --- |
| `expo.version` | which release a person is on | set deliberately, never automatically |
| Android `versionCode` | which binary is newer | EAS remote versions, `autoIncrement` |
| iOS `buildNumber` | the same, on iOS | EAS remote versions, `autoIncrement` |
| `runtimeVersion` | which updates may apply to it | the fingerprint policy |
| commit SHA | which source it was built from | `app.config.js`, `extra.build.commit` |
| dirty marker | whether that source was the whole story | `extra.build.dirty` |

`autoIncrement` is on for **preview** and **production**, because both are
installed on real devices and both need to be distinguishable from their
predecessor. It is deliberately off for `development`.

A locally built gradle APK bypasses EAS entirely and therefore always carries
`versionCode=1`. That is fine for a QA artifact and it is exactly why the commit
stamp exists: for local builds, the SHA is the only thing that identifies them.

Settings shows `1.0.0 · 94351f2`, with a trailing `+` when the tree was dirty.
`builtAt` is carried in `extra.build` for support and QA but is deliberately not
drawn, because a timestamp is noise to the person reading a settings screen.

### A local build carries whatever the last prebuild baked in

`android/` and `ios/` are generated (continuous native generation — neither is
tracked). The runtime version is written into the native project **at prebuild**,
not at gradle time:

| policy | what prebuild writes into `expo_runtime_version` | where the real value comes from |
| --- | --- | --- |
| `appVersion` | the version string, e.g. `1.0.0` | that string |
| `fingerprint` | the sentinel `file:fingerprint` | a `fingerprint` asset hashed at build time |

On 2026-09-16 a release APK built after switching to `fingerprint` still resolved
its runtime version to `1.0.0`. The config inside the APK said
`{"policy":"fingerprint"}`; the value expo-updates actually compares did not. Two
stale layers produced that, and neither is visible from `app.json`:

1. `android/` had last been prebuilt on 2026-09-10, under `appVersion`, so
   `strings.xml` still held `1.0.0`.
2. gradle judged `createReleaseUpdatesResources` up to date and skipped it, so no
   `fingerprint` asset was written at all.

EAS builds prebuild from scratch on the worker, so an EAS artifact does not have
this problem. **Any local build after a change to the runtime policy, a config
plugin, or any other native configuration must re-run
`npx expo prebuild --platform android` first** — and if the updates resources
output predates the change, delete
`android/app/build/generated/assets/createReleaseUpdatesResources` so it is
regenerated. Then prove the result from the artifact, never from the config:

```
aapt2 dump resources app-release.apk | grep -A1 expo_runtime_version   # file:fingerprint
unzip -p app-release.apk assets/fingerprint                            # the hash
```

### What a binary does at launch, and what an update can and cannot fix

Only `updates.url` is configured and nothing in the app calls the updates API,
so behaviour is the SDK 54 default: `checkAutomatically: ALWAYS`,
`fallbackToCacheTimeout: 0`. The app launches immediately on the newest
*compatible* bundle it already holds — embedded, or previously downloaded —
checks the channel in the background, and applies anything it downloads on the
**next cold start**, not this one.

| situation | what happens |
| --- | --- |
| current binary, no update published | runs what it has; the check reports `NO_UPDATE_AVAILABLE_ON_SERVER` |
| current binary, compatible update published | downloads in the background; the person sees the old JS for one more session, the new JS on the next cold start |
| update published for a different runtime | refused by the selection policy (`UPDATE_REJECTED_BY_SELECTION_POLICY`); the binary keeps its own bundle |
| binary installed before a native dependency or config change | its fingerprint differs from the new one, so the new updates are refused. It keeps running its old JS. **An update cannot repair it; only a new binary can.** |
| a downloaded update crashes on launch | anti-bricking falls back to the embedded bundle (`isEmergencyLaunch`) |
| the switch from `appVersion` to `fingerprint` itself | every install that exists today reports runtime `1.0.0` and will refuse all future updates. Each one needs a new binary, once |

Under the old `appVersion` policy the fourth row was the dangerous one: JS
written for a new native layer would have been delivered to an old one, and the
best case was an emergency launch. Fingerprint closes that completely.

**What it does not close.** A stranded binary is now safe from incompatible
updates, and it is still running old JS against a backend that keeps moving.
Warsha's RPCs are redefined across migrations — `save_provider_foundation` alone
has five definitions — so an old binary calling an old signature gets a generic
error and no explanation. Nothing on the client or the server compares the
binary to a minimum, and nothing tells a person their app is too old. The phone
that surfaced the header island was exactly this: a real, stranded binary.

That needs a minimum-supported-version gate, and it is recorded here as open
rather than built in the same change, because it is a feature across three
layers, not a setting:

- the minimum has to live somewhere the server owns and a migration can raise,
  compared against the binary's fingerprint runtime or its build number;
- the client needs a screen that says what is wrong and where the new binary is
  — and Warsha does not yet have a store listing for that to point to;
- it must never trap anyone. If the check itself fails, the app proceeds. Even
  when a binary is too old, privacy, account deletion, legal documents and
  support stay reachable, because a person must always be able to leave and to
  ask for help.

On 2026-09-11 a header removed from the chrome three days earlier was
photographed on a real phone. Deciding whether that was a regression or a stale
binary took a trace through git history, four versions of a component and the
contents of an APK bundle. The web has answered this since it shipped —
`/api/health` returns `commit` — and native answered it nowhere. That is the
whole reason this section exists.

## Release types

| Type | Contains | Gate |
| --- | --- | --- |
| Patch | A fix, no schema, no client contract change | CI green, one reviewer |
| Minor | New behaviour, additive schema | CI green, two reviewers, manual subset for the touched domain |
| Major | Contract change, phase change, or provider activation | Full Go/No-Go |

## Cutting a release

1. Confirm `main` is green on the exact commit.
2. Confirm the migration chain is what you expect: `supabase migration list`.
3. Confirm no unreviewed migration modification: `npm run audit:migrations`
      warns when an already-committed migration changed in the working tree.
4. Write the release note: what changed, what it touches, what to watch, how to
   roll it back. If the rollback line is hard to write, the release is too big.
5. Tag the commit.
6. Follow `deployment-runbook.md`, in order, one layer at a time.

## Sequencing across layers

```
schema ──► edge functions ──► web ──► mobile ──► providers ──► configuration
```

Schema first because everything else depends on it. Configuration last because
it is what lets demand in. Never two layers in one window: an incident with two
candidate causes has no clean rollback.

## Release notes

For every release, recorded before it ships:

- What changed, in plain language
- Which specifications it touches
- Which migrations it applies
- What could break and how it would show
- The exact rollback step
- Who is watching, and for how long

## Freeze

No release when: nobody is available for the next two hours; a sev1 or sev2 is
open; a launch phase changed in the last 48 hours; or the person who wrote the
change is unreachable.

## After

- [ ] `verify_platform_release()` run and the failure set matches expectation
- [ ] The ledgers agree
- [ ] A real user path exercised personally
- [ ] The release recorded with what was verified, not just what was deployed
- [ ] 48-hour review scheduled

## Status

**CI has never executed.** The workflows are committed and the same gates pass
locally on every commit, but no run exists on a remote. Confirming the first
green CI run is a private beta prerequisite.

For source-state recovery, impact-based QA planning, evidence artifacts, and
guarded Preview release orchestration, use
`docs/operations/engineering-automation-runbook.md`.
