// Pushing code is not publishing a product.
//
// For most of Warsha's life those were the same action: Vercel's Production
// Branch was `main`, so `git push origin main` put whatever had just been
// committed in front of every customer. That is a workflow with no gap between
// "I saved my work" and "the world sees it", and the only way to keep unfinished
// work off the live site was to not push it at all — which meant weeks of
// finished commits living on one laptop with no backup.
//
// `web/vercel.json` closes that gap. `git.deploymentEnabled: false` tells Vercel
// not to create ANY deployment from a Git push — not Production, not Preview.
// Pushing becomes what it should be: source control. Publishing becomes an
// explicit, separately authorized deployment of a named, CI-green SHA.
//
// This file is what stops that boundary being removed by accident. It is easy to
// delete four lines of JSON while cleaning up, and the damage would not be
// visible until the next push silently republished the site.
//
// It deliberately asserts ONLY the release boundary. Every other Vercel setting
// is somebody's legitimate business to change, and a test that pinned the whole
// file would fail on the first honest edit and be deleted for being noisy.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

let checks = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks += 1;
}

// The project's Root Directory is `web`, so this is the path Vercel reads. A
// `vercel.json` at the repository root would be ignored, which is a mistake
// worth failing on rather than discovering after a surprise deployment.
const path = 'web/vercel.json';
check(existsSync(path), `${path} exists — it is the authority for the release boundary`);

const raw = readFileSync(path, 'utf8');
let config: { git?: { deploymentEnabled?: unknown } };
try {
  config = JSON.parse(raw) as typeof config;
} catch (error) {
  throw new Error(`${path} is not valid JSON, so Vercel would ignore it: ${(error as Error).message}`);
}
check(true, `${path} parses as JSON`);

// The load-bearing assertion. `false` and not an object: an object form keyed by
// branch would leave every unlisted branch deploying, which is the opposite of a
// default-closed boundary.
check(config.git?.deploymentEnabled === false,
  'AUTOMATIC VERCEL GIT DEPLOYMENTS ARE DISABLED — A PUSH DOES NOT PUBLISH WARSHA');

check(typeof config.git?.deploymentEnabled === 'boolean',
  'and it is the boolean form, so no branch is silently left enabled');

// Warsha has one branch. A Production branch reappearing in this config would
// mean the release model had quietly changed back.
check(!/productionBranch/i.test(raw),
  'no production branch is named here — main is the only Warsha branch');

// The documentation has to say so too. A control nobody can find is a control
// the next person removes.
const runbook = 'docs/operations/release-management-runbook.md';
check(existsSync(runbook), 'the release runbook exists');
const documented = readFileSync(runbook, 'utf8');
check(/deploymentEnabled/.test(documented),
  'THE RUNBOOK NAMES THE SETTING, SO THE BOUNDARY IS DISCOVERABLE WITHOUT READING JSON');
check(/push(ing)? (to )?`?main`?[^.]*not[^.]*(publish|release)/i.test(documented)
  || /not a Production release/i.test(documented),
  'and states plainly that pushing main is not a release');

console.log(`Release boundary: ${checks} checks passed.`);
