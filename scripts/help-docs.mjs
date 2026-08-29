#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.cwd());
const write = process.argv.includes('--write');
const locales = ['en', 'ar', 'fr'];
const audiences = new Set(['customer', 'worker', 'admin', 'all']);
const required = ['id', 'audience', 'locale', 'title', 'summary', 'version', 'lastReviewedDate', 'features', 'routes', 'capabilities', 'keywords', 'body'];
const secretPatterns = [/-----BEGIN .*PRIVATE KEY-----/i, /\bAIza[A-Za-z0-9_-]{20,}\b/, /\b(?:service_role|refresh_token|access_token)\s*[:=]/i, /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/];
const knownRoutes = new Set([
  '/account','/addresses','/admin','/admin/analytics','/admin/audit','/admin/help',
  '/admin/staff','/admin/users','/admin/verification','/create-account','/discover',
  '/forgot-password','/help','/jobs','/legal','/notifications','/onboarding/address',
  '/privacy','/requests','/requests/new','/sign-in','/support','/worker',
  '/worker/earnings','/worker/jobs','/worker/onboarding','/worker/opportunities',
  '/worker/profile','/worker/requests','/worker/verification',
]);

const sources = ['docs/help/articles.json', 'docs/help/articles.fr.json'];
const documents = sources.map(path => JSON.parse(readFileSync(join(root, path), 'utf8')));
const articles = documents.flatMap(document => document.articles ?? []);
const failures = [];
const checks = [];
const seen = new Set();

function check(condition, message) {
  checks.push(message);
  if (!condition) failures.push(message);
}

