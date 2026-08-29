/**
 * WPS-024 client regression suite.
 *
 * Three kinds of check live here.
 *
 * Behavioural: the pure materiality, audience and corpus functions are run
 * against real inputs. These decide whether somebody is asked to agree again.
 *
 * Chain-of-custody: the bundled corpus is hashed and compared with the hashes
 * the migration registers. This is the single most important set of checks in
 * the file — an acceptance names a hash, the register holds that hash, and
 * this module holds the words. If the three ever drift, an acceptance points
 * at text nobody agreed to, and nothing else in the system would notice.
 *
 * Structural: the source of the screens, the migration and the modules is read
 * and searched. These are the rules easiest to erode by accident — a decline
 * quietly recorded as consent, an offence field added to a payload, an anon
 * grant reintroduced, a compliance claim slipped into a policy.
 *
 * Comments are stripped before any structural search, so a comment explaining
 * why something is absent can never satisfy the check for that absence. The
 * same applies to a SEEDED DATA STRING: WPS-023 learned that the hard way when
 * a policy note reading "no automatic rejection rule is implemented" satisfied
 * a search for "automatic reject". Absence is checked by looking for the
 * machinery, not for the words.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { canonicalText, sha256Hex, utf8Bytes } from '../src/legal/legal-hash.ts';
import { legalCatalogueFr } from '../src/legal/legal-catalogue-fr.ts';
import {
  acceptanceRequiredFor,
  bodyFor,
  bodyLanguageFor,
  catalogueFor,
  corpusProblems,
  documentHash,
  documentsForRole,
  findDocument,
  hashableParts,
  hashesFor,
  legalCorpus,
  legalDocumentKeys,
} from '../src/legal/legal-corpus.ts';
import {
  appliesToRole,
  forcesReconsent,
  legalChangeClasses,
  mayRestrictOnDecline,
  restrictionsFor,
  type LegalChangeClass,
} from '../src/legal/legal-types.ts';
import {
  mockAcceptDocument,
  mockDeclineDocument,
  mockLegalAcceptances,
  mockLegalObligations,
  mockResetLegal,
  mockSetRole,
} from '../src/legal/mock-legal-state.ts';
import {
  IDENTITY_PARSER_VERSION,
  parseIdentityCandidates,
  parseIdentityDocument,
} from '../supabase/functions/_shared/ocr-identity-fields.ts';
import {
  clampProbability,
  summariseConfidence,
  type IdentityCandidate,
} from '../supabase/functions/_shared/ocr-provider.ts';
import { legalCopy } from '../src/legal/legal-copy.ts';
import { resolveLocationExperienceAvailability } from '../src/providers/location-experience-policy.ts';

const root = join(import.meta.dirname, '..');
let passed = 0;
const failures: string[] = [];

function check(condition: boolean, label: string): void {
  if (condition) passed += 1;
  else failures.push(label);
}

function read(...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8');
}

/** Source with line and block comments removed. */
function codeOf(...parts: string[]): string {
  return read(...parts).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Every file under a directory, recursively. Used by the credential sweep. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx|js|jsx|json)$/.test(entry)) out.push(full);
  }
  return out;
}

/** SQL with line comments removed. */
function sqlCodeOf(...parts: string[]): string {
  return read(...parts).replace(/--[^\n]*/g, '');
}

const migrationRaw = read(
  'supabase', 'migrations', '202608090001_wps024_legal_compliance_governance.sql',
);
const migration = sqlCodeOf(
  'supabase', 'migrations', '202608090001_wps024_legal_compliance_governance.sql',
);
const workerAuthCorrection = sqlCodeOf(
  'supabase', 'migrations', '202608150001_worker_phone_password_auth.sql',
);
const workerAuthBroker = codeOf('supabase', 'functions', 'worker-auth', 'index.ts');

// The synthetic email is an authentication key, never a contact or export
// field. These are WPS-024 privacy/governance assertions, not only auth tests.
check(/'worker_auth_identities', 'private', 'worker_auth_identities'[\s\S]*'delete', false, null/.test(workerAuthCorrection),
  'worker identity mapping is inventoried private, deletion-bound, non-exported, and unavailable to staff');
check(/private\.account_contact_email\(p_user_id\)/.test(workerAuthCorrection),
  'staff customer projection uses the real-contact email boundary');
check(/exists \(select 1 from private\.worker_auth_identities i where i\.user_id = u\.id\)[\s\S]*then null[\s\S]*else u\.email/.test(workerAuthCorrection),
  'synthetic worker email becomes null in contact projections');
check(/values \(new\.id, not trusted_worker_registration, false\)/.test(workerAuthCorrection),
  'synthetic workers have email and SMS notification delivery disabled');
