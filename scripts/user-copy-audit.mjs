/**
 * Internal thinking, in copy a user reads.
 *
 * The sign-in page carried a card explaining that Warsha resolves what an
 * account can do after authentication and that nobody declares a role first.
 * True, accurate, and a description of how the product is built, in front of
 * somebody who came to sign in. That was not one bad paragraph; it was a habit,
 * and a habit needs something that notices.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is not a word blacklist. A blacklist gets one of two ways: either it is
 * narrow and misses the next phrasing, or it is broad and gets switched off the
 * first time it flags a sentence that was fine. This does three things instead:
 *
 *   1. It builds an INVENTORY of the strings a user can actually read, from the
 *      copy authorities rather than from every file that contains quotes. A
 *      variable name, a log line, a comment and a test fixture can all say
 *      `service_role`; none of them is UI.
 *
 *   2. It matches terms in CATEGORIES, each carrying the reason it is a problem,
 *      so a finding arrives as an argument rather than as a hit count.
 *
 *   3. Everything it finds is a REVIEW CANDIDATE. Some of these terms are
 *      correct in some contexts, so a finding is cleared by being written down
 *      in ALLOWED with a justification — not by deleting the rule. The record is
 *      the point: the next person can see that somebody looked and why they
 *      concluded what they did.
 *
 * A candidate is not a defect. Read it, then either fix the copy or justify it.
 *
 * Usage: node scripts/user-copy-audit.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The inventory: files whose string values are read by a customer or a
 * professional. Admin surfaces are included only where the text can reach a
 * user; staff tooling is not UI in this sense and says `service_role` because
 * that is what it operates on.
 */
const DICTIONARIES = [
  'web/lib/copy.ts',
  'web/lib/app-copy.ts',
  ...readdirSync('src/i18n')
    .filter((name) => /translations|copy|labels/.test(name) && name.endsWith('.ts'))
    .map((name) => join('src/i18n', name)),
];

/** The other copy authorities, wherever they live under src/. */
function copyModules(directory, found = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) copyModules(full, found);
    else if (/-copy\.ts$/.test(entry)) found.push(full);
  }
  return found;
}

/*
 * Forward slashes, always. `join` produces backslashes on Windows, and a
 * finding keyed on `src\i18n\...` never matches an ALLOWED entry written
 * as `src/i18n/...` — which looks exactly like the review having no effect.
 */
const slash = (path) => path.split('\\').join('/');
const HELP = ['docs/help/articles.json', 'docs/help/articles.fr.json'];
const FILES = [...new Set([...DICTIONARIES, ...copyModules('src'), ...HELP])].map(slash);

/*
 * Values, not keys and not comments.
 *
 * A key called `providerName` is a variable; the sentence it holds is the UI.
 * Comments are where the reasoning is SUPPOSED to live, so a comment explaining
 * why a synthetic identity exists must not be read as a user seeing the words.
 */
const withoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/*
 * Help articles are copy too, and for a while they were the copy nobody
 * audited. `worker-getting-started` explained that Warsha creates a private
 * internal Auth identity which is never shown as your email, and that
 * registration uses a privacy-preserving response — three sentences of
 * mechanism in the article a new professional is sent to first.
 *
 * They are JSON rather than a module, so the values come out of the parsed
 * document instead of a regex, keyed by article id and field.
 */