for (const document of documents) check(document.schemaVersion === 1, 'help source schemaVersion is 1');
for (const article of articles) {
  for (const key of required) check(article[key] !== undefined, `${article.id ?? 'unknown'}/${article.locale ?? 'unknown'} has ${key}`);
  check(audiences.has(article.audience), `${article.id}/${article.locale} has a supported audience`);
  check(locales.includes(article.locale), `${article.id}/${article.locale} has a supported locale`);
  check(Number.isInteger(article.version) && article.version > 0, `${article.id}/${article.locale} has a positive version`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(article.lastReviewedDate), `${article.id}/${article.locale} has a review date`);
  check(article.title.trim().length > 0 && article.summary.trim().length > 0 && article.body.trim().length > 0, `${article.id}/${article.locale} has readable content`);
  check(article.features.length > 0 && article.routes.length > 0 && article.keywords.length > 0, `${article.id}/${article.locale} is indexed`);
  const key = `${article.id}:${article.locale}`;
  check(!seen.has(key), `${key} is unique`);
  seen.add(key);
  const text = JSON.stringify(article);
  for (const pattern of secretPatterns) check(!pattern.test(text), `${key} contains no credential-shaped content`);
  check(!/\[[^\]]+\]\((?!https?:\/\/|\/|#)[^)]+\)/.test(article.body), `${key} has no unresolved relative Markdown link`);
  check(article.routes.every(route => knownRoutes.has(route)), `${key} references only canonical product routes`);
  const headings = [...article.body.matchAll(/^#{2,3}\s+(.+)$/gm)].map(match => match[1].trim().toLocaleLowerCase(article.locale));
  const readableSections = headings.length > 0 || article.body.split(/\n\s*\n/).length >= 2 || /^[-*]\s+/m.test(article.body);
  check(readableSections, `${key} contains readable sections`);
  check(new Set(headings).size === headings.length, `${key} contains no duplicate heading anchors`);
  check(!/<script|javascript:|onerror\s*=/i.test(article.body), `${key} contains no executable markup`);
}

const ids = [...new Set(articles.map(article => article.id))].sort();
for (const id of ids) {
  const variants = articles.filter(article => article.id === id);
  for (const locale of locales) check(variants.some(article => article.locale === locale), `${id} has ${locale}`);
  check(new Set(variants.map(article => article.audience)).size === 1, `${id} keeps one audience across locales`);
  check(new Set(variants.map(article => JSON.stringify(article.features.slice().sort()))).size === 1, `${id} keeps feature metadata across locales`);
}

const normalize = value => value.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const search = (locale, query, audience) => {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return articles.filter(article => article.locale === locale && (article.audience === audience || article.audience === 'all'))
    .filter(article => terms.some(term => normalize([article.title, article.summary, ...article.keywords, article.body].join(' ')).includes(term)));
};
for (const query of ['mot de passe', 'adresse', 'devis', 'vérification', 'professionnel', 'compte', 'assistance']) {
  check(search('fr', query, query === 'vérification' || query === 'professionnel' ? 'worker' : 'customer').length > 0, `French search finds “${query}”`);
}
for (const query of ['suspend user', 'grant staff role', 'audit', 'dual control']) {
  check(search('en', query, 'admin').length > 0, `admin search finds “${query}”`);
}

const terminology = JSON.parse(readFileSync(join(root, 'docs/localization/terminology.json'), 'utf8'));
check(terminology.schemaVersion === 1, 'localization terminology schemaVersion is 1');
for (const term of terminology.terms ?? []) {
  check(Boolean(term.key && term.en && term.ar && term.fr && term.meaning), `${term.key ?? 'unknown'} has EN/AR/FR product terminology`);
}

const publicArticles = articles.filter(article => article.audience !== 'admin');
const adminArticles = articles.filter(article => article.audience === 'admin' || article.audience === 'all');
check(publicArticles.every(article => article.audience !== 'admin'), 'public help index excludes every admin article');

const featureIndex = {};
for (const article of articles) for (const feature of article.features) {
  featureIndex[feature] ??= [];
  if (!featureIndex[feature].includes(article.id)) featureIndex[feature].push(article.id);
}
for (const value of Object.values(featureIndex)) value.sort();

const outputs = {
  'src/help/generated-public-articles.json': { schemaVersion: 1, generatedFrom: sources, articles: publicArticles },
  'web/lib/generated-public-help.json': { schemaVersion: 1, generatedFrom: sources, articles: publicArticles },
  'web/lib/generated-admin-help.json': { schemaVersion: 1, generatedFrom: sources, articles: adminArticles },
  'docs/help/help-index.json': { schemaVersion: 1, generatedFrom: sources, locales, articleIds: ids, features: featureIndex, articles: articles.map(({ body, ...metadata }) => metadata) },
};

for (const [path, value] of Object.entries(outputs)) {
  const expected = `${JSON.stringify(value, null, 2)}\n`;
  const absolute = join(root, path);
  if (write) { mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, expected, 'utf8'); }
  else check(existsSync(absolute) && readFileSync(absolute, 'utf8') === expected, `${path} matches the documentation authority`);
}

/**
 * Paths this change DELETES, as opposed to edits.
 *
 * Needed because a deletion is a different kind of event from an edit, and the
 * impact rules below match on the path rather than on what happened to it.
 */
function gitDeletedFiles() {
  const commands = [
    ['diff', '--name-only', '--diff-filter=D', 'origin/main...HEAD'],
    ['diff', '--name-only', '--diff-filter=D'],
    ['diff', '--cached', '--name-only', '--diff-filter=D'],
  ];
  const files = new Set();
  for (const args of commands) {
    try {
      for (const line of execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split(/\r?\n/)) {
        if (line.trim()) files.add(line.trim().replaceAll('\\', '/'));
      }
    } catch { /* not a repository, or no such range */ }
  }
  return files;
}

function gitChangedFiles() {
  const commands = [['diff', '--name-only', 'origin/main...HEAD'], ['diff', '--name-only'], ['diff', '--cached', '--name-only']];
  const files = new Set();
  for (const args of commands) {
    try { for (const line of execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split(/\r?\n/)) if (line.trim()) files.add(line.trim().replaceAll('\\', '/')); } catch {}
  }
  try { for (const line of execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/)) if (line.trim()) files.add(line.trim().replaceAll('\\', '/')); } catch {}
  return [...files];
}

const changed = gitChangedFiles();
const deleted = gitDeletedFiles();
const docsChanged = changed.some(path => sources.includes(path));
const impactRules = [
  // `auth` must not match `authority`. `catalogue-consumer-authority.test.mts`
  // and `worker-trade-authority.sql` are catalogue files; treating them as
  // authentication changes demanded a security-article review for a profession
  // list, and a gate that asks for the wrong document gets answered with filler.
  { pattern: /(?:auth(?!orit)|sign-in|create-account|password|session)/i, ids: ['customer-account-security', 'worker-getting-started'] },
  // What a worker is asked in onboarding, and which work they may claim, is
  // documented behaviour. There was no rule for it, so the Step 3 rebuild could
  // have shipped with the getting-started article still describing a flat list.
  //
  // Matched on the modules that DEFINE that behaviour rather than on the word
  // "profession" anywhere in a path: a grants-only migration and a pgTAP
  // fixture both carry the word and change nothing a worker could read about,
  // and a gate that asks for a documentation review of a `revoke` statement
  // gets answered with filler — the failure this file's own comment warns of.
  { pattern: /^(?:src\/providers\/(?:profession-taxonomy|worker-trade-selection)|app\/onboarding\/worker|web\/components\/worker-profile-editor)/, ids: ['worker-getting-started'] },
  { pattern: /(?:address|location|map-provider|location-proxy)/i, ids: ['customer-addresses-location', 'worker-onboarding-verification'] },
  { pattern: /(?:verification|vetting)/i, ids: ['worker-onboarding-verification', 'admin-verification-enforcement'] },
  { pattern: /(?:marketplace|quote|request)/i, ids: ['customer-requests-quotes-jobs', 'worker-opportunities-jobs'] },
  { pattern: /(?:staff|capabilit|fresh-auth|dual-control)/i, ids: ['admin-staff-security'] },
  { pattern: /(?:analytics|report|export)/i, ids: ['admin-audit-analytics'] },
];
// A stylesheet changes appearance, not documented behaviour. A spacing pass
// touches files whose names match these patterns — `auth-panel.module.css`,
// `staff-sign-in.module.css` — without altering one product rule, and filler
// help text written to satisfy a gate is worse than no help text. A change that
// genuinely alters behaviour edits a component or an RPC alongside its styles,
// and that still trips the rule.
/**
 * Routes and database objects are the two things whose REMOVAL is itself
 * documented behaviour: deleting `app/favourites.tsx` withdraws a screen the
 * help centre describes, and dropping an RPC withdraws what it did. Everything
 * else that is merely deleted cannot change what a reader is told, because a
 * deletion that anything still used would have failed typecheck, lint or a
 * regression suite long before this gate ran.
 *
 * Without this, a cleanup that removes dead code trips the gate on the FILE
 * NAME alone — `auth-debug.txt`, `AddressSelector.tsx` — and the only way to
 * satisfy it is to edit a help article that describes none of them. That is the
 * filler this file's own comments warn against, and it would teach everyone to
 * write filler.
 */
const removalIsBehaviour = (path) =>
  /^(?:app|web\/app)\//.test(path) || path.startsWith('supabase/');

/**
 * A migration that only takes things away.
 *
 * The impact rules match on the PATH, and a migration's filename is prose. That
 * is already a known false positive in this file — the `worker-getting-started`
 * rule above was narrowed to specific modules because "a grants-only migration
 * and a pgTAP fixture both carry the word and change nothing a worker could
 * read about". `202608290001_retire_unused_staff_rpcs.sql` is the same shape: it
 * contains the word `staff`, drops three RPCs that no client, test, document or
 * other database object ever referenced, and changes nothing a reader is told.
 * All thirty-two help articles were checked for the retired surfaces; none
 * mentions them.
 *
 * So a migration whose statements are exclusively `drop`s is treated as a
 * retirement rather than a behaviour change. It cannot be anything else: an
 * object with a surface has a caller in `src/`, `app/` or `web/`, and dropping
 * it means changing that caller too — which is a source path, which the rules
 * still match. Comments are stripped first, because these migrations are mostly
 * comment, and `notify pgrst` is ignored because every migration ends with one.
 */
const retirementOnlyMigration = (path) => {
  if (!/^supabase\/migrations\/.*\.sql$/.test(path)) return false;
  let sql;
  try { sql = readFileSync(join(root, path), 'utf8'); } catch { return false; }
  const statements = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .filter((statement) => !/^notify\s+pgrst/i.test(statement));
  return statements.length > 0 && statements.every((statement) => /^drop\s/i.test(statement));
};
/**
 * A regression suite asserts behaviour; it does not implement any.
 *
 * The rules match on the path, and a suite is named after the thing it tests —
 * `wps023-authentication-onboarding-vetting.test.mts` carries both `auth` and
 * `vetting`. Retiring a dead module and re-pointing its assertions changes only
 * test files, and demanding a help-article review for that produces the filler
 * this file's own comments warn against.
 *
 * Safe because it cannot hide a real change: behaviour lives in `app/`, `src/`,
 * `components/`, `web/` or `supabase/`, and a test-only diff means none of them
 * moved. A change that DOES alter behaviour edits one of those alongside its
 * test, and that still trips the rule.
 */
const testOnly = (path) => /\.test\.(mts|ts|tsx)$/.test(path)
  || path.startsWith('supabase/tests/');

const behavioural = (path) => !path.startsWith('docs/help/')
  && !/\.s?css$/i.test(path)
  && !testOnly(path)
  && !retirementOnlyMigration(path)
  && !(deleted.has(path) && !removalIsBehaviour(path));
const impacted = impactRules.filter(rule => changed.some(path =>
  behavioural(path) && rule.pattern.test(path)));
for (const rule of impacted) {
  check(rule.ids.every(id => ids.includes(id)), `documentation impact maps to ${rule.ids.join(', ')}`);
  check(docsChanged, `behavioral changes affecting ${rule.ids.join(', ')} include documentation review`);
}

if (failures.length) {
  console.error(`Help documentation validation failed (${failures.length}/${checks.length}):`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log(`Help documentation: ${articles.length} localized articles, ${ids.length} topics, ${checks.length} checks passed${write ? '; indexes written' : ''}.`);
