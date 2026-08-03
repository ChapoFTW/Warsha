# Dependency Update Runbook

Authority: Warsha Constitution → WPS-018.

## Current position

`npm audit` reports **16 advisories: 2 high, 14 moderate**, across four
transitive packages:

| Package | Reached through |
| --- | --- |
| `brace-expansion` | Expo and React Native tooling |
| `postcss` | The web build chain |
| `tar` | Package installation tooling |
| `uuid` | Expo tooling |

**No direct dependency is affected.** Every one arrives through the Expo and
React Native toolchain, and all four are build-time rather than runtime paths in
the shipped app.

`npm audit fix --force` would move Expo, React Native, or their tooling to a
major version the project has not validated, breaking the SDK 54 alignment that
Expo Doctor currently reports as 18/18 healthy. **It was deliberately not run.**

This is recorded as gap G31 and it blocks production.

## The rule

**Never apply an unsafe automatic fix.** `npm audit fix --force` is not an
option in this repository. Every dependency change is deliberate, validated, and
reviewed.

## Advisory triage

For each advisory, answer three questions before doing anything:

1. **Is the vulnerable code path reachable from the shipped app?** A
   build-tooling advisory is not the same risk as one in a runtime dependency.
2. **Is it a direct dependency or transitive?** A direct one we control. A
   transitive one moves when its parent moves.
3. **Is there a fix that does not break the SDK alignment?**

| Answer | Action |
| --- | --- |
| Runtime, direct, fix available | Update now |
| Runtime, transitive, parent update available | Update the parent |
| Build-time, transitive, only a breaking fix exists | Record and accept, in writing, with a review date |
| No fix exists | Record, accept in writing, monitor |

An accepted advisory is a written decision with an owner and a review date, not
silence.

## Expo SDK alignment

Warsha runs Expo SDK 54. That alignment is the constraint that governs almost
every dependency decision.

- Expo pins compatible versions for its own packages and for React Native.
- `npx expo install` respects those pins. `npm install <pkg>@latest` does not.
- **Always use `npx expo install` for anything Expo manages.**
- `npx expo-doctor` is the check that the alignment still holds. It must stay
  18/18.
- An SDK upgrade is a project of its own, not a dependency update.

## Routine update

Monthly, or when an advisory demands it:

1. Branch.
2. `npm outdated` and `npm audit` — read both, decide, do not batch blindly.
3. Update one logical group at a time, in its own commit.
4. Use `npx expo install` for Expo-managed packages.
5. `npm ci` from a clean `node_modules` to confirm the lockfile is honest.
6. Full validation:
   - `npm run typecheck`, `lint`, `check:mojibake`, `git diff --check`
   - every regression suite
   - `supabase db reset` and `supabase test db`
   - `npx expo-doctor` — must be 18/18
   - cache-cleared Android, iOS, and web exports
   - `npm run audit:secrets`, `audit:migrations`, `audit:environment`
7. Install the build on a real device and smoke test. A dependency change that
   passes every static gate can still break a native module.
8. Open a pull request with the advisory references and what you verified.

## Lockfile

`package-lock.json` is committed and authoritative.

- CI uses `npm ci`, which installs exactly the lockfile and fails if it and
  `package.json` disagree.
- Never commit a lockfile produced by a different Node or npm major version
  without saying so.
- Never hand-edit it.
- A pull request changing the lockfile without changing `package.json` needs an
  explanation.

## Adding a dependency

The bar is high. Every dependency is a supply-chain risk, a bundle-size cost,
and a future upgrade obligation.

- Can the standard library or an existing dependency do it?
- Is it maintained, and is its own dependency tree small?
- Does it work with the New Architecture and Hermes?
- Does it need native code? That changes the build story.
- Does it phone home? Warsha ships no analytics and no advertising SDK, and that
  is a deliberate property to protect.

Adding one requires a reviewer who is not the author.

## Emergency

For a high or critical advisory in a runtime path:

1. Assess reachability honestly. Most are not reachable from the shipped app.
2. If reachable, patch on a branch, validate fully, and ship as a patch release.
3. If the only fix breaks the SDK alignment, weigh the actual exposure against a
   broken build. Record the decision and its owner either way.
4. Open a security incident if the advisory is exploitable in production.

## Review cadence

| | When | Owner |
| --- | --- | --- |
| `npm audit` | Weekly, and in CI on every pull request | Operations Manager |
| Routine updates | Monthly | Operations Manager |
| Expo SDK | Per Expo release, as a planned project | Owner |
| Accepted advisories | Every 90 days | Security Administrator |
