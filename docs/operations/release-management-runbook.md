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
- `runtimeVersion` follows the app version: a native change forces a new binary
  rather than silently mismatching.
- Preview over-the-air updates are enabled only on the `preview` channel. A
  JS/TS/style/compatible-asset change may use that channel after the explicit
  OTA compatibility review in `qa-preview-runbook.md`.
- A native dependency, config plugin, permission, manifest/plist value, SDK,
  icon, splash, or other native/config change requires an app-version bump and
  a new Preview binary. Never publish it as an OTA update.
- Production remains on the separate `production` channel. This runbook does
  not authorize publishing a Preview update to Production.

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