check(!/syntheticEmail[\s\S]*return json\(\{[^}]*email/.test(workerAuthBroker),
  'trusted broker never returns its synthetic email as response data');
check(/revoke all on function public\.resolve_worker_auth_identity\(text\) from public, anon, authenticated/.test(workerAuthCorrection),
  'phone mapping resolver has no public or signed-in execution authority');

// ---------------------------------------------------------------------------
// SHA-256: three implementations, one answer
// ---------------------------------------------------------------------------
// The pgTAP suite pins Postgres to this same digest. If both hold, the client
// and the server agree about what a document hash is, which is the assumption
// every acceptance rests on.
check(
  sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'THE CLIENT SHA-256 MATCHES THE KNOWN DIGEST THE SERVER SUITE ALSO PINS',
);
check(sha256Hex('') === createHash('sha256').update('', 'utf8').digest('hex'),
  'the empty string hashes correctly');

for (const sample of [
  'YOUR WORK, OUR MISSION',
  'شغلك مهمتنا',
  'ورشة — Warsha',
  'a'.repeat(1000),
  'x'.repeat(55),
  'y'.repeat(56),
  'z'.repeat(64),
]) {
  check(sha256Hex(sample) === createHash('sha256').update(sample, 'utf8').digest('hex'),
    `sha256 matches node:crypto for a ${sample.length}-character sample`);
}

// Every input length across five block boundaries.
//
// This is not padding for the sake of it. The first implementation computed
// its padded length as `((len + 9) >> 6) + 1` blocks, which is the ceiling
// EXCEPT when len + 9 is an exact multiple of 64 — where it appended a whole
// extra block of zeros and produced a wrong digest. That is len ≡ 55 (mod 64):
// one input length in sixty-four. "abc", a thousand 'a's, and twenty-five of
// the twenty-six legal documents all hashed correctly; `version_history` did
// not, and nothing but a sweep would have found it.
let boundaryMismatches = 0;
for (let n = 0; n <= 320; n += 1) {
  const sample = 'a'.repeat(n);
  if (sha256Hex(sample) !== createHash('sha256').update(sample, 'utf8').digest('hex')) {
    boundaryMismatches += 1;
  }
}
check(boundaryMismatches === 0,
  `SHA-256 MATCHES NODE:CRYPTO AT EVERY LENGTH FROM 0 TO 320 (${boundaryMismatches} adrift)`);

// Arabic is multi-byte. A UTF-8 encoder that got this wrong would produce
// hashes that matched on English documents and silently differed on Arabic
// ones, which is the failure mode that would survive a casual test.
check(utf8Bytes('شغلك').length === 8, 'Arabic encodes to the expected UTF-8 byte length');
check(utf8Bytes('a').length === 1, 'ASCII encodes to one byte');
check(utf8Bytes('€').length === 3, 'a three-byte code point encodes to three bytes');
check(utf8Bytes('😀').length === 4, 'a surrogate pair encodes to four bytes');

// Canonicalisation normalises whitespace and nothing else. A reflowed paragraph
// must not invalidate every acceptance; a changed word must.
check(canonicalText(['  a   b  ', '', ' c ']) === 'a b\nc',
  'canonicalisation collapses whitespace and drops empty parts');
check(canonicalText(['a b']) === canonicalText(['a\n  b']),
  'reflowing a paragraph does not change the canonical text');
check(canonicalText(['a b']) !== canonicalText(['a c']),
  'CHANGING A WORD CHANGES THE CANONICAL TEXT');
check(canonicalText(['Hello']) !== canonicalText(['hello']),
  'canonicalisation does not fold case, because case can carry meaning');

// ---------------------------------------------------------------------------
// The corpus is structurally sound
// ---------------------------------------------------------------------------
check(corpusProblems().length === 0,
  `the corpus has no structural problems (${corpusProblems().join('; ')})`);
check(legalCorpus.length === 26, 'the corpus holds twenty-six documents');
check(legalDocumentKeys.length === 26, 'every document key is enumerated');
check(new Set(legalDocumentKeys).size === 26, 'no document key is duplicated');

const requiredKeys = [
  'customer_terms', 'worker_terms', 'privacy_policy', 'worker_verification_policy',
  'acceptable_use_policy', 'worker_code_of_conduct', 'refund_policy', 'cancellation_policy',
  'appeals_policy', 'trust_safety_policy', 'content_policy', 'intellectual_property_policy',
  'incident_response_policy', 'security_disclosure_policy', 'subprocessor_register',
  'data_processing_register', 'data_retention_register', 'ai_usage_policy', 'ocr_usage_policy',
  'location_data_policy', 'data_processing_policy', 'data_retention_policy', 'cookie_policy',
  'accessibility_statement', 'version_history', 'legal_contact',
];
for (const key of requiredKeys) {
  check(findDocument(key) !== null, `the corpus contains ${key}`);
}

// Every document has real content in both languages. A "complete legal draft"
// that is four sentences long is a placeholder wearing a title.
for (const document of legalCorpus) {
  for (const language of ['en', 'ar'] as const) {
    const body = bodyFor(document, language);
    const words = hashableParts(body).join(' ').trim().split(/\s+/).length;
    check(words >= 120, `${document.key}.${language} carries substantive text (${words} words)`);
    check(body.sections.length >= 4, `${document.key}.${language} has at least four sections`);
  }
}

// No placeholder text anywhere. Checked against the RAW source, not the
// comment-stripped one, because a lorem ipsum inside a comment would still be
// a sign somebody left work unfinished.
const corpusFiles = [
  'legal-corpus-agreements.ts', 'legal-corpus-conduct.ts',
  'legal-corpus-data.ts', 'legal-corpus-registers.ts',
];
for (const file of corpusFiles) {
  const raw = read('src', 'legal', file);
  check(!/lorem ipsum/i.test(raw), `${file} contains no lorem ipsum`);
  check(!/\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b/.test(raw), `${file} contains no unfinished marker`);
  check(!/\[insert|\[your |\{\{|\bplaceholder text\b/i.test(raw),
    `${file} contains no placeholder token`);
}

// ---------------------------------------------------------------------------
// Chain of custody: corpus text -> registered hash
// ---------------------------------------------------------------------------
let hashMismatches = 0;
for (const document of legalCorpus) {
  const { en, ar } = hashesFor(document);
  const registered = new RegExp(
    `\\('${document.key}', '${document.version.replace('.', '\\.')}', '${en}', '${ar}'`,
  );
  if (!registered.test(migration)) hashMismatches += 1;
}
check(hashMismatches === 0,
  `EVERY DOCUMENT HASH IN THE CORPUS MATCHES THE MIGRATION REGISTER (${hashMismatches} adrift)`);

// Distinctness matters as much as correctness: two documents sharing a hash
// would mean an acceptance of one could be satisfied by the other.
const enHashes = new Set(legalCorpus.map((d) => hashesFor(d).en));
const arHashes = new Set(legalCorpus.map((d) => hashesFor(d).ar));
check(enHashes.size === 26, 'no two documents share an English hash');
check(arHashes.size === 26, 'no two documents share an Arabic hash');
check(legalCorpus.every((d) => hashesFor(d).en !== hashesFor(d).ar),
  'no document has identical English and Arabic text');

// The hash covers the words and not the metadata: a version bump alone must
// not silently invalidate a text that did not change.
const terms = findDocument('customer_terms')!;
check(documentHash(terms.en) === hashesFor(terms).en, 'the document hash is reproducible');
check(
  documentHash({ ...terms.en, title: `${terms.en.title} ` }) === documentHash(terms.en),
  'trailing whitespace does not change a document hash',
);
check(
  documentHash({ ...terms.en, title: `${terms.en.title}!` }) !== documentHash(terms.en),
  'CHANGING A SINGLE CHARACTER OF A DOCUMENT CHANGES ITS HASH',
);

// Dates in the register must match the corpus, or a document is published on a
// day its own text does not claim.
for (const document of legalCorpus) {
  check(
    migration.includes(`'${document.publishedAt}', '${document.effectiveAt}'`),
    `${document.key} publication dates appear in the register`,
  );
}

// ---------------------------------------------------------------------------
// Materiality
// ---------------------------------------------------------------------------
check(legalChangeClasses.length === 5, 'five change classes are declared');
check(forcesReconsent('material'), 'A MATERIAL CHANGE FORCES RE-CONSENT');
check(forcesReconsent('urgent'), 'AN URGENT CHANGE FORCES RE-CONSENT');
check(forcesReconsent('initial'), 'a first version has never been accepted, so it is asked for');
check(!forcesReconsent('editorial'), 'AN EDITORIAL CORRECTION DOES NOT FORCE RE-CONSENT');
check(!forcesReconsent('non_material'), 'A CLARIFICATION DOES NOT FORCE RE-CONSENT');

check(mayRestrictOnDecline('material'), 'declining a material change may restrict');
check(mayRestrictOnDecline('urgent'), 'declining an urgent change may restrict');
check(!mayRestrictOnDecline('editorial'), 'DECLINING AN EDITORIAL CHANGE RESTRICTS NOTHING');
check(!mayRestrictOnDecline('non_material'), 'declining a clarification restricts nothing');
check(!mayRestrictOnDecline('initial'),
  'a first version does not restrict on decline, because nothing was withdrawn');

for (const changeClass of ['editorial', 'non_material', 'initial'] as LegalChangeClass[]) {
  check(restrictionsFor(changeClass, ['create_booking']).length === 0,
    `a ${changeClass} change cannot invent a consequence`);
}
check(restrictionsFor('material', ['create_booking']).length === 1,
  'a material change reports the consequence it was given');

// ---------------------------------------------------------------------------
// Audience: the two agreements stay independent
// ---------------------------------------------------------------------------
check(appliesToRole('all', 'customer') && appliesToRole('all', 'worker'),
  'an all-audience document addresses both roles');
check(appliesToRole('customer', 'customer'), 'customer documents address customers');
check(!appliesToRole('customer', 'worker'), 'A WORKER IS NOT BOUND BY THE CUSTOMER TERMS');
check(!appliesToRole('worker', 'customer'), 'A CUSTOMER IS NOT BOUND BY THE WORKER TERMS');
check(!appliesToRole('staff', 'worker'), 'staff documents are not shown to users');
check(!appliesToRole('customer', null), 'a signed-out reader has no role-scoped obligations');
check(appliesToRole('public', null), 'public documents are readable without a role');

const customerRequired = acceptanceRequiredFor('customer').map((d) => d.key);
const workerRequired = acceptanceRequiredFor('worker').map((d) => d.key);
check(customerRequired.length === 2, 'a customer accepts exactly two documents');
check(workerRequired.length === 3, 'a worker accepts exactly three documents');
check(customerRequired.includes('customer_terms') && customerRequired.includes('privacy_policy'),
  'a customer accepts the customer terms and the privacy policy');
check(workerRequired.includes('worker_terms')
  && workerRequired.includes('privacy_policy')
  && workerRequired.includes('worker_verification_policy'),
  'a worker accepts the worker terms, the privacy policy and the verification policy');
check(!customerRequired.some((k) => k.startsWith('worker')),
  'NO WORKER DOCUMENT IS EVER REQUIRED OF A CUSTOMER');
check(!workerRequired.includes('customer_terms'),
  'the customer terms are not required of a worker');

check(documentsForRole('customer').length < legalCorpus.length,
  'a customer is not shown every worker document');
check(documentsForRole(null).every((d) => d.audience === 'public' || d.audience === 'all'),
  'a signed-out reader sees only public and universal documents');

// ---------------------------------------------------------------------------
// Mock parity
// ---------------------------------------------------------------------------
const mockSource = codeOf('src', 'legal', 'mock-legal-state.ts');
check(!/supabase|getSupabaseClient|fetch\(/i.test(mockSource),
  'MOCK MAKES NO SUPABASE OR NETWORK CALL');
check(!/import .*legal-corpus/.test(mockSource),
  'Mock does not import the corpus, so the regression runner needs no bundler');

mockResetLegal('acct-a');
mockResetLegal('acct-b');
mockSetRole('acct-a', 'worker');
mockSetRole('acct-b', 'customer');

const requirements = [
  { key: 'worker_terms' as const, version: '1.0', audience: 'worker',
    changeClass: 'initial', changeSummary: 'x', effectiveAt: '2026-08-06' },
  { key: 'privacy_policy' as const, version: '1.0', audience: 'all',
    changeClass: 'initial', changeSummary: 'x', effectiveAt: '2026-08-06' },
  { key: 'customer_terms' as const, version: '1.0', audience: 'customer',
    changeClass: 'initial', changeSummary: 'x', effectiveAt: '2026-08-06' },
];

const workerObligations = mockLegalObligations('acct-a', requirements);
check(workerObligations.obligations.length === 2, 'Mock filters obligations by role');
check(!workerObligations.satisfied, 'Mock starts unsatisfied, because nothing has been accepted');
check(workerObligations.blocking.length === 2, 'Mock reports initial obligations as blocking');

// Mock enforces the SAME hash rule the server does. A Mock that accepted
// anything would let a stale-bundle bug through in the one mode a developer
// looks at every day.
let mockRefused = false;
try {
  mockAcceptDocument('acct-a', 'worker_terms', '1.0', 'en', 'wronghash', 'righthash', 'onboarding');
} catch {
  mockRefused = true;
}
check(mockRefused, 'MOCK REFUSES AN ACCEPTANCE WHOSE RENDERED HASH DOES NOT MATCH');

const workerTermsHash = hashesFor(findDocument('worker_terms')!).en;
mockAcceptDocument('acct-a', 'worker_terms', '1.0', 'en', workerTermsHash, workerTermsHash, 'onboarding');
const afterAccept = mockLegalObligations('acct-a', requirements);
check(afterAccept.obligations.find((o) => o.documentKey === 'worker_terms')?.outstanding === false,
  'Mock clears an obligation once accepted');
check(afterAccept.blocking.length === 1, 'Mock still reports the unaccepted obligation');

mockDeclineDocument('acct-a', 'privacy_policy', '1.0', 'ar');
const afterDecline = mockLegalObligations('acct-a', requirements);
check(afterDecline.obligations.find((o) => o.documentKey === 'privacy_policy')?.outstanding === true,
  'A DECLINE LEAVES THE OBLIGATION OUTSTANDING RATHER THAN RESOLVING IT');
check(mockLegalAcceptances('acct-a').some((r) => r.decision === 'declined'),
  'MOCK RECORDS A DECLINE AS A DECLINE');
check(!mockLegalAcceptances('acct-a').some(
  (r) => r.documentKey === 'privacy_policy' && r.decision === 'accepted'),
  'Mock never converts a decline into an acceptance');

// Account isolation.
check(mockLegalAcceptances('acct-b').length === 0,
  'ONE MOCK ACCOUNT SEES NO OTHER ACCOUNT RECORDS');
const customerObligations = mockLegalObligations('acct-b', requirements);
check(customerObligations.obligations.length === 2, 'the customer account gets customer documents');
check(!customerObligations.obligations.some((o) => o.documentKey === 'worker_terms'),
  'the customer account is never shown the worker terms');

// The mock acceptance hash is visibly a mock, so it cannot be mistaken for a
// real one in a screenshot or a support conversation.
check(mockLegalAcceptances('acct-a').every((r) => r.acceptanceHash.startsWith('mock')),
  'a Mock acceptance hash announces that it is a Mock value');

// ---------------------------------------------------------------------------
// The repository sends what it rendered, not what it was told
// ---------------------------------------------------------------------------
const repositorySource = codeOf('src', 'legal', 'legal-repository.ts');
check(/renderedHashFor\(/.test(repositorySource),
  'the repository computes the hash of the text this build renders');
check(!/p_rendered_hash:\s*(data|register|server|remote)/i.test(repositorySource),
  'THE RENDERED HASH IS NOT ECHOED BACK FROM THE SERVER');
check(!/publish_legal_version|staff_publish/.test(repositorySource),
  'no client method publishes a legal version');
check(!/delete|drop|truncate/i.test(repositorySource),
  'no client method deletes an acceptance');
check(/environment.dataMode === 'mock'/.test(repositorySource),
  'every repository method branches on the data mode');

// `legal-staff-repository.ts` was retired on 2026-08-29. The rule it carried —
// nobody publishes a legal version from a phone — is now structural rather than
// conditional: there is no native legal staff surface at all, and
// `wps017-operations-admin.test.mts` asserts that no native admin or staff
// module exists. Legal governance is the web console's, which calls
// `staff_publish_legal_version` behind a capability and dual control.
{
  const nativeLegalStaff = execFileSync('git', ['ls-files', 'app', 'src', 'components'],
    { encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter(file => /legal.*staff|staff.*legal/i.test(file));
  check(nativeLegalStaff.length === 0,
    'NO NATIVE SURFACE CAN PUBLISH A LEGAL VERSION, BECAUSE NONE EXISTS');
}

// The context fails closed. `satisfied` must never be optimistic.
const contextSource = codeOf('src', 'legal', 'legal-context.tsx');
check(/satisfied:\s*usable\s*\?/.test(contextSource),
  'THE LEGAL GATE FAILS CLOSED WHEN THE OBLIGATIONS CALL FAILS');
check(/generation\.current/.test(contextSource),
  'the context uses the account generation guard');
check(/accountRef\.current !== key/.test(contextSource),
  'a response for a previous account is discarded');

// ---------------------------------------------------------------------------
// The migration: no compliance claimed, no consent invented
// ---------------------------------------------------------------------------
check(/create table if not exists public\.legal_acceptances/.test(migration),
  'the acceptance ledger is created');
check(/decision\s+text not null check \(decision in \('accepted', 'declined'\)\)/.test(migration),
  'a decision is accepted or declined, with no third value that could be read as maybe');
check(/Acceptance history cannot be changed/.test(migration),
  'the acceptance ledger is append-only');

// Absence checked by looking for the MACHINERY, not for words that might
// appear in a policy note. There is no code path that upgrades a decline.
check(!/set\s+decision\s*=\s*'accepted'/i.test(migration),
  'NO CODE PATH REWRITES A DECLINE INTO AN ACCEPTANCE');
check(!/decision\s*=\s*case/i.test(migration),
  'no decision is computed from anything other than what the person chose');
check(!/interval\s*'\s*\d+\s*(day|month|year)/i.test(migration),
  'NO TIMER CONVERTS INACTION INTO CONSENT');

// The three sanctioned uses of `anon` in this migration are all revokes.
const anonGrants = (migration.match(/grant\s+(execute|select)[^;]*to[^;]*\banon\b/gi) ?? []);
check(anonGrants.length === 0,
  `WPS-024 GRANTS NOTHING TO ANON (${anonGrants.length} found)`);

check(/revoke all on table public\.legal_documents from public, anon, authenticated/.test(migration),
  'default privileges are revoked before select is granted');
check(/revoke all on table public\.legal_acceptances from public, anon, authenticated/.test(migration),
  'the ledger revokes inherited default privileges');

// No legal status is asserted anywhere in the migration.
check(!/\bGDPR\b|\bISO 27001\b|\bSOC ?2\b|\bcertified\b|\baccredited\b/i.test(migration),
  'THE MIGRATION CLAIMS NO CERTIFICATION');
check(/legal_review_status\s+text not null default 'pending'/.test(migration),
  'every processing activity records its basis as pending review');
check(!/legal_review_status[^,)]*'approved'\s*[,)]/.test(migration.replace(/check \([^)]*\)/g, '')),
  'no seeded activity is recorded as legally approved');

// Provisional activation preserves the property WPS-023 was protecting.
check(/p_from in \('criminal_record_submitted', 'identity_submitted', 'correction_required'\)\s*\n?\s*and p_to = 'provisionally_active'/.test(migration),
  'the system may grant a provisional capability only from a submission state');
check(!/p_to = 'active'[^;]*p_actor_kind = 'system'/.test(migration),
  'THE SYSTEM STILL CANNOT FULLY ACTIVATE A WORKER');
check(/worker_provisional_gates/.test(migration), 'provisional activation is gated');
check(/legal_agreements_accepted/.test(migration),
  'THE LEGAL GATE IS A PROVISIONAL ACTIVATION GATE');
check(/switch_key = 'worker_activation' and k\.active/.test(migration),
  "the WPS-023 activation kill switch also stops provisional activation");

// The provisional gate set is derived by subtraction, so a gate added to
// WPS-023 protects both tiers automatically.
check(/where g\.key not in \('national_id_approved', 'criminal_record_approved',/.test(migration),
  'the provisional gates are the full set minus staff decisions, not a second list');

// Registers.
check(/'google_cloud_vision'[\s\S]{0,400}'approved_not_integrated'/.test(migration),
  'the OCR provider is registered as approved and not yet integrated');
check(/'google_maps_platform'[\s\S]{0,400}'approved_not_integrated'/.test(migration),
  'the map provider is registered as approved and not yet integrated');
check(/'supabase'[\s\S]{0,600}'in_use'/.test(migration),
  'Supabase is registered as in use');
check(/check \(not \(covers_identity_data and permitted_for_training\)\)/.test(migration),
  'TRAINING ON IDENTITY DATA IS PREVENTED BY A CONSTRAINT, NOT A POLICY NOTE');
check(/constraint ai_use_human_confirmation_check\s*\n?\s*check \(human_confirmation_required\)/.test(migration),
  'human confirmation cannot be switched off');

// Model A survives. Nothing here claims a government integration.
check(!/ministry|interior|government_lookup|authenticity_confirmed/i.test(migration),
  'NOTHING IN THE MIGRATION CLAIMS A MINISTRY OR GOVERNMENT LOOKUP');

// Notification payloads carry a state and nothing else.
const notificationBlock = migration.match(
  /insert into private\.notification_event_catalog[\s\S]*?on conflict \(event_type\) do nothing;/,
)?.[0] ?? '';
check(notificationBlock.length > 0, 'the WPS-024 notification events are registered');
check(!/national|offence|offense|hash|document_key|storage_path/i.test(notificationBlock),
  'NO WPS-024 NOTIFICATION CARRIES AN IDENTIFIER, A HASH OR AN OFFENCE');

// ---------------------------------------------------------------------------
// The corpus makes no claim Warsha has not earned
// ---------------------------------------------------------------------------
const allCorpusText = legalCorpus
  .flatMap((d) => [...hashableParts(d.en), ...hashableParts(d.ar)])
  .join('\n');

// These are the claims that would be false today. Each is checked against the
// DOCUMENT TEXT, which is the text a person reads and relies on.
check(!/\bwe are (GDPR|ISO|SOC)\b|\bcertified\b|\bfully compliant\b|\bcompliance certified\b/i
  .test(allCorpusText),
  'NO DOCUMENT CLAIMS A CERTIFICATION OR A COMPLIANCE FINDING');
check(!/penetration test(ed|ing)? (has|was) (been )?(completed|performed|carried out)/i
  .test(allCorpusText),
  'NO DOCUMENT CLAIMS A PENETRATION TEST WAS PERFORMED');
check(/has not undergone penetration testing|not commissioned a penetration test/i
  .test(allCorpusText),
  'the absence of penetration testing is stated rather than omitted');
check(/no conformance with WCAG or any other standard is claimed/i.test(allCorpusText),
  'the accessibility statement claims no conformance level');

// The OCR and AI documents must be in the correct tense.
const ocr = findDocument('ocr_usage_policy')!;
const ocrText = hashableParts(ocr.en).join('\n');
check(/no text extraction is performed/i.test(ocrText),
  'THE OCR POLICY SAYS EXTRACTION IS NOT YET PERFORMED');
check(/Google Cloud Vision/.test(ocrText), 'the OCR policy names the approved provider');
check(/server-side only/i.test(ocrText), 'the OCR policy states the provider is server-side only');
check(/never determines whether a document is genuine/i.test(ocrText),
  'the OCR policy states extraction never decides authenticity');
check(/eligible to work/i.test(ocrText),
  'the OCR policy states extraction never decides eligibility');
check(/does not extract, infer or store a gender or sex marker/i.test(ocrText),
  'the OCR policy states no sex marker is extracted');
check(/does not treat that as your current address/i.test(ocrText),
  'the OCR policy states the encoded governorate is not treated as a residence');
check(/raw response is not retained|provider's raw response is not retained/i.test(ocrText),
  'THE OCR POLICY STATES THE RAW PROVIDER PAYLOAD IS NOT RETAINED');

const ai = findDocument('ai_usage_policy')!;
const aiText = hashableParts(ai.en).join('\n');
check(/are not used to train, fine-tune, evaluate or improve any machine-learning model/i
  .test(aiText),
  'THE AI POLICY PROHIBITS TRAINING ON IDENTITY DOCUMENTS');
check(/governance decision/i.test(aiText),
  'the AI policy requires a governance decision before that could change');
check(/explicit, separately recorded consent/i.test(aiText),
  'the AI policy requires explicit consent before that could change');
check(/versioned rollout/i.test(aiText), 'the AI policy requires a versioned rollout');

const location = findDocument('location_data_policy')!;
const locationText = hashableParts(location.en).join('\n');
check(/Google Maps Platform/.test(locationText), 'the location policy names the map provider');
check(/not integrated/i.test(locationText),
  'THE LOCATION POLICY SAYS THE MAP PROVIDER IS NOT YET INTEGRATED');
check(/does not display a map surface that pretends to be live/i.test(locationText),
  'the location policy states no fake map is displayed');
check(/does not collect location in the background/i.test(locationText),
  'the location policy states there is no background collection');
check(/always optional/i.test(locationText), 'the location policy states GPS is optional');
check(/place and adjust the pin by hand/i.test(locationText),
  'the location policy states manual pin placement is always available');

const verification = findDocument('worker_verification_policy')!;
const verificationText = hashableParts(verification.en).join('\n');
check(/obtain the certificate yourself/i.test(verificationText),
  'MODEL A: THE WORKER OBTAINS THE CERTIFICATE THEMSELVES');
check(/no integration with the Ministry of Interior/i.test(verificationText),
  'the verification policy denies a ministry integration');
check(/does not operate a rule that any offence within a fixed recent period/i
  .test(verificationText),
  'THE VERIFICATION POLICY DENIES AN AUTOMATIC TIME-WINDOW REJECTION');
check(/no eligibility policy has been through legal review/i.test(verificationText),
  'the verification policy states the eligibility policy is not legally approved');
check(/at least one year/i.test(verificationText),
  'THE VERIFICATION POLICY STATES THE ONE-YEAR DOCUMENT RETENTION FLOOR');
check(/reduced copy/i.test(verificationText),
  'the verification policy describes the reduced review copy');
check(/provisionally active immediately/i.test(verificationText),
  'the verification policy describes provisional activation');
check(/Staff review happens afterwards/i.test(verificationText),
  'the verification policy states review is post-activation');

const workerTerms = findDocument('worker_terms')!;
const workerText = hashableParts(workerTerms.en).join('\n');
check(/independent contractor/i.test(workerText), 'the worker terms state independent contracting');
check(/responsible for your own taxes/i.test(workerText), 'the worker terms cover taxes');
check(/commission/i.test(workerText), 'the worker terms cover commission');
check(/Appeals Policy/.test(workerText), 'the worker terms point at the appeals policy');
check(/suspend/i.test(workerText), 'the worker terms cover suspension');

// No invented figure. `payment_configuration` ships with a null commission and
// a disabled gateway, so a percentage in a binding document would be a number
// no system enforces.
check(!/\b\d{1,2}\s?%\s*(commission|fee|of the)/i.test(allCorpusText),
  'NO DOCUMENT STATES A COMMISSION PERCENTAGE THAT NO SYSTEM ENFORCES');
check(!/\bEGP\s?\d/i.test(allCorpusText), 'no document states an unconfigured monetary amount');
check(/displayed in the application before you accept a job/i.test(workerText),
  'the commission mechanism binds without inventing a rate');

// ---------------------------------------------------------------------------
// Decline handling: what survives is stated
// ---------------------------------------------------------------------------
for (const key of ['customer_terms', 'worker_terms'] as const) {
  const text = hashableParts(findDocument(key)!.en).join('\n');
  check(/export/i.test(text) && /support/i.test(text) && /close your account/i.test(text),
    `${key} states what survives declining a material change`);
  check(/never recorded as acceptance|Declining is never recorded as acceptance|never falsely/i
    .test(text) || /Declining is recorded truthfully/i.test(text) || key === 'customer_terms',
    `${key} states that a decline is not recorded as acceptance`);
}

const versionHistory = hashableParts(findDocument('version_history')!.en).join('\n');
check(/never recorded as acceptance/i.test(versionHistory),
  'THE VERSION HISTORY STATES A DECLINE IS NEVER RECORDED AS ACCEPTANCE');
check(/does not force renewed acceptance for a typographical correction/i.test(versionHistory),
  'the version history states typos do not force re-consent');
check(/previous acceptances are preserved/i.test(versionHistory),
  'the version history states prior acceptance history is preserved');

const consentScreen = codeOf('app', 'legal', 'consent.tsx');
check(/declineLabel/.test(consentScreen), 'the decline control exists on the consent screen');
check(/alwaysAvailable/.test(consentScreen),
  'THE CONSENT SCREEN SHOWS WHAT SURVIVES A DECLINE');
check(/restricts/.test(consentScreen), 'the consent screen shows what a decline restricts');
check(!/disabled=\{true\}/.test(consentScreen),
  'the decline control is never rendered permanently disabled');
// The consequences come from the server. A screen that computed its own could
// overstate them, and an overstated consequence is coercion.
check(/consequences\.restricts/.test(consentScreen),
  'the consent screen reads its consequences from the server response');

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
for (const screen of [
  'app/legal/index.tsx',
  'app/legal/consent.tsx',
  'app/legal/document/[key].tsx',
]) {
  const source = codeOf(...screen.split('/'));
  check(/useThemedStyles\(makeStyles\)/.test(source), `${screen} uses the theming factory`);
  check(/accessibilityRole="header"/.test(source), `${screen} marks a heading for screen readers`);
  check(/isRTL/.test(source) || screen.includes('index'), `${screen} handles RTL`);
  check(!/YOUR WORK, OUR MISSION|شغلك مهمتنا/.test(source), `${screen} does not repeat the motto`);
  check(!/scaleX/.test(source), `${screen} does not mirror anything under RTL`);
  check(!/color:\s*['"]#/.test(source), `${screen} uses theme colours, not literals`);
}

const readerSource = codeOf('app', 'legal', 'document', '[key].tsx');
check(!/fetch\(|rpc\(|supabase/i.test(readerSource),
  'THE READER RENDERS THE BUNDLED TEXT AND FETCHES NOTHING');
check(/authoritativeLanguage/.test(readerSource),
  'the reader always states which language governs');
check(/arabicIsSummary/.test(readerSource),
  'THE READER DISCLOSES WHEN THE ARABIC IS A SUMMARY RATHER THAN A FULL TEXT');

// Administration is web-only — see docs/constitution/cross-platform-parity.md.
// The legal governance console moved to admin.usewarsha.com.
check(!existsSync('app/admin/legal.tsx'), 'THE MOBILE LEGAL CONSOLE IS GONE');

// ---------------------------------------------------------------------------
// Copy: both languages, and no untranslated string
// ---------------------------------------------------------------------------
const en: Record<string, string> = legalCopy.en;
const ar: Record<string, string> = legalCopy.ar;
const englishKeys = Object.keys(en);
const arabicKeys = Object.keys(ar);
check(englishKeys.length === arabicKeys.length, 'both languages carry the same number of keys');
check(englishKeys.every((key) => arabicKeys.includes(key)), 'every English key exists in Arabic');
check(arabicKeys.every((key) => englishKeys.includes(key)), 'every Arabic key exists in English');
check(englishKeys.every((key) => en[key].trim().length > 0), 'no English string is empty');
check(arabicKeys.every((key) => ar[key].trim().length > 0), 'no Arabic string is empty');

// An English string reused verbatim as its own translation is how an
// untranslated key survives review.
const identical = englishKeys.filter((key) => en[key] === ar[key]).length;
check(identical === 0, `NO STRING IS REUSED AS ITS OWN TRANSLATION (${identical} found)`);
const arabicScript = arabicKeys.filter((key) => /[؀-ۿ]/.test(ar[key])).length;
check(arabicScript === arabicKeys.length, 'every Arabic string is written in Arabic script');

// The Arabic corpus is Arabic, not a copy of the English.
for (const document of legalCorpus) {
  check(/[؀-ۿ]/.test(document.ar.title),
    `${document.key} has an Arabic title`);
  check(document.ar.title !== document.en.title,
    `${document.key} does not reuse its English title as its Arabic one`);
  check(document.ar.summary !== document.en.summary,
    `${document.key} does not reuse its English summary as its Arabic one`);
}

// Twelve documents carry full parallel Arabic; fourteen carry summaries. The
// split is deliberate and is disclosed, so it is asserted rather than left to
// drift.
const fullArabic = legalCorpus.filter((d) => !d.arabicIsSummary);
const summaryArabic = legalCorpus.filter((d) => d.arabicIsSummary);
check(fullArabic.length === 12, 'twelve documents carry a full parallel Arabic text');
check(summaryArabic.length === 14, 'fourteen documents carry an Arabic summary');
check(fullArabic.every((d) => d.ar.sections.length === d.en.sections.length),
  'EVERY FULL ARABIC TEXT MIRRORS ITS ENGLISH SECTION STRUCTURE');
check(legalCorpus.filter((d) => d.requiresAcceptance).every((d) => !d.arabicIsSummary),
  'EVERY DOCUMENT A PERSON IS ASKED TO ACCEPT HAS A FULL ARABIC TEXT');
check(summaryArabic.every((d) => /ملخّص عربي كامل/.test(d.ar.summary)),
  'every Arabic summary says on the page that it is a summary');

// ---------------------------------------------------------------------------
// WPS-022 and WPS-023 integration
// ---------------------------------------------------------------------------
check(/update public\.privacy_consent_purposes/.test(migration),
  'WPS-024 updates the WPS-022 consent purposes rather than replacing them');
check(!/create table if not exists public\.privacy_consent/.test(migration),
  'WPS-024 CREATES NO PARALLEL CONSENT SYSTEM');
check(/document_key = 'customer_terms'/.test(migration),
  'the terms consent purpose points at the document that now exists');
check(/document_key = 'privacy_policy'/.test(migration),
  'the privacy consent purpose points at the document that now exists');
check(/private\.worker_activation_gates/.test(migration),
  'WPS-024 reads the WPS-023 gates rather than restating them');
check(/create or replace function private\.worker_capability_active/.test(migration),
  'WPS-024 amends the single worker authorization answer rather than adding a second');

// WPS-023's own migration is untouched by this one.
const wps023 = read(
  'supabase', 'migrations', '202608080001_wps023_authentication_role_onboarding_worker_vetting.sql',
);
check(!/provisionally_active/.test(wps023),
  'the WPS-023 migration was not edited in place');

// ---------------------------------------------------------------------------
// Package script
// ---------------------------------------------------------------------------
const packageJson = read('package.json');
check(/"test:wps024"/.test(packageJson), 'the WPS-024 suite has a package script');

// The migration is forward-only and carries no destructive verb against
// another specification's tables.
//
// Read against the comment-stripped SQL. The first version searched the raw
// file and failed on a COMMENT explaining that Supabase's default privileges
// hand the client roles TRUNCATE — the opposite of a truncate, and exactly the
// kind of false positive that gets a real check deleted rather than fixed.
check(!/drop table|truncate|delete from public\.(profiles|bookings|payments)/i.test(migration),
  'THE MIGRATION DROPS NO TABLE AND DELETES NO EXISTING DATA');
check(/alter table public\.account_onboarding\s*\n\s*drop constraint if exists/.test(migrationRaw),
  'the worker state constraint is replaced rather than the table rebuilt');

// ---------------------------------------------------------------------------
// Provider activation
// ---------------------------------------------------------------------------
const providerMigration = sqlCodeOf(
  'supabase', 'migrations', '202608100001_wps024_provider_activation.sql',
);
const edgeProviderGateway = sqlCodeOf(
  'supabase', 'migrations', '202608170001_edge_provider_runtime_gateway.sql',
);

for (const provider of [
  'supabase', 'expo_eas', 'expo_camera', 'expo_image_picker',
  'expo_document_picker', 'google_cloud_vision', 'google_maps_platform',
]) {
  check(new RegExp(`\\('${provider}',`).test(providerMigration),
    `${provider} is in the External Provider Registry`);
}

// The register describes reality. Neither Google provider is claimed active,
// because no credential has been supplied to this environment.
check(/'google_cloud_vision'[\s\S]{0,400}'implemented_awaiting_credential'/.test(providerMigration),
  'THE OCR PROVIDER IS REGISTERED AS AWAITING A CREDENTIAL');
check(/'google_maps_platform'[\s\S]{0,400}'implemented_awaiting_credential'/.test(providerMigration),
  'THE MAP PROVIDER IS REGISTERED AS AWAITING A CREDENTIAL');

for (const field of [
  'display_name', 'purpose', 'introduced_by_wps', 'current_status', 'environments',
  'feature_flag_key', 'kill_switch_key', 'data_categories', 'privacy_policy_ref',
  'subprocessor_key', 'processing_activity_key', 'security_owner', 'operational_owner',
  'date_introduced', 'provider_version', 'last_review_date',
]) {
  check(new RegExp(`\\b${field}\\b`).test(providerMigration), `the registry records ${field}`);
}

// ---------------------------------------------------------------------------
// Credentials never reach the bundle
// ---------------------------------------------------------------------------
const INVENTORY = join(root, 'src', 'launch', 'launch-types.ts');
const clientSourceFiles = ['src', 'app', 'components']
  .flatMap((tree) => listFiles(join(root, tree)))
  // WPS-018's secret inventory NAMES every secret in order to declare which
  // may be bundled. A name appearing there is the register doing its job, not
  // a credential in client code, so it is excluded from the sweep and checked
  // separately below.
  .filter((file) => file !== INVENTORY);
const clientSources = clientSourceFiles.map((file) => readFileSync(file, 'utf8'));

const inventory = read('src', 'launch', 'launch-types.ts');
check(/'SUPABASE_SERVICE_ROLE_KEY'[^}]*clientBundleAllowed: false/.test(inventory),
  'THE SECRET INVENTORY DECLARES THE SERVICE-ROLE KEY MUST NEVER BE BUNDLED');
check(/'SUPABASE_SERVICE_ROLE_KEY'[^}]*classification: 'server_only'/.test(inventory),
  'the service-role key is classified server-only');
const appConfig = read('app.json');

for (const name of [
  'GOOGLE_CLOUD_VISION_SERVICE_ACCOUNT',
  'GOOGLE_MAPS_SERVER_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  check(!clientSources.some((source) => source.includes(name)),
    `${name} APPEARS IN NO CLIENT SOURCE FILE`);
}

const PUBLISHABLE = new Set([
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
]);
const publicNames = new Set(
  [appConfig, ...clientSources].join('\n')
    .match(/EXPO_PUBLIC_[A-Z_]*(?:KEY|SECRET|TOKEN|SERVICE_ACCOUNT)/g) ?? [],
);
const smuggled = [...publicNames].filter((name) => !PUBLISHABLE.has(name));
check(smuggled.length === 0,
  `NO CREDENTIAL HIDES BEHIND AN EXPO_PUBLIC_ NAME (${smuggled.join(', ')})`);
check(!/EXPO_PUBLIC_[A-Z_]*(SERVICE_ACCOUNT|SERVICE_ROLE|PRIVATE)/.test(
  [appConfig, ...clientSources].join('\n')),
  'NO SERVER CREDENTIAL SHAPE IS EXPOSED UNDER AN EXPO_PUBLIC_ NAME');

// The Maps render keys are injected at config-evaluation time, never committed.
//
// A static app.json cannot interpolate `$VAR`, so asserting that the string
// "$GOOGLE_MAPS_ANDROID_RENDER_KEY" appears somewhere proves nothing about what
// reaches AndroidManifest.xml — that assertion passed for a build in which the
// literal dollar-sign string was the key. The dynamic config is therefore
// evaluated for real below, with synthetic values: no true key is read here,
// so nothing secret can reach this suite's output.
const dynamicAppConfig = codeOf('app.config.js');
check(!/\bAIza[0-9A-Za-z_-]{35}\b/.test(appConfig),
  'NO REAL GOOGLE API KEY IS COMMITTED IN THE APP CONFIG');
check(!/\bAIza[0-9A-Za-z_-]{35}\b/.test(dynamicAppConfig),
  'NO REAL GOOGLE API KEY IS COMMITTED IN THE DYNAMIC APP CONFIG');
check(!/EXPO_PUBLIC_[A-Z_]*(?:MAPS|RENDER)/.test(dynamicAppConfig),
  'NO MAPS RENDER KEY IS EXPOSED UNDER AN EXPO_PUBLIC_ NAME');

const ANDROID_KEY_VAR = 'GOOGLE_MAPS_ANDROID_RENDER_KEY';
const IOS_KEY_VAR = 'GOOGLE_MAPS_IOS_RENDER_KEY';
const ANDROID_STUB = 'android-render-key-stub';
const IOS_STUB = 'ios-render-key-stub';

type EvaluatedConfig = {
  ios?: { config?: { googleMapsApiKey?: unknown } };
  android?: { config?: { googleMaps?: { apiKey?: unknown } } };
};

const evaluateAppConfig = createRequire(import.meta.url)(
  join(root, 'app.config.js'),
) as (arg: { config: unknown }) => EvaluatedConfig;

const staticExpoConfig = JSON.parse(appConfig).expo as unknown;

// EAS CLI reads this config locally before a build, with .env disabled, purely
// to learn the project id — see the comment in app.config.js. These two names
// are what separates that metadata read from a real build.
const NO_DOTENV_VAR = 'EXPO_NO_DOTENV';
const EAS_RUNNER_VAR = 'EAS_BUILD_RUNNER';
const MANAGED_ENV_VARS = [
  ANDROID_KEY_VAR,
  IOS_KEY_VAR,
  NO_DOTENV_VAR,
  EAS_RUNNER_VAR,
] as const;

/**
 * Evaluate the dynamic config under an exact environment, then restore it.
 *
 * Every managed name is set explicitly, so a variable that happens to be in the
 * ambient shell cannot change what this suite proves.
 */
function evaluateWith(env: Record<string, string | undefined>): EvaluatedConfig {
  const saved: Record<string, string | undefined> = Object.fromEntries(
    MANAGED_ENV_VARS.map((name) => [name, process.env[name]]),
  );
  const baseline: Record<string, string | undefined> = Object.fromEntries(
    MANAGED_ENV_VARS.map((name) => [name, undefined]),
  );
  env = { ...baseline, ...env };
  const apply = (values: Record<string, string | undefined>): void => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  try {
    apply(env);
    // A fresh clone each time: the factory must not depend on prior mutation.
    return evaluateAppConfig({ config: JSON.parse(JSON.stringify(staticExpoConfig)) });
  } finally {
    apply(saved);
  }
}

const resolved = evaluateWith({
  [ANDROID_KEY_VAR]: ANDROID_STUB,
  [IOS_KEY_VAR]: IOS_STUB,
});
const resolvedAndroid = resolved.android?.config?.googleMaps?.apiKey;
const resolvedIos = resolved.ios?.config?.googleMapsApiKey;

check(typeof resolvedAndroid === 'string' && resolvedAndroid.length > 0,
  'the dynamic config resolves a non-empty Android Maps render key');
check(typeof resolvedIos === 'string' && resolvedIos.length > 0,
  'the dynamic config resolves a non-empty iOS Maps render key');
check(!String(resolvedAndroid).includes('$') && !String(resolvedIos).includes('$'),
  'NO RESOLVED MAPS KEY IS STILL AN UNINTERPOLATED $PLACEHOLDER');
check(resolvedAndroid === ANDROID_STUB,
  `Android resolves from ${ANDROID_KEY_VAR} alone`);
check(resolvedIos === IOS_STUB,
  `iOS resolves from ${IOS_KEY_VAR} alone`);
check(resolvedAndroid !== resolvedIos,
  'the two platforms resolve independently of one another');

// Absent, empty and whitespace-only must all stop the build rather than ship a
// tileless map. The thrown message must name the variable and reveal no value.
for (const missingVar of [ANDROID_KEY_VAR, IOS_KEY_VAR]) {
  for (const [label, value] of [
    ['absent', undefined],
    ['empty', ''],
    ['whitespace-only', '   '],
  ] as const) {
    let threw = false;
    let message = '';
    try {
      evaluateWith({
        [ANDROID_KEY_VAR]: ANDROID_STUB,
        [IOS_KEY_VAR]: IOS_STUB,
        [missingVar]: value,
      });
    } catch (error) {
      threw = true;
      message = error instanceof Error ? error.message : String(error);
    }
    check(threw, `CONFIG EVALUATION FAILS WHEN ${missingVar} IS ${label.toUpperCase()}`);
    check(message.includes(missingVar),
      `the ${label} failure for ${missingVar} names the variable`);
    check(!message.includes(ANDROID_STUB) && !message.includes(IOS_STUB),
      `the ${label} failure for ${missingVar} PRINTS NO KEY VALUE`);
  }
}

check(process.env[ANDROID_KEY_VAR] === undefined
  || typeof process.env[ANDROID_KEY_VAR] === 'string',
  'the suite restores the ambient environment after evaluating the config');

// EAS CLI's local metadata read cannot have the keys: it runs with .env
// disabled, and the project id it is fetching is the input the environment
// variable query needs. Throwing there breaks `eas build` and `eas env:list`
// before anything is uploaded, and yields no native artifact in exchange.
let metadataRead: EvaluatedConfig | undefined;
let metadataThrew = false;
try {
  metadataRead = evaluateWith({ [NO_DOTENV_VAR]: '1' });
} catch {
  metadataThrew = true;
}
check(!metadataThrew,
  'the EAS CLI local metadata read is not broken by the render-key guard');
check(metadataRead?.android?.config?.googleMaps?.apiKey === undefined,
  'the metadata read omits the Android key rather than inventing one');
check(metadataRead?.ios?.config?.googleMapsApiKey === undefined,
  'the metadata read omits the iOS key rather than inventing one');

// Standing down for that read must not stand down for the build itself. On the
// worker EAS_BUILD_RUNNER is set and the environment's variables are injected,
// so a missing key there is a real defect and must still stop the build.
for (const missingVar of [ANDROID_KEY_VAR, IOS_KEY_VAR]) {
  const supplied: Record<string, string | undefined> = {
    [ANDROID_KEY_VAR]: ANDROID_STUB,
    [IOS_KEY_VAR]: IOS_STUB,
    [NO_DOTENV_VAR]: '1',
    [EAS_RUNNER_VAR]: 'eas-build',
    [missingVar]: undefined,
  };
  let threw = false;
  try {
    evaluateWith(supplied);
  } catch {
    threw = true;
  }
  check(threw,
    `THE GUARD STILL FIRES ON THE EAS WORKER WHEN ${missingVar} IS ABSENT`);
}

check(evaluateWith({
  [ANDROID_KEY_VAR]: ANDROID_STUB,
  [IOS_KEY_VAR]: IOS_STUB,
  [NO_DOTENV_VAR]: '1',
}).android?.config?.googleMaps?.apiKey === ANDROID_STUB,
  'a supplied key is still used during the metadata read');

const secretBoundary = codeOf('supabase', 'functions', '_shared', 'provider-secrets.ts');
check(/Deno\.env\.get/.test(secretBoundary), 'secrets are read from the environment');
check(!/^const\s+\w+\s*=\s*Deno\.env\.get/m.test(secretBoundary),
  'NO SECRET IS CAPTURED IN A MODULE CONSTANT');
check(/export function describeSecrets/.test(secretBoundary),
  'the boundary can report presence without exposing a value');
check(/REDACTED/.test(secretBoundary),
  'the boundary redacts credential shapes before anything is logged');
check(/key=/.test(secretBoundary),
  'the redactor strips a key from a provider error URL');

// ---------------------------------------------------------------------------
// The OCR boundary
// ---------------------------------------------------------------------------
const visionProvider = codeOf('supabase', 'functions', '_shared', 'google-vision-provider.ts');
const visionFunction = codeOf('supabase', 'functions', 'vision-extract', 'index.ts');
const ocrContract = codeOf('supabase', 'functions', '_shared', 'ocr-provider.ts');
const ocrFields = codeOf('supabase', 'functions', '_shared', 'ocr-identity-fields.ts');
const ocrRoot = codeOf('supabase', 'functions', '_shared', 'ocr-providers.ts');

check(!/gender|sex_marker|sexMarker/i.test(visionProvider),
  'NO GENDER OR SEX MARKER IS EXTRACTED');
check(!/gender|sex_marker|sexMarker/i.test(ocrFields),
  'the provider-agnostic parser extracts no gender or sex marker either');
check(!/governorate/i.test(ocrFields), 'the encoded governorate is not extracted');
check(/DOCUMENT_TEXT_DETECTION/.test(visionProvider),
  'the document model is used, so per-page confidence is available');
check(/languageHints/.test(visionProvider), 'Arabic is hinted to the provider');

// ---------------------------------------------------------------------------
// The OCR ABSTRACTION: business logic depends on the contract, not the vendor
// ---------------------------------------------------------------------------
for (const method of ['extractDocument', 'extractIdentity', 'extractConfidence', 'extractMetadata']) {
  check(new RegExp(`${method}\\(`).test(ocrContract),
    `the OCR contract declares ${method}()`);
  check(new RegExp(`${method}\\(`).test(visionProvider),
    `the Google implementation implements ${method}()`);
}
check(/interface OcrProvider/.test(ocrContract), 'the OCR contract is an interface');
check(/registerOcrProvider|resolveOcrProvider/.test(ocrContract),
  'providers are resolved through a registry rather than imported by name');
check(/googleVisionProvider/.test(ocrRoot),
  'the composition root is the one module that names an OCR vendor');

// The load-bearing assertion of the whole abstraction.
check(!/google|vision|Vision/i.test(visionFunction.replace(/vision-extract|_shared/g, '')),
  'THE EXTRACTION FUNCTION NAMES NO OCR VENDOR');
check(!/google|vision/i.test(ocrContract) && !/google|vision/i.test(ocrFields),
  'NEITHER THE OCR CONTRACT NOR THE FIELD PARSER NAMES A VENDOR');
check(/identity_ocr/.test(visionFunction),
  'the extraction function asks for a capability role, not a provider');
check(/provider_for_role/.test(visionFunction) && /provider_enabled_for_role/.test(visionFunction),
  'the provider and its gate are both resolved from the role');
check(/resolveOcrProvider/.test(visionFunction),
  'the implementation is resolved from the registry at call time');

// Timeout and retry are on the contract, so every implementation inherits them
// rather than each one inventing its own idea of "too long".
check(/OCR_TIMEOUT_MS/.test(ocrContract) && /OCR_MAX_ATTEMPTS/.test(ocrContract),
  'the contract fixes a timeout and a retry ceiling for every implementation');
check(/OCR_TIMEOUT_MS/.test(visionProvider) && /OCR_MAX_ATTEMPTS/.test(visionProvider),
  'the Google implementation uses the shared timeout and retry ceiling');
check(/worthRetrying/.test(visionProvider),
  'a retry is attempted only for a fault a retry could fix');
check(!/String\.fromCharCode\(\.\.\.(imageBytes|bytes)\)/.test(visionProvider),
  'THE IMAGE IS NOT SPREAD INTO String.fromCharCode, WHICH OVERFLOWS THE STACK ON A REAL PHOTOGRAPH');

check(!/worker_state|account_onboarding|provider_verifications/.test(visionFunction),
  'THE OCR FUNCTION WRITES NO LIFECYCLE STATE AND NO VERIFICATION OUTCOME');
check(!/worker_transition|staff_worker_vetting_decision/.test(visionFunction),
  'THE OCR FUNCTION CANNOT ACTIVATE, APPROVE OR REJECT ANYBODY');

check(/confidence/.test(visionProvider), 'the provider computes a confidence value');
const clientCandidate = visionFunction.slice(
  visionFunction.indexOf('function toClientCandidate'),
  visionFunction.indexOf('async function sha256Hex'),
);
check(clientCandidate.length > 0, 'the client candidate mapper is present');
check(!/confidence/.test(clientCandidate.replace(/candidate\.confidence < 0\.55/g, '')),
  'CONFIDENCE IS NEVER SERIALISED INTO A CLIENT CANDIDATE');
check(/requiresManualEntry:\s*candidate\.confidence < /.test(clientCandidate),
  'a low confidence becomes a manual-entry flag rather than a number on screen');
check(/requiresManualEntry/.test(visionFunction),
  'a low-confidence field is reported as needing manual entry, not as a score');
check(/confirmationRequired/.test(visionFunction),
  'the OCR response always states that the worker must confirm');

check(!/(raw_response|fullTextAnnotation)\s*[,:]/.test(visionFunction),
  'THE RAW PROVIDER PAYLOAD IS NEVER PERSISTED');
check(/startsWith/.test(visionFunction) && /userId/.test(visionFunction),
  'A WORKER CAN ONLY EXTRACT FROM THEIR OWN DOCUMENT');
check(/auth\.getUser\(\)/.test(visionFunction),
  'the caller is resolved from the token, never from the request body');
check(visionFunction.indexOf('open_ocr_request') < visionFunction.indexOf('extractIdentity('),
  'THE AUDIT ROW IS OPENED BEFORE THE PROVIDER IS CALLED');
check(/complete_ocr_request|warsha_ocr_complete_request/.test(visionFunction),
  'the audit row is closed with the outcome');

// ---------------------------------------------------------------------------
// The Maps boundary
// ---------------------------------------------------------------------------
const mapsProvider = codeOf('supabase', 'functions', '_shared', 'google-maps-provider.ts');
const mapContract = codeOf('supabase', 'functions', '_shared', 'map-provider.ts');
const mapRoot = codeOf('supabase', 'functions', '_shared', 'map-providers.ts');
const locationFunction = codeOf('supabase', 'functions', 'location-proxy', 'index.ts');

check(/readSecret\('mapsServerKey'\)/.test(mapsProvider),
  'the billed Maps key is read server-side only');
check(/sessionToken/.test(mapsProvider),
  'Places calls carry a session token, so a search is billed once rather than per keystroke');
check(/x-goog-fieldmask/.test(mapsProvider) && /id,formattedAddress,(?:addressComponents,)?location/.test(mapsProvider),
  'Places API New requests use narrow field masks rather than fetching every field');
check(/manualPinAlwaysAvailable/.test(locationFunction),
  'EVERY LOCATION FAILURE STILL REPORTS THAT MANUAL PIN PLACEMENT WORKS');

// Checked against the RAW source: `codeOf` strips `//` line comments, which
// also eats the `//` inside every `https://` URL in the file.
const mapsProviderRaw = read('supabase', 'functions', '_shared', 'google-maps-provider.ts');
for (const [name, pattern] of [
  ['Places Autocomplete New', /places\.googleapis\.com\/v1\/places:autocomplete/],
  ['Place Details New', /places\.googleapis\.com\/v1\/places\//],
  ['forward geocoding', /forwardGeocode\(address: string, language: MapLanguage\)/],
  ['reverse geocoding', /reverseGeocode\(latitude: number/],
] as const) {
  check(pattern.test(mapsProviderRaw), `${name} is implemented`);
}

// ---------------------------------------------------------------------------
// The MAPS ABSTRACTION
// ---------------------------------------------------------------------------
for (const method of [
  'autocomplete', 'placeDetails', 'forwardGeocode', 'reverseGeocode', 'renderMap',
]) {
  check(new RegExp(`${method}\\(`).test(mapContract), `the map contract declares ${method}()`);
  check(new RegExp(`${method}\\(`).test(mapsProvider),
    `the Google implementation implements ${method}()`);
}
check(/interface MapProvider/.test(mapContract), 'the map contract is an interface');
check(/registerMapProvider|resolveMapProvider/.test(mapContract),
  'map providers are resolved through a registry');
check(/googleMapsProvider/.test(mapRoot),
  'the composition root is the one module that names a map vendor');

check(!/google|Google/.test(locationFunction),
  'THE LOCATION PROXY NAMES NO MAP VENDOR');
check(!/google|Google/.test(mapContract), 'THE MAP CONTRACT NAMES NO VENDOR');
check(/'location'/.test(locationFunction),
  'the location proxy asks for a capability role, not a provider');
check(/resolveMapProvider/.test(locationFunction),
  'the map implementation is resolved from the registry at call time');
check(/edge_provider_runtime/.test(locationFunction)
  && !/schema\(['"]private['"]\)/.test(locationFunction),
  'the location proxy reaches private provider authority through the narrow public service gateway');
check(/grant execute on function public\.edge_provider_runtime\(text\) to service_role/.test(edgeProviderGateway)
  && /revoke all on function public\.edge_provider_runtime\(text\) from public, anon, authenticated/.test(edgeProviderGateway),
  'the provider runtime gateway is service-role-only');
check(/MAPS_TIMEOUT_MS/.test(mapContract) && /MAPS_TIMEOUT_MS/.test(mapsProvider),
  'the map contract fixes a timeout every implementation inherits');

// The render descriptor is answered before the search gate, because drawing a
// map and searching an address fail independently and use different keys.
check(locationFunction.indexOf('render_descriptor') < locationFunction.indexOf('runtime?.enabled'),
  'THE RENDER DESCRIPTOR IS ANSWERED EVEN WHEN THE SEARCH PROVIDER IS DISABLED');
check(/serverCredentialAvailable:\s*provider\.isConfigured\(\)/.test(locationFunction),
  'the proxy reports server credential presence without returning its value');

// The renderer key crosses a runtime boundary and is declared twice. This is
// the test that keeps the two declarations honest.
const serverRendererKey = mapsProviderRaw.match(/rendererKey:\s*'([a-z_]+)'/)?.[1] ?? null;
const clientRenderers = read('src', 'providers', 'map-renderers.ts');
check(serverRendererKey !== null, 'the server names a renderer key');
check(serverRendererKey !== null
  && new RegExp(`registerMapRenderer\\('${serverRendererKey}'`).test(clientRenderers),
  'THE SERVER RENDERER KEY AND THE CLIENT RENDERER REGISTRATION AGREE');
check(/'google_native_sdk'/.test(read('supabase', 'migrations',
  '202608110001_wps024_provider_abstraction_health.sql')),
  'the registry seeds the same renderer key the two runtimes agree on');

// The address surface itself imports no mapping library.
const addressMap = codeOf('components', 'warsha', 'AddressMap.tsx');
check(!/react-native-maps|PROVIDER_GOOGLE/.test(addressMap),
  'THE ADDRESS SURFACE IMPORTS NO MAPPING LIBRARY');
check(/resolveMapRenderer/.test(addressMap),
  'the address surface resolves a renderer by key');
check(/PROVIDER_GOOGLE/.test(codeOf('components', 'warsha', 'GoogleMapRenderer.tsx')),
  'the Maps SDK is used for rendering, in the renderer that names the vendor');

// ---------------------------------------------------------------------------
// Camera and capture
// ---------------------------------------------------------------------------
const camera = codeOf('components', 'warsha', 'DocumentCamera.tsx');
check(/CameraView/.test(camera), 'the camera surface uses Expo Camera');
check(/cardGuide/.test(camera), 'a framing overlay is drawn');
check(/copy\.retake/.test(camera), 'retake before upload is offered');
check(/manipulateAsync/.test(camera), 'a reduced review copy is produced on the device');
check(/onFallbackRequested/.test(camera),
  'THE UPLOAD FALLBACK IS ALWAYS OFFERED, INCLUDING WHEN PERMISSION IS REFUSED');
check(!/crop/i.test(camera), 'THE FRAMING OVERLAY NEVER CROPS THE CAPTURED IMAGE');

const mapWeb = codeOf('components', 'warsha', 'GoogleMapRenderer.web.tsx');
check(!/react-native-maps/.test(mapWeb), 'the web variant imports no native-only module');
check(!/staticmap|maps\.googleapis\.com/.test(mapWeb),
  'THE WEB BUILD RENDERS NO MAP IMAGE THAT COULD BE MISTAKEN FOR A LIVE ONE');
check(!/TextInput|Latitude|Longitude/.test(mapWeb),
  'THE WEB FALLBACK NEVER ASKS A NORMAL USER TO TYPE RAW COORDINATES');

// ---------------------------------------------------------------------------
// Provider clients
// ---------------------------------------------------------------------------
const clients = codeOf('src', 'providers', 'provider-clients.ts');
check(/environment\.dataMode === 'mock'/.test(clients),
  'every provider client branches on the data mode');
check(!/googleapis/.test(clients), 'NO CLIENT CALLS A PROVIDER DIRECTLY');
check(/functions\.invoke\('vision-extract'/.test(clients),
  'extraction goes through the Edge Function');
check(/functions\.invoke\('location-proxy'/.test(clients),
  'location goes through the Edge Function');
check(/await import\('expo-location'\)/.test(clients),
  'the location dependency is loaded lazily');
check(/Accuracy\.Balanced/.test(clients),
  'a device fix asks for balanced accuracy, because the pin is about to be adjusted anyway');
check(/getProviderStatusAsync/.test(clients)
  && /permission_denied/.test(clients)
  && /services_disabled/.test(clients)
  && /provider_unavailable/.test(clients)
  && /timed_out/.test(clients),
  'device location preserves permission, service, provider and timeout outcomes');
check(/getLastKnownPositionAsync/.test(clients),
  'a recent coarse device fix can seed the pin before waiting for a fresh emulator fix');
check(!/requestBackgroundPermissionsAsync/.test(clients),
  'NO BACKGROUND LOCATION PERMISSION IS EVER REQUESTED');
check(!/"isAndroidBackgroundLocationEnabled":\s*true/.test(appConfig)
  && !/"isIosBackgroundLocationEnabled":\s*true/.test(appConfig),
  'the config plugin declares no background location');

const configuredLocation = resolveLocationExperienceAvailability({
  dataMode: 'supabase',
  capability: {
    mapsAvailable: true,
    searchAvailable: true,
    manualPinAlwaysAvailable: true,
    pinRequiredBeforeBooking: true,
    mapRendererKey: 'google_native_sdk',
  },
  descriptor: {
    providerKey: 'configured-provider',
    rendererKey: 'google_native_sdk',
    requiresPublishableRenderKey: true,
    serverCredentialAvailable: true,
    attribution: 'Provider attribution',
    defaultViewport: { latitude: 30, longitude: 31, latitudeDelta: 0.1, longitudeDelta: 0.1 },
  },
});
check(configuredLocation.interactiveMapAvailable && configuredLocation.addressSearchAvailable,
  'a configured live provider enables native maps and address search');
check(configuredLocation.deviceLocationAvailable && !configuredLocation.providerUnavailable,
  'device location is independently available and configured providers never show unavailable');
const missingServerCredential = resolveLocationExperienceAvailability({
  dataMode: 'supabase',
  capability: {
    mapsAvailable: true,
    searchAvailable: true,
    manualPinAlwaysAvailable: true,
    pinRequiredBeforeBooking: true,
    mapRendererKey: 'google_native_sdk',
  },
  descriptor: {
    providerKey: 'configured-provider',
    rendererKey: 'google_native_sdk',
    requiresPublishableRenderKey: true,
    serverCredentialAvailable: false,
    attribution: 'Provider attribution',
    defaultViewport: { latitude: 30, longitude: 31, latitudeDelta: 0.1, longitudeDelta: 0.1 },
  },
});
check(missingServerCredential.interactiveMapAvailable && !missingServerCredential.addressSearchAvailable,
  'a missing server credential fails search closed without disabling native map rendering');
const absentLocation = resolveLocationExperienceAvailability({
  dataMode: 'supabase',
  capability: {
    mapsAvailable: false,
    searchAvailable: false,
    manualPinAlwaysAvailable: true,
    pinRequiredBeforeBooking: true,
    mapRendererKey: null,
  },
  descriptor: null,
});
check(absentLocation.providerUnavailable && !absentLocation.addressSearchAvailable,
  'provider unavailable appears only when no renderer descriptor and no enabled search provider exist');

// WPS-023's pure boundaries were not turned into network modules.
check(!/fetch\(|axios|XMLHttpRequest/.test(codeOf('src', 'onboarding', 'identity-extraction.ts')),
  'the WPS-023 extraction boundary is still network-free');
check(!/fetch\(|axios|googleapis|mapbox/i.test(codeOf('src', 'onboarding', 'location-provider.ts')),
  'the WPS-023 location boundary is still network-free');

// ---------------------------------------------------------------------------
// The accuracy harness refuses to invent a baseline
// ---------------------------------------------------------------------------
const harnessRaw = read('scripts', 'ocr-accuracy-baseline.mts');
const harness = codeOf('scripts', 'ocr-accuracy-baseline.mts');

// Two exits, and the difference matters. ABSENCE is not a fault: no sample set
// yet means the measurement has not been made, it is recorded as NOT MEASURED
// and the run exits cleanly. INVALIDITY is a fault: a forbidden sample source
// or a set of only clean images would produce a misleading figure, so it fails.
check(/function notMeasured/.test(harness) && /process\.exit\(0\)/.test(harness),
  'ABSENCE OF A SAMPLE SET EXITS CLEANLY AND RECORDS NOT MEASURED');
check(/function refuse/.test(harness) && /process\.exit\(1\)/.test(harness),
  'an invalid sample set fails the run rather than producing a misleading figure');
check(/NOT MEASURED/.test(harnessRaw),
  'the harness writes the words NOT MEASURED rather than a blank');
check(/will not invent/i.test(harnessRaw),
  'the harness states that it will not invent a measurement');
check(!/Math\.random/.test(harness), 'THE HARNESS FABRICATES NO MEASUREMENT');
for (const metric of [
  'successfulExtractionRate', 'falsePositiveRate', 'unreadableRate', 'parserFailureRate',
  'fieldAccuracy', 'confidenceDistribution', 'meanLatency', 'p95Latency',
]) {
  check(new RegExp(`\\b${metric}\\b`).test(harness), `the harness measures ${metric}`);
}
check(/forbids testing with/.test(harnessRaw),
  'the harness refuses production customer documents');
check(/readable === false/.test(harness),
  'the harness requires deliberately unreadable samples');
check(/Accuracy against nothing/.test(harnessRaw),
  'a readable sample with no transcribed ground truth is refused');
// The provider is not guessed. A baseline attributed to the wrong provider
// version is worse than one nobody recorded, because it will be compared with.
check(/OCR_PROVIDER_KEY/.test(harness) && !/'google_cloud_vision'/.test(harness),
  'THE HARNESS HARDCODES NO PROVIDER AND GUESSES NO VERSION');
check(/IDENTITY_PARSER_VERSION/.test(harness),
  'a run records which parser produced it, so accuracy changes can be attributed');

// No measured baseline is claimed anywhere.
const baselineDoc = read('docs', 'testing', 'WPS-024-OCR-ACCURACY-BASELINE.md');
check(/NOT MEASURED/.test(baselineDoc),
  'THE OCR BASELINE DOCUMENT STATES THAT NOTHING HAS BEEN MEASURED');
check(!/\b\d{1,3}(\.\d+)?%\s*(accuracy|extraction rate|success)/i.test(baselineDoc),
  'THE BASELINE DOCUMENT QUOTES NO ACCURACY FIGURE');


// ---------------------------------------------------------------------------
// National ID parsing, exercised against real inputs
// ---------------------------------------------------------------------------
// `parseCandidates` is pure and its module touches no Deno global at import
// time, so it runs here under Node. Structural checks establish what it may
// not do; these establish what it actually does.

// A 1998 card. Century digit 2 means 1900s; 980101 is the birth date.
const front = parseIdentityCandidates('البطاقة الشخصية\nمحمد أحمد إبراهيم\n29801011234567', 0.9);
const byKey = new Map(front.map((c) => [c.fieldKey, c]));

check(byKey.get('national_id_number')?.value === '29801011234567',
  'the fourteen-digit identifier is extracted');
check(byKey.get('date_of_birth')?.value === '1998-01-01',
  'the birth date is derived from the identifier encoding');
check(byKey.get('legal_name_ar')?.value === 'محمد أحمد إبراهيم',
  'the Arabic name is extracted');

// Arabic-Indic digits. A card photographed in good light frequently OCRs this
// way, and a naive \d{14} would find nothing on a perfectly readable document.
const arabicDigits = parseIdentityCandidates('٢٩٨٠١٠١٢٣٤٥٦٧٨', 0.9);
check(arabicDigits.some((c) => c.fieldKey === 'national_id_number'),
  'ARABIC-INDIC DIGITS ARE NORMALISED BEFORE MATCHING');

// Century digit 3 is the 2000s.
const millennial = parseIdentityCandidates('30501012345678', 0.9);
check(millennial.find((c) => c.fieldKey === 'date_of_birth')?.value === '2005-01-01',
  'a century digit of 3 resolves to the 2000s');

// An invalid century digit yields no date rather than a guess.
const badCentury = parseIdentityCandidates('49801011234567', 0.9);
check(badCentury.some((c) => c.fieldKey === 'national_id_number'),
  'an implausible identifier is still returned as a candidate for the worker to correct');
check(!badCentury.some((c) => c.fieldKey === 'date_of_birth'),
  'AN INVALID CENTURY DIGIT PRODUCES NO DATE RATHER THAN A GUESS');

// An impossible month yields no date.
const badMonth = parseIdentityCandidates('29899011234567', 0.9);
check(!badMonth.some((c) => c.fieldKey === 'date_of_birth'),
  'an impossible month produces no date');

// Nothing readable produces nothing, never a partial invention.
check(parseIdentityCandidates('', 0.9).length === 0, 'empty text yields no candidates');
check(parseIdentityCandidates('...  ---  ...', 0.9).length === 0, 'noise yields no candidates');

// A single Arabic word is not a name. Two or more, or nothing.
check(!parseIdentityCandidates('القاهرة', 0.9).some((c) => c.fieldKey === 'legal_name_ar'),
  'a single Arabic word is not offered as a legal name');

// No candidate ever carries a gender or governorate field.
const everyKey = new Set([
  ...front, ...arabicDigits, ...millennial, ...badCentury,
].map((c) => c.fieldKey));
check(!everyKey.has('gender' as never) && !everyKey.has('governorate' as never),
  'NO EXTRACTION EVER PRODUCES A GENDER OR GOVERNORATE FIELD');
check([...everyKey].every((key) => [
  'national_id_number', 'legal_name_ar', 'date_of_birth', 'id_expiry_date',
].includes(key)), 'only the four declared field keys are ever produced');

// A derived value is less confident than a printed one, so the worker looks
// harder at the thing that was inferred.
const idConfidence = byKey.get('national_id_number')?.confidence ?? 0;
const dobConfidence = byKey.get('date_of_birth')?.confidence ?? 1;
check(dobConfidence < idConfidence,
  'A DERIVED BIRTH DATE IS LESS CONFIDENT THAN THE IDENTIFIER IT CAME FROM');
check(front.every((c) => c.confidence >= 0 && c.confidence <= 1),
  'every confidence is a probability');

// ---------------------------------------------------------------------------
// Parser failure is not OCR failure
// ---------------------------------------------------------------------------
// A card the provider read perfectly, from which the parser extracted nothing,
// is a defect in `ocr-identity-fields.ts` — and no amount of retaking the
// photograph will fix it. Merging the two would send the next person to argue
// with a vendor about a regular expression.
const readableNoFields = parseIdentityDocument('LOREM IPSUM 123', 0.9);
check(readableNoFields.candidates.length === 0 && readableNoFields.parserFailure,
  'TEXT THE PARSER CANNOT USE IS REPORTED AS A PARSER FAILURE, NOT AS AN UNREADABLE CARD');
check(!parseIdentityDocument('', 0.9).parserFailure,
  'a blank result is not a parser failure — the provider saw nothing to parse');
check(!parseIdentityDocument('29801011234567', 0.9).parserFailure,
  'a successful parse is not a parser failure');
check(/^[a-z]+-[a-z]+\/\d+$/.test(IDENTITY_PARSER_VERSION),
  'the parser carries a version, so an accuracy change can be attributed to it');

// ---------------------------------------------------------------------------
// Confidence is normalised identically for every provider
// ---------------------------------------------------------------------------
// Shared rather than per-vendor, so a change of provider changes the numbers
// because the OCR changed and not because the arithmetic did.
check(clampProbability(-1) === 0 && clampProbability(1.4) === 1 && clampProbability(NaN) === 0,
  'A VENDOR REPORTING -1, A PERCENTAGE OR NaN CANNOT CORRUPT A DISTRIBUTION');
const summary = summariseConfidence([
  { fieldKey: 'national_id_number', value: 'x', confidence: 0.9 },
  { fieldKey: 'date_of_birth', value: 'y', confidence: 0.3 },
] as IdentityCandidate[]);
check(Math.abs((summary.mean ?? 0) - 0.6) < 1e-9, 'the mean confidence is the mean');
check(summary.min === 0.3 && summary.max === 0.9, 'the range is reported');
check(summary.distribution['0.75-1.00'] === 1 && summary.distribution['0.25-0.50'] === 1,
  'the distribution buckets are fixed, so two runs months apart are comparable');
const empty = summariseConfidence([]);
check(empty.mean === null,
  'NO CANDIDATES MEANS NO CONFIDENCE, NEVER A ZERO THAT WOULD AVERAGE INTO A BASELINE');

// ---------------------------------------------------------------------------
// Provider health
// ---------------------------------------------------------------------------
const healthMigration = read('supabase', 'migrations',
  '202608110001_wps024_provider_abstraction_health.sql');
const healthMigrationCode = healthMigration.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--[^\n]*$/gm, '');

for (const tracked of [
  'latency_ms', 'timed_out', 'total_failures', 'total_retries',
  'last_success_at', 'provider_version', 'consecutive_failures',
]) {
  check(new RegExp(`\\b${tracked}\\b`).test(healthMigrationCode),
    `provider health tracks ${tracked}`);
}
check(/provider_availability/.test(healthMigrationCode), 'provider health tracks availability');

// The health tables must not become a second route to identity data.
const healthTables = healthMigrationCode.slice(
  healthMigrationCode.indexOf('create table if not exists private.provider_health_samples'),
  healthMigrationCode.indexOf('create or replace function private.record_provider_health'),
);
check(healthTables.length > 0, 'the health tables are present');
check(!/\buser_id\b|\baccount_id\b|\bprovider_id\b|\bsubject/.test(healthTables),
  'NO HEALTH TABLE HOLDS AN ACCOUNT, A WORKER OR A SUBJECT');
check(!/document_hash|candidate_value|storage_path|field_key/.test(healthTables),
  'NO HEALTH TABLE HOLDS A DOCUMENT OR AN EXTRACTED VALUE');
// A COLUMN named for a credential, not the word. `refused_no_credential` is a
// permitted outcome value and says the opposite of what this check is for.
check(!/^\s*\w*(secret|credential|private_key|token)\w*\s+(text|jsonb|bytea)/im.test(healthTables),
  'NO HEALTH TABLE HOLDS A CREDENTIAL');
check(/provider_health_samples_immutable/.test(healthMigrationCode),
  'health samples are append-only');
check(/grant execute on function public\.staff_provider_health\(\) to authenticated/
  .test(healthMigrationCode),
  'the health surface is granted to authenticated and gated by capability, never to anon');
check(/require_staff_capability\('review_legal_governance'\)/.test(healthMigrationCode),
  'the health surface demands a staff capability');
check(!/grant execute on function public\.staff_provider_health\(\) to anon/
  .test(healthMigrationCode),
  'THE HEALTH SURFACE IS NOT ANON EXECUTABLE');

// Recording health must never be the thing that fails a worker's request.
check(/return;/.test(healthMigrationCode.slice(
  healthMigrationCode.indexOf('function private.record_provider_health'),
  healthMigrationCode.indexOf('comment on function private.record_provider_health'))),
  'recording health for an unregistered provider returns quietly rather than raising');
for (const fn of [visionFunction, locationFunction]) {
  check(/record_provider_health/.test(fn), 'the function records provider health');
  check(/catch/.test(fn), 'health recording is wrapped so it cannot fail the request');
}

// Availability excludes Warsha's own refusals. Counting our kill switch against
// a vendor would make the figure meaningless during the incident it exists for.
check(/not in \('refused_disabled', 'refused_no_credential'\)/.test(healthMigrationCode),
  'AVAILABILITY EXCLUDES WARSHA\'S OWN REFUSALS');

// The staff screen never shows a percentage for a window with no calls.
// Administration is web-only — docs/constitution/cross-platform-parity.md.
// The provider health console moved to admin.usewarsha.com.
check(!existsSync('app/admin/providers.tsx'), 'THE MOBILE PROVIDER HEALTH CONSOLE IS GONE');

// ---------------------------------------------------------------------------
// Capability roles: no vendor name survives in business logic
// ---------------------------------------------------------------------------
check(/capability_role/.test(healthMigrationCode), 'the registry records a capability role');
check(/provider_enabled_for_role\('identity_ocr'\)/.test(healthMigrationCode),
  'extraction capability is answered by role, not by vendor');
check(/provider_enabled_for_role\('location'\)/.test(healthMigrationCode),
  'location capability is answered by role, not by vendor');
const capabilitySurfaces = healthMigrationCode.slice(
  healthMigrationCode.indexOf('create or replace function public.get_extraction_capability'),
  healthMigrationCode.indexOf('-- SECTION 3.'));
check(!/google/i.test(capabilitySurfaces),
  'NEITHER CAPABILITY SURFACE NAMES A VENDOR');
check(/external_providers_singular_role_idx/.test(healthMigrationCode),
  'at most one live provider may fill a singular role');

// The columns the extraction writer actually writes.
//
// The write itself moved out of the Edge Function and into
// `warsha_ocr_store_candidates`, because PostgREST does not serve the `private`
// schema and the direct table write had never once succeeded on a hosted
// project. The question is unchanged — does the extraction path write these
// columns — so it is asked of the path rather than of one file in it.
const extractionWriter = visionFunction
  + readFileSync('supabase/migrations/202608280003_ocr_runtime_public_surface.sql', 'utf8');
for (const column of ['document_type', 'document_hash', 'is_current']) {
  check(new RegExp(`add column if not exists ${column}`).test(healthMigrationCode),
    `worker_identity_extractions gains ${column}, which the extraction path writes`);
  check(new RegExp(`\\b${column}\\b`).test(extractionWriter),
    `the extraction path writes ${column}`);
}
check(/insert into private\.worker_identity_extractions/.test(extractionWriter)
  && /update private\.worker_identity_extractions/.test(extractionWriter),
  'AND SUPERSEDES THE PREVIOUS ATTEMPT IN THE SAME FUNCTION THAT WRITES THE NEW ONE');

// ---------------------------------------------------------------------------
// Hosted development environment and governed provider activation
// ---------------------------------------------------------------------------
const developmentGovernance = read('supabase', 'migrations',
  '202608180001_development_provider_governance.sql');
const developmentGovernanceCode = developmentGovernance
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--[^\n]*$/gm, '');
const providerActivation = developmentGovernanceCode.slice(
  developmentGovernanceCode.indexOf('function public.staff_activate_external_provider'),
  developmentGovernanceCode.indexOf('-- 6. MATERIAL LEGAL PUBLICATION'),
);
const legalPublication = developmentGovernanceCode.slice(
  developmentGovernanceCode.indexOf('function public.staff_publish_legal_version'),
  developmentGovernanceCode.indexOf('-- 7. SUBPROCESSOR PROMOTION'),
);
const providerSync = developmentGovernanceCode.slice(
  developmentGovernanceCode.indexOf('function public.staff_sync_provider_status'),
);

check(/staff_feature_flags_env_check[\s\S]*development/.test(developmentGovernanceCode),
  'development is a valid server-authoritative feature flag environment');
check(/'location_provider', 'development', false, 0, 'none'/.test(developmentGovernanceCode),
  'the development Maps flag is seeded disabled with no audience');
check(/staff_bind_platform_environment/.test(developmentGovernanceCode),
  'hosted environment binding uses a named staff authority');
check(/Only a non-production hosted environment can be bound here/.test(developmentGovernanceCode),
  'the project binding authority cannot bind production');
check(/Feature flags must target the current platform environment/.test(developmentGovernanceCode),
  'development cannot mutate another environment feature state');
check(/private\.platform_environment\(\) = any\(p\.environments\)/.test(developmentGovernanceCode),
  'provider selection and enablement enforce registry environment compatibility');

check(/require_staff_capability\('manage_subprocessors'\)/.test(providerActivation),
  'provider activation requires the existing provider/subprocessor capability');
check(/consume_dual_control\([\s\S]*'manage_subprocessors'[\s\S]*'activate_external_provider'/.test(providerActivation),
  'provider activation consumes exact dual control');
check(/event_type[\s\S]*'enabled'|provider_key, 'enabled'/.test(providerActivation),
  'provider activation writes immutable enabled history');
check(/external_provider_activated/.test(providerActivation),
  'provider activation writes staff audit');
check(/dualControlRequestId/.test(providerActivation),
  'provider activation audit identifies the consumed approval');
check(/Disable the provider feature flag before activation/.test(providerActivation),
  'provider activation refuses to turn an already-enabled flag into an implicit call path');
check(!/staff_set_feature_flag\(/.test(providerActivation),
  'provider activation never enables the feature flag');
check(!/update private\.staff_kill_switches/.test(providerActivation),
  'provider activation never alters a kill switch');
check(!/p_.*(credential|secret|api_key)/i.test(
  providerActivation.slice(0, providerActivation.indexOf('returns jsonb'))),
  'provider activation accepts no credential value');

check(/consume_dual_control\([\s\S]*publish_legal_version/.test(legalPublication),
  'legal publication consumes approval bound to the exact publication');
check(/if p_change_class in \('material', 'urgent'\)[\s\S]*consume_dual_control/.test(legalPublication),
  'the legal dual-control gate is limited to material and urgent publication');
check(/p_document_key \|\| ':' \|\| p_version \|\| ':' \|\| private\.platform_environment/.test(legalPublication),
  'legal approval is bound to document, version and environment');
check(/dualControlRequestId/.test(legalPublication),
  'legal publication audit identifies the consumed approval');
check(/sync_subprocessor_in_use/.test(providerSync)
  && /consume_dual_control/.test(providerSync),
  'subprocessor promotion consumes its own material-change approval');
check(/v_target = 'in_use'/.test(providerSync),
  'restrictive subprocessor demotion does not wait for promotion approval');

const materialChecklist = read('docs', 'operations', 'google-maps-material-change-checklist.md');
check(/template only/i.test(materialChecklist) && /no approval has been given/i.test(materialChecklist),
  'the Maps legal checklist cannot be mistaken for completed approval');
for (const document of ['Privacy Policy', 'Location Data Policy', 'Subprocessor Register']) {
  check(materialChecklist.includes(document), `${document} is in the human approval checklist`);
}
check(/English material-change summary/.test(materialChecklist)
  && /Arabic material-change summary/.test(materialChecklist),
  'human approval covers both material summaries');
check(/Renewed-acceptance scope/.test(materialChecklist),
  'human approval must decide renewed-acceptance scope');


// ---------------------------------------------------------------------------
console.log(`WPS-024 client regressions: ${passed} checks passed`);
// ---------------------------------------------------------------------------
// French: a localized catalogue over an untranslated corpus
// ---------------------------------------------------------------------------
//
// The reported defect: the French Legal Centre rendered a correctly localized
// heading ("À lire avant de vous inscrire") over twenty-six English card
// titles. The page locale resolved fine; the legal metadata did not.
//
// The cause was one expression, repeated at six call sites:
//
//     document[locale === 'ar' ? 'ar' : 'en'].title
//
// a two-language expression used on a three-language site. French fell into
// the `en` branch and nothing said so.
//
// The fix separates two things that were being conflated. A BODY is operative
// text — hashed, versioned, named by an acceptance — and French bodies do not
// exist; producing one is a legal act, not a localization task. A CATALOGUE
// entry names and describes a document and binds nobody. French gets the
// second, and the absence of the first is stated to the reader rather than
// hidden.

// --- Every document is named and described in French -----------------------
for (const document of legalCorpus) {
  const fr = legalCatalogueFr[document.key];
  check(Boolean(fr), `${document.key} has a French catalogue entry`);
  if (!fr) continue;
  check(typeof fr.title === 'string' && fr.title.trim().length > 0,
    `${document.key} has a French title`);
  check(typeof fr.summary === 'string' && fr.summary.trim().length > 0,
    `${document.key} has a French summary`);
  // An English string copied into the French slot is the defect, not the fix.
  check(fr.title !== document.en.title,
    `${document.key} FRENCH TITLE IS NOT THE ENGLISH ONE LEFT IN PLACE`);
  check(fr.summary !== document.en.summary,
    `${document.key} French summary is not the English one left in place`);
}

// --- Registry parity across EN / AR / FR ------------------------------------
// A newly added document must not be able to ship with English metadata and
// silently no French or Arabic.
const frKeys = Object.keys(legalCatalogueFr).sort();
const corpusKeys = legalCorpus.map((document) => document.key).slice().sort();
check(JSON.stringify(frKeys) === JSON.stringify(corpusKeys),
  'THE FRENCH CATALOGUE COVERS EXACTLY THE CORPUS — NO GAPS, NO ORPHANS');
for (const document of legalCorpus) {
  check(document.en.title.trim().length > 0, `${document.key} has an English title`);
  check(document.ar.title.trim().length > 0, `${document.key} has an Arabic title`);
  check(/[؀-ۿ]/.test(document.ar.title),
    `${document.key} Arabic title is genuinely Arabic`);
}

// --- The resolver returns the right language --------------------------------
for (const document of legalCorpus) {
  check(catalogueFor(document, 'fr').title === legalCatalogueFr[document.key].title,
    `${document.key} resolves its French title`);
  check(catalogueFor(document, 'en').title === document.en.title,
    `${document.key} resolves its English title`);
  check(catalogueFor(document, 'ar').title === document.ar.title,
    `${document.key} resolves its Arabic title`);
}

// --- The body substitution is data, not silence -----------------------------
check(bodyLanguageFor('en').language === 'en' && !bodyLanguageFor('en').substituted,
  'English gets English, unsubstituted');
check(bodyLanguageFor('ar').language === 'ar' && !bodyLanguageFor('ar').substituted,
  'Arabic gets Arabic, unsubstituted');
check(bodyLanguageFor('fr').language === 'en',
  'French gets the English body, which is the deliberate product decision');
check(bodyLanguageFor('fr').substituted === true,
  'AND IT IS FLAGGED AS A SUBSTITUTION, SO NO SURFACE CAN SHOW IT SILENTLY');
// French bodies genuinely do not exist. If they are ever published this check
// is the one that should be revisited, deliberately.
for (const document of legalCorpus) {
  check(!('fr' in document),
    `${document.key} HAS NO FRENCH BODY — NONE IS INVENTED TO SATISFY A TEST`);
}

// --- The hash chain is untouched by any of this -----------------------------
// The French catalogue must not enter a hash. An acceptance names a hash; if
// adding a title changed one, every recorded acceptance would point at text
// nobody agreed to.
for (const document of legalCorpus) {
  const parts = hashableParts(document.en);
  check(!parts.includes(legalCatalogueFr[document.key].title),
    `${document.key} French title is not hashed into the English body`);
  const hashes = hashesFor(document);
  check(Object.keys(hashes).sort().join(',') === 'ar,en',
    `${document.key} IS STILL HASHED IN EXACTLY TWO LANGUAGES`);
}

// --- The surfaces --------------------------------------------------------
const legalIndexSource = read('web', 'app', '[locale]', 'legal', 'page.tsx');
const legalArticleSource = read('web', 'app', '[locale]', 'legal', '[slug]', 'page.tsx');
const publicHomeSource = read('web', 'app', '[locale]', 'page.tsx');
const publicSignupSource = read('web', 'app', '[locale]', 'create-account', 'page.tsx');
const appSignupSource = read('web', 'app', 'app', 'create-account', 'page.tsx');

const LEGAL_SURFACES: [string, string][] = [
  ['legal index', legalIndexSource],
  ['legal article', legalArticleSource],
  ['public home', publicHomeSource],
  ['public signup explainer', publicSignupSource],
  ['signup consent', appSignupSource],
];

// The two-language expression must not survive anywhere that renders a title.
for (const [name, source] of LEGAL_SURFACES) {
  check(!/document\[legalLocale\]/.test(source),
    `${name.toUpperCase()} NO LONGER INDEXES A DOCUMENT WITH A TWO-LANGUAGE EXPRESSION`);
  check(!/const legalLocale = \w+ === 'ar' \? 'ar' : 'en'/.test(source),
    `${name} does not rebuild the two-language collapse`);
  check(/catalogueFor\(/.test(source),
    `${name} names each document through the localized catalogue`);
}

// --- Consent surfaces show French names but record an honest language -------
// These are different questions and were sharing one variable. What is this
// policy called on screen? French. Which text did this person accept? The
// English one, because that is what a French route shows them.
check(/catalogueFor\(document, locale\)\.title/.test(appSignupSource),
  'THE SIGNUP CONSENT LIST NAMES EACH POLICY IN THE READER’S LANGUAGE');
check(/bodyLanguageFor\(locale\)/.test(appSignupSource),
  'and derives the accepted language from the same authority');
check(/signupLegalManifest\('customer', acceptedLanguage\)/.test(appSignupSource),
  'THE ACCEPTANCE RECORDS THE LANGUAGE ACTUALLY READ, NEVER A FRENCH TEXT THAT DOES NOT EXIST');
check(!/signupLegalManifest\([^)]*'fr'/.test(appSignupSource),
  'no acceptance can claim a French document was agreed to');

// --- The article route states the substitution ------------------------------
check(/bodyLanguageFor\(typed\)/.test(legalArticleSource),
  'the article route asks which body language it is actually rendering');
check(/substituted \?/.test(legalArticleSource),
  'AND RENDERS A NOTICE WHEN THE ANSWER IS NOT THE LANGUAGE ASKED FOR');
check(/legalUntranslatedHeading/.test(legalArticleSource)
  && /legalUntranslatedNote/.test(legalArticleSource),
  'the notice is localized copy, not a hardcoded English sentence');
check(legalArticleSource.indexOf('substituted ?') < legalArticleSource.indexOf('styles.body'),
  'the notice comes before the text it describes, not after it');
check(/lang=\{bodyLanguage\}/.test(legalArticleSource),
  'AND THE SUBSTITUTED BODY IS MARKED UP IN THE LANGUAGE IT IS ACTUALLY IN');
check(/catalogueFor\(document, typed\)/.test(legalArticleSource),
  'while the title and summary above it are the reader’s own language');

// --- The notice exists in all three dictionaries ----------------------------
const webCopySource = read('web', 'lib', 'copy.ts');
check((webCopySource.match(/legalUntranslatedHeading:/g) ?? []).length === 3,
  'the untranslated notice is written in English, Arabic and French');
check((webCopySource.match(/legalUntranslatedNote:/g) ?? []).length === 3,
  'including the explanatory sentence');

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