function stringsInArticles(file) {
  const document = JSON.parse(readFileSync(file, 'utf8'));
  const articles = Array.isArray(document) ? document : (document.articles ?? []);
  const found = [];
  const visit = (node, id, path) => {
    if (typeof node === 'string') {
      if (node.trim()) found.push({ file, key: `${id}:${path}`, text: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, id, `${path}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [name, value] of Object.entries(node)) {
        if (name === 'id' || name === 'locale' || name === 'slug') continue;
        visit(value, id, path ? `${path}.${name}` : name);
      }
    }
  };
  for (const article of articles) {
    visit(article, `${article.id}.${article.locale ?? '?'}`, '');
  }
  return found;
}

function stringsIn(file) {
  if (file.endsWith('.json')) return stringsInArticles(file);
  const source = withoutComments(readFileSync(file, 'utf8'));
  const found = [];
  const entry = /([A-Za-z0-9_]+)\s*:\s*((?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)(?:\s*\+\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`))*)/g;
  for (const match of source.matchAll(entry)) {
    const text = [...match[2].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
      .map((piece) => piece[1] ?? piece[2] ?? piece[3] ?? '')
      .join('');
    if (text.trim()) found.push({ file, key: match[1], text });
  }
  return found;
}

/*
 * Categories. Each says what the reader loses, because that is the thing to
 * weigh when deciding whether a given hit is really a problem.
 */
const CATEGORIES = [
  {
    name: 'backend and service names',
    why: 'names a system the user did not choose and cannot act on',
    pattern: /\b(supabase|postgres(?:ql)?|gotrue|firebase|vercel|s3 bucket|cdn)\b/i,
  },
  {
    name: 'database vocabulary',
    why: 'describes where data sits rather than what happens to the user',
    pattern: /\b(database|schema|row[- ]level security|\bRLS\b|SQL|stored procedure|\bRPC\b|table row)\b/i,
  },
  {
    name: 'auth internals',
    why: 'exposes the mechanism of a security control instead of the control',
    pattern: /\b(AAL2|assurance level|service_role|JWT|bearer token|access token|refresh token|claims)\b/i,
  },
  {
    name: 'configuration and operations',
    why: 'reports the state of the deployment, which the user cannot fix',
    pattern: /\b(feature[ _]flag|environment variable|configuration is|misconfigur|not configured|deployment|endpoint|API key)\b/i,
  },
  {
    name: 'lifecycle and state machines',
    why: 'names an internal state instead of the consequence the user sees',
    pattern: /\b(lifecycle|state machine|transition(?:ed)? to|invalid state|state identifier)\b/i,
  },
  {
    name: 'developer error text',
    why: 'a reader cannot act on a stack, a status code or a null',
    pattern: /\b(undefined|null reference|stack trace|exception|HTTP [45]\d\d|status code|\bERR_[A-Z_]+)\b/,
  },
  {
    name: 'internal role vocabulary',
    why: 'Warsha says Professional to a user; provider and worker are internal',
    pattern: /\b(provider role|worker role|role resolution|account capabilit|marketplace activation|provider verification state|location provider)\b/i,
  },
  {
    name: 'internal identity mechanics',
    why: 'the synthetic identity behind a professional account is not a user concept',
    pattern: /\b(internal auth identity|synthetic identity|privacy[- ]preserving response|decoy)\b/i,
  },
];

/*
 * Where a string is actually rendered.
 *
 * This is the half that stops the audit being a blacklist. `app-copy.ts` holds
 * the customer application AND the staff console in one dictionary, so the file
 * a string lives in says nothing about who reads it. `enforcementReasonHint`
 * mentions the database because it is telling a staff member which reasons the
 * database will accept, and that is the correct sentence for that reader.
 *
 * So every key is traced to the screens that use it, and a key used only by
 * `/admin`, the console shell or a staff component is reported separately and
 * does not fail. Administration is web-only and staff operate on the system
 * itself; naming it there is precision, not leakage.
 *
 * A key nobody references is reported as a user surface deliberately: an
 * unreferenced string is either dead copy or renamed indirection, and both are
 * worth a look.
 */
const SURFACES = ['web/app', 'web/components', 'web/lib', 'app', 'components', 'src'];

function renderingFiles(directory, found = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) renderingFiles(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

const surfaceSource = SURFACES
  .flatMap((directory) => renderingFiles(directory))
  .map((file) => ({ file, text: readFileSync(file, 'utf8') }));

const STAFF = /(^|[\\/])(admin|console|staff|vetting|enforcement|governed)/i;

function readersOf(key) {
  // `words.key`, `copy.key`, `appCopy.en.key`, `t('key')` and `['key']`.
  const reference = new RegExp(`[.\\['"\`]${key}\\b`);
  return surfaceSource
    .filter(({ file, text }) => !FILES.includes(file.replace(/\\/g, '/')) && reference.test(text))
    .map(({ file }) => file);
}

/*
 * Cleared candidates, each with the reason somebody concluded it was fine.
 *
 * A justification is a sentence about THIS string in THIS place. "It reads okay"
 * is not one. Anything not listed here and not staff-only is reported.
 */
const ALLOWED = [
  /*
   * Reviewed 2026-09-11. All seven are staff console copy that the reader
   * tracing above could not attribute, because nothing references them by a
   * literal key — they are reached through a computed lookup (`…Why_vision`
   * and friends) or through a notification type table. Traced by hand instead.
   */
  ['web/lib/app-copy.ts', 'providerApprovalWhy',
    'The dual-control screen for switching on an OUTSIDE SERVICE — Google Maps, '
    + 'Vision. "Provider" there is a third party Warsha sends data to, not a '
    + 'Warsha professional, and "the database refuses the activation" is the '
    + 'precise thing an operator needs to know before requesting a second approval.'],
  ['web/lib/app-copy.ts', 'providerActivateDefaultReason',
    'The prefilled reason on the same admin activation request. "Location '
    + 'provider" is the map service being enabled, and the operator writing the '
    + 'request is the only reader.'],
  ['web/lib/app-copy.ts', 'providerFeatureDefaultReason',
    'As above: the prefilled reason for enabling a feature of an already '
    + 'activated outside service.'],
  ['src/notifications/notification-copy.ts', 'staff_reconciliation_exception',
    'A staff notification type. The event IS an accounting exception and that is '
    + 'what the finance vocabulary calls it; no customer or professional '
    + 'subscribes to it.'],
  ['src/support/support-copy.ts', 'staffMockUnavailable',
    'Shown to a staff member who opened support tooling against mock data. It '
    + 'names Supabase because the missing thing is a real Supabase session and '
    + 'the reader is the person who can go and get one.'],
];

const cleared = new Set(ALLOWED.map((entry) => `${entry[0]}::${entry[1]}`));

const candidates = [];
const staffOnly = [];
for (const file of FILES) {
  for (const { key, text } of stringsIn(file)) {
    for (const category of CATEGORIES) {
      const hit = category.pattern.exec(text);
      if (!hit) continue;
      if (cleared.has(`${file}::${key}`)) continue;
      const readers = readersOf(key);
      const finding = { file, key, term: hit[0], category, text, readers };
      /*
       * A help article carries its audience in its id. The admin manual is
       * written for the people who operate Warsha, and telling an operator that
       * the database checks a capability on every RPC is the correct sentence —
       * vaguer wording there would make the manual worse, not kinder.
       */
      const adminArticle = file.startsWith('docs/help/') && /^admin-/.test(key);
      const staff = adminArticle
        || (readers.length > 0 && readers.every((reader) => STAFF.test(reader)));
      (staff ? staffOnly : candidates).push(finding);
    }
  }
}

const inventory = FILES.reduce((total, file) => total + stringsIn(file).length, 0);
console.log(`User copy audit: ${inventory} user-visible strings across ${FILES.length} authorities.`);

if (candidates.length === 0) {
  console.log('No internal vocabulary found in user-facing copy.');
  process.exit(0);
}

const byCategory = new Map();
for (const candidate of candidates) {
  const list = byCategory.get(candidate.category.name) ?? [];
  list.push(candidate);
  byCategory.set(candidate.category.name, list);
}

console.log(`\n${candidates.length} review candidate(s):\n`);
for (const [name, list] of byCategory) {
  console.log(`  ${name} — ${list[0].category.why}`);
  for (const candidate of list) {
    // The matched term and enough around it to judge, without printing an
    // entire Arabic paragraph into a console that may not be UTF-8.
    const at = candidate.text.toLowerCase().indexOf(candidate.term.toLowerCase());
    const around = candidate.text.slice(Math.max(0, at - 40), at + candidate.term.length + 40);
    const safe = [...around].map((ch) => (ch.charCodeAt(0) < 128 ? ch : '.')).join('');
    console.log(`    ${candidate.file} :: ${candidate.key}`);
    console.log(`      "${candidate.term}" in ...${safe}...`);
  }
  console.log('');
}

console.log('Each candidate is either copy to fix or a line to add to ALLOWED with a reason.');
process.exit(1);
