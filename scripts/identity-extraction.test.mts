/**
 * Worker document extraction: the flow, the cost controls, and the promises.
 *
 * The backend for this was complete and had no caller (see
 * `src/verification/identity-extraction-flow.ts`), so most of what needed
 * testing was not "does the provider work" — it was "does the product now ask,
 * does it ask only when asking is worth money, and does a failure to read a
 * photograph stay firmly outside the verification decision".
 *
 * Provider calls are never made here. The rules are pure and run directly; the
 * vendor boundary is asserted by inspecting the Edge Function's source, which
 * is a different runtime and cannot be imported.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  candidateFillsField,
  extractableDocumentTypes,
  extractionMayDecide,
  extractionOutcomes,
  extractionPhaseCopyKey,
  extractionPhaseFor,
  extractionPhases,
  isExtractableDocument,
  manualEntryAvailable,
  offersRetake,
  shouldRequestExtraction,
  visibleExtractionPhase,
  withAttempt,
  type ExtractionAttempt,
  type ExtractionOutcome,
} from '../src/verification/identity-extraction-flow.ts';
import {
  decideOcrRequest,
  OCR_ATTEMPTS_PER_DOCUMENT,
  OCR_CALLS_PER_HOUR,
  OCR_HISTORY_WINDOW_MS,
  OCR_RATE_WINDOW_MS,
  ocrOutcomeWasACall,
  type OcrRequestRecord,
} from '../supabase/functions/_shared/ocr-throttle.ts';
import {
  IDENTITY_PARSER_VERSION,
  normalizeDigits,
  parseIdentityCandidates,
  parseIdentityDocument,
} from '../supabase/functions/_shared/ocr-identity-fields.ts';
import { translations } from '../src/i18n/translations.ts';

const read = (path: string) => readFileSync(path, 'utf8');
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const equal = <T,>(actual: T, expected: T, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

// ---------------------------------------------------------------------------
// 1. Extraction is assistive, and cannot become anything else
// ---------------------------------------------------------------------------

equal(extractionMayDecide(), false,
  'EXTRACTION NEVER DECIDES WHETHER A DOCUMENT, AN IDENTITY OR A WORKER IS GOOD');
for (const phase of extractionPhases) {
  equal(manualEntryAvailable(phase), true,
    `manual entry is available in the ${phase} phase`);
}
// The words that must never appear in what a worker is shown about a failed
// read. "Verification failed" for an unreadable photograph is the exact defect
// the brief names.
for (const language of ['en', 'ar', 'fr'] as const) {
  const sentence = translations[language].identityExtractionUnreadable;
  check(!/verification failed|vérification a échoué|فشل التحقق/i.test(sentence),
    `${language}: a document that could not be read is NOT a failed verification`);
  check(sentence.length > 20, `${language}: the unreadable message says what to do next`);
}

// ---------------------------------------------------------------------------
// 2. Only the documents Warsha actually parses
// ---------------------------------------------------------------------------

equal([...extractableDocumentTypes], ['national_id_front', 'national_id_back'],
  'extraction is offered for the two National ID sides and nothing else');
for (const other of ['selfie', 'criminal_record', 'skill_certificate', '', null, 'passport']) {
  check(!isExtractableDocument(other),
    `${String(other)} is not sent to an OCR provider`);
}
// The client's list and the server's must be the same list.
const visionFunction = read('supabase/functions/vision-extract/index.ts');
for (const type of extractableDocumentTypes) {
  check(visionFunction.includes(`'${type}'`), `the Edge Function also accepts ${type}`);
}
check(!/'selfie'|'skill_certificate'/.test(visionFunction),
  'AND THE EDGE FUNCTION REFUSES EVERYTHING ELSE');

// The outcome vocabulary is one vocabulary.
for (const outcome of extractionOutcomes) {
  check(visionFunction.includes(`'${outcome}'`) || outcome === 'no_text_found',
    `${outcome} is an outcome the function can actually return`);
}

// ---------------------------------------------------------------------------
// 3. Phases: what the worker is told
// ---------------------------------------------------------------------------

equal(extractionPhaseFor('succeeded'), 'complete', 'a successful read shows the details');
equal(extractionPhaseFor('unreadable'), 'unreadable', 'an unreadable photograph says so');
equal(extractionPhaseFor('no_text_found'), 'unreadable', 'so does a blank one');
equal(extractionPhaseFor('provider_error'), 'unavailable', 'a provider fault is not the worker\'s fault');
equal(extractionPhaseFor('timed_out'), 'unavailable', 'nor is a timeout');
equal(extractionPhaseFor('refused_disabled'), 'unavailable', 'nor is the provider being switched off');
equal(extractionPhaseFor('refused_no_credential'), 'unavailable', 'nor is a missing credential');
equal(extractionPhaseFor('refused_rate_limited'), 'unavailable', 'nor is a Warsha-imposed ceiling');
equal(extractionPhaseFor(null), 'idle', 'nothing having happened shows nothing');

check(offersRetake('unreadable'), 'a bad photograph is worth retaking');
check(!offersRetake('unavailable'),
  'AND A SWITCHED-OFF PROVIDER IS NOT — RETAKING WOULD BE POINTLESS WORK');
check(!offersRetake('complete'), 'nor is a successful read');

equal(visibleExtractionPhase({ inFlight: true, lastOutcome: null, capabilityAvailable: true }),
  'reading', 'a request in flight reads as reading');
equal(visibleExtractionPhase({ inFlight: false, lastOutcome: null, capabilityAvailable: false }),
  'idle', 'a switched-off provider that was never asked says nothing at all');
equal(visibleExtractionPhase({ inFlight: false, lastOutcome: 'succeeded', capabilityAvailable: true }),
  'complete', 'and a finished read reports its outcome');

// Every phase that says something has a key, and every key resolves in all
// three languages.
for (const phase of extractionPhases) {
  const key = extractionPhaseCopyKey[phase];
  if (phase === 'idle') { equal(key, null, 'the idle phase says nothing'); continue; }
  check(typeof key === 'string', `${phase} names a copy key`);
  for (const language of ['en', 'ar', 'fr'] as const) {
    const value = (translations[language] as Record<string, string>)[key!];
    check(typeof value === 'string' && value.length > 0, `${language}.${key} resolves`);
  }
}
for (const key of ['identityExtractionRetake', 'identityExtractionReadAgain',
  'identityExtractionManual', 'identityExtractionAssistiveNote'] as const) {
  for (const language of ['en', 'ar', 'fr'] as const) {
    const value = (translations[language] as Record<string, string>)[key];
    check(typeof value === 'string' && value.length > 0, `${language}.${key} resolves`);
  }
  // Compared as strings: the dictionary's literal types have no overlap
  // between languages, so TypeScript would call the comparison unintentional
  // even though a copy-paste of the English is exactly what it is guarding.
  check(String(translations.ar[key]) !== String(translations.en[key]), `ar.${key} is genuinely Arabic`);
  check(String(translations.fr[key]) !== String(translations.en[key]), `fr.${key} is genuinely French`);
  check(/[؀-ۿ]/.test(translations.ar[key]), `ar.${key} is written in Arabic script`);
}
// The assistive promise is made in all three languages, and it is the promise.
for (const language of ['en', 'ar', 'fr'] as const) {
  check(translations[language].identityExtractionAssistiveNote.length > 40,
    `${language}: the note explains that a person decides, not a machine`);
}

// ---------------------------------------------------------------------------
// 4. A candidate suggests; it never overwrites and never asserts
// ---------------------------------------------------------------------------

check(candidateFillsField({
  candidateValue: 'محمد أحمد إبراهيم', masked: false, requiresManualEntry: false, currentValue: '',
}), 'a confident candidate fills an empty field');
check(!candidateFillsField({
  candidateValue: 'محمد أحمد إبراهيم', masked: false, requiresManualEntry: false, currentValue: 'Ahmed',
}), 'A CANDIDATE NEVER OVERWRITES WHAT THE WORKER TYPED');
check(!candidateFillsField({
  candidateValue: '29801012345678', masked: true, requiresManualEntry: false, currentValue: '',
}), 'a masked value is for display and is never put into a form field');
check(!candidateFillsField({
  candidateValue: 'maybe', masked: false, requiresManualEntry: true, currentValue: '',
}), 'a low-confidence candidate is withheld rather than pre-filled and skimmed past');
check(!candidateFillsField({
  candidateValue: null, masked: false, requiresManualEntry: false, currentValue: '',
}), 'and nothing extracted fills nothing');
check(candidateFillsField({
  candidateValue: 'x', masked: false, requiresManualEntry: false, currentValue: '   ',
}), 'a field holding only whitespace is empty, and a candidate may fill it');

// ---------------------------------------------------------------------------
// 5. Client-side idempotency: never two calls for one photograph
// ---------------------------------------------------------------------------

const base = {
  documentType: 'national_id_front' as const,
  documentKey: 'hash-a',
  capabilityAvailable: true,
};

check(shouldRequestExtraction({ ...base, attempts: [] }),
  'a freshly uploaded document is read');
check(!shouldRequestExtraction({ ...base, capabilityAvailable: false, attempts: [] }),
  'A SWITCHED-OFF PROVIDER IS NOT ASKED — THAT WOULD SPEND A REQUEST TO BE TOLD NO');
check(!shouldRequestExtraction({ ...base, documentKey: null, attempts: [] }),
  'a document with no key is not sent');
check(!shouldRequestExtraction({ ...base, documentType: 'selfie', attempts: [] }),
  'and neither is a document type extraction does not cover');

const reading: ExtractionAttempt = { documentType: 'national_id_front', documentKey: 'hash-a', phase: 'reading' };
check(!shouldRequestExtraction({ ...base, attempts: [reading] }),
  'a read already in flight is never started twice');
check(!shouldRequestExtraction({ ...base, attempts: [reading], requestedByWorker: true }),
  'not even by a worker tapping the button again');

const done: ExtractionAttempt = { documentType: 'national_id_front', documentKey: 'hash-a', phase: 'complete' };
check(!shouldRequestExtraction({ ...base, attempts: [done] }),
  'a document already read is not read again — the result is already on screen');
check(!shouldRequestExtraction({ ...base, attempts: [done], requestedByWorker: true }),
  'and asking again would only spend money to produce the same candidates');

const failed: ExtractionAttempt = { documentType: 'national_id_front', documentKey: 'hash-a', phase: 'unreadable' };
check(!shouldRequestExtraction({ ...base, attempts: [failed] }),
  'a failed read is not retried automatically');
check(shouldRequestExtraction({ ...base, attempts: [failed], requestedByWorker: true }),
  'but a worker who asks explicitly gets another go');

// New bytes are a new question.
check(shouldRequestExtraction({ ...base, documentKey: 'hash-b', attempts: [done] }),
  'RETAKING THE PHOTOGRAPH PRODUCES NEW BYTES, AND THOSE ARE READ');
check(shouldRequestExtraction({
  ...base, documentType: 'national_id_back', attempts: [done],
}), 'and the other side of the card is its own document');

equal(withAttempt([done], { ...done, phase: 'unreadable' }).length, 1,
  'an attempt replaces the earlier one for the same document version');
check(withAttempt([done], { documentType: 'national_id_back', documentKey: 'hash-a', phase: 'reading' })
  .length === 2, 'while a different document keeps its own record');

// ---------------------------------------------------------------------------
// 6. Server-side cost control
// ---------------------------------------------------------------------------

const row = (over: Partial<OcrRequestRecord> = {}): OcrRequestRecord => ({
  documentType: 'national_id_front',
  documentHash: 'a'.repeat(64),
  outcome: 'unreadable',
  requestedAt: new Date(1_800_000_000_000).toISOString(),
  ...over,
});
const NOW = 1_800_000_000_000;
const decide = (recent: OcrRequestRecord[]) => decideOcrRequest({
  documentType: 'national_id_front', documentHash: 'a'.repeat(64), recent, now: NOW,
});

equal(decide([]).kind, 'call', 'a document never seen before is read');
equal(decide([row({ outcome: 'succeeded' })]).kind, 'reuse',
  'IDENTICAL BYTES ALREADY READ ARE NEVER SENT TO THE PROVIDER A SECOND TIME');
equal(decideOcrRequest({
  documentType: 'national_id_front', documentHash: 'b'.repeat(64),
  recent: [row({ outcome: 'succeeded' })], now: NOW,
}).kind, 'call', 'while different bytes are a different question');
equal(decideOcrRequest({
  documentType: 'national_id_back', documentHash: 'a'.repeat(64),
  recent: [row({ outcome: 'succeeded' })], now: NOW,
}).kind, 'call', 'and so is the other side of the card');

// Attempts against one document version.
const attemptRows = Array.from({ length: OCR_ATTEMPTS_PER_DOCUMENT }, () => row());
const exhausted = decide(attemptRows);
equal(exhausted.kind, 'refuse', 'a document retried to the limit stops being sent');
equal(exhausted.kind === 'refuse' ? exhausted.reason : '', 'attempts_exhausted',
  'and says which limit it met');
equal(decide(attemptRows.slice(0, OCR_ATTEMPTS_PER_DOCUMENT - 1)).kind, 'call',
  'one below the limit still gets a go');

// Refusals are not attempts: being told no must not use up the quota.
const refusals = Array.from({ length: OCR_ATTEMPTS_PER_DOCUMENT + 3 },
  () => row({ outcome: 'refused_disabled' }));
equal(decide(refusals).kind, 'call',
  'A REFUSAL NEVER REACHED THE PROVIDER AND MUST NOT COUNT AGAINST THE WORKER');
for (const outcome of ['refused_disabled', 'refused_no_credential', 'refused_rate_limited']) {
  check(!ocrOutcomeWasACall(outcome), `${outcome} is not a provider call`);
}
for (const outcome of ['succeeded', 'unreadable', 'no_text_found', 'provider_error']) {
  check(ocrOutcomeWasACall(outcome), `${outcome} is a provider call and is counted`);
}

// The hourly ceiling, across every document.
const hourly = Array.from({ length: OCR_CALLS_PER_HOUR }, (_, index) => row({
  documentHash: String(index).padStart(64, '0'),
  requestedAt: new Date(NOW - index * 60_000).toISOString(),
}));
const ceiling = decide(hourly);
equal(ceiling.kind, 'refuse', 'a worker over the hourly ceiling is refused');
equal(ceiling.kind === 'refuse' ? ceiling.reason : '', 'rate_limited', 'and says so');
const aged = hourly.map((entry) => ({
  ...entry,
  requestedAt: new Date(NOW - OCR_RATE_WINDOW_MS - 60_000).toISOString(),
}));
equal(decide(aged).kind, 'call', 'while calls older than the window have rolled off');
check(OCR_HISTORY_WINDOW_MS > OCR_RATE_WINDOW_MS,
  'the function reads further back than the window, so a clock skew cannot leak a call past it');

// Reuse outranks every limit: a result Warsha already holds is never withheld.
equal(decide([...hourly, row({ outcome: 'succeeded' })]).kind, 'reuse',
  'A STORED RESULT IS RETURNED EVEN TO A WORKER AT THE CEILING — IT COSTS NOTHING');

// A malformed timestamp must not open a hole in the ceiling.
const malformed = Array.from({ length: OCR_CALLS_PER_HOUR },
  () => row({ documentHash: 'c'.repeat(64), requestedAt: 'not-a-date' }));
equal(decideOcrRequest({
  documentType: 'national_id_front', documentHash: 'd'.repeat(64), recent: malformed, now: NOW,
}).kind, 'refuse', 'an unreadable timestamp counts towards the limit rather than escaping it');

// ---------------------------------------------------------------------------
// 7. The parser: Arabic, mixed script, and refusing to guess
// ---------------------------------------------------------------------------

equal(normalizeDigits('٢٩٨٠١٠١٢٣٤٥٦٧٨'), '29801012345678',
  'Arabic-Indic digits normalise to ASCII');
equal(normalizeDigits('۱۲۳'), '123', 'and so do the extended Arabic-Indic forms');
equal(normalizeDigits('already 123'), 'already 123', 'ASCII is left alone');

// A synthetic card. Nothing here is a real identity: the identifier is a
// structurally valid but invented number, and the name is a common placeholder.
const SYNTHETIC_AR = [
  'بطاقة تحقيق الشخصية',
  'محمد أحمد إبراهيم',
  '٢٩٨٠١٠١٢٣٤٥٦٧٨',
  '2031/05/14',
].join('\n');

{
  const candidates = parseIdentityCandidates(SYNTHETIC_AR, 0.92);
  const byKey = new Map(candidates.map((entry) => [entry.fieldKey, entry.value]));
  equal(byKey.get('national_id_number'), '29801012345678',
    'the fourteen-digit identifier is read from Arabic-Indic digits');
  // C YY MM DD: `2` is the 1900s, then 98-01-01. Derived from the identifier
  // rather than read off the card, because the printed date is frequently the
  // least legible thing on it while the number is the most.
  equal(byKey.get('date_of_birth'), '1998-01-01',
    'and the date of birth is derived from the encoding inside the identifier');
  equal(byKey.get('legal_name_ar'), 'محمد أحمد إبراهيم',
    'THE ARABIC NAME IS READ, NOT THE CARD HEADING ABOVE IT');
  equal(byKey.get('id_expiry_date'), '2031-05-14', 'and the expiry date is read');
}

// Mixed Arabic and Latin, which real Egyptian documents contain.
{
  const mixed = 'ARAB REPUBLIC OF EGYPT\nNational ID\nمحمد أحمد إبراهيم\n29801012345678';
  const candidates = parseIdentityCandidates(mixed, 0.88);
  const byKey = new Map(candidates.map((entry) => [entry.fieldKey, entry.value]));
  equal(byKey.get('national_id_number'), '29801012345678',
    'a mixed-script document still yields the identifier');
  equal(byKey.get('legal_name_ar'), 'محمد أحمد إبراهيم',
    'and the Arabic name is not confused by the Latin lines around it');
}

// What the parser must never produce, however readable the card is.
{
  const candidates = parseIdentityCandidates(SYNTHETIC_AR, 0.99);
  for (const forbidden of ['gender', 'sex', 'governorate', 'address', 'religion', 'marital_status']) {
    check(!candidates.some((entry) => entry.fieldKey === forbidden),
      `NO ${forbidden.toUpperCase()} FIELD IS EVER EXTRACTED`);
  }
  check(candidates.every((entry) => ['national_id_number', 'legal_name_ar',
    'date_of_birth', 'id_expiry_date'].includes(entry.fieldKey)),
    'only the four fields the product actually uses are produced');
}

// A wrong value is worse than an absent one.
{
  equal(parseIdentityCandidates('', 0.9).length, 0, 'nothing in, nothing out');
  equal(parseIdentityCandidates('12345', 0.9).length, 0,
    'a number that is not fourteen digits is not offered as an identifier');
  const badCentury = parseIdentityCandidates('19801012345678', 0.9);
  check(!badCentury.some((entry) => entry.fieldKey === 'date_of_birth'),
    'an identifier with an impossible century digit yields no date rather than a wrong one');
  const heading = parseIdentityCandidates('بطاقة تحقيق الشخصية محمد أحمد', 0.9);
  const name = heading.find((entry) => entry.fieldKey === 'legal_name_ar')?.value ?? '';
  check(!name.includes('بطاقة'),
    'and a name is never the card\'s own heading run together with a person\'s name');
  /*
   * The heading on its OWN line, which is what a real card looks like and what
   * the line-splitting guard cannot catch. `بطاقة تحقيق الشخصية` is three words
   * and nineteen characters — longer than many real two-part Egyptian names —
   * so "longest Arabic run" used to offer "Personal Identification Card" as a
   * person, on every card, with nothing else wrong with the photograph.
   */
  const realistic = parseIdentityCandidates(
    ['جمهورية مصر العربية', 'بطاقة تحقيق الشخصية', 'محمد أحمد', '29801012345678'].join('\n'),
    0.9,
  );
  const realisticName = realistic.find((entry) => entry.fieldKey === 'legal_name_ar')?.value ?? '';
  equal(realisticName, 'محمد أحمد',
    'THE PRINTED HEADING IS NEVER OFFERED AS SOMEBODY\'S LEGAL NAME');
  for (const label of ['بطاقة تحقيق الشخصية', 'محل الإقامة', 'تاريخ الميلاد', 'الحالة الاجتماعية']) {
    const only = parseIdentityCandidates(label, 0.9);
    check(!only.some((entry) => entry.fieldKey === 'legal_name_ar'),
      `the printed label "${label}" is not a name`);
  }
  // And the refusal list must not eat real names.
  for (const person of ['عبد الرحمن محمد', 'نور الدين حسن', 'فاطمة الزهراء علي']) {
    const parsed = parseIdentityCandidates(person, 0.9);
    equal(parsed.find((entry) => entry.fieldKey === 'legal_name_ar')?.value, person,
      `"${person}" is still read as a name`);
  }
}

// Parser failure is reported separately from a failed read.
{
  const blank = parseIdentityDocument('', 0.9);
  equal(blank.parserFailure, false, 'no text is a capture problem, not a parser problem');
  const unparsed = parseIdentityDocument('THIS CARD HAS TEXT BUT NO FIELDS', 0.9);
  equal(unparsed.parserFailure, true,
    'READABLE TEXT YIELDING NOTHING IS A PARSER PROBLEM NO RETAKE WILL FIX');
  check(IDENTITY_PARSER_VERSION.length > 0, 'and the parser records its own version');
}

// ---------------------------------------------------------------------------
// 8. Architecture: no vendor, no secret, no client credential
// ---------------------------------------------------------------------------

// Nothing shipped to a device or a browser may name the vendor or hold a key.
const clientTrees = [
  'src/verification/identity-extraction-flow.ts',
  'src/verification/use-identity-extraction.ts',
  'src/providers/provider-clients.ts',
  'app/worker/verification.tsx',
];
for (const path of clientTrees) {
  const source = strip(read(path));
  check(!/vision\.googleapis\.com|GOOGLE_CLOUD_VISION|private_key|service_account/i.test(source),
    `${path} CONTAINS NO PROVIDER CREDENTIAL AND NO PROVIDER ENDPOINT`);
  check(!/googleapis|cloud-vision/i.test(source),
    `${path} does not call an OCR vendor directly`);
}
const clients = read('src/providers/provider-clients.ts');
check(/functions\.invoke\('vision-extract'/.test(clients),
  'the only way a client reaches OCR is the Edge Function');
check(/storagePath, documentType/.test(clients),
  'and it sends a path the server resolves, never the image bytes');

// The function's own boundaries.
check(/asCaller\.auth\.getUser\(\)/.test(visionFunction),
  'the caller is resolved from the verified token, never from the request body');
const capabilityStart = visionFunction.indexOf("if (body.operation === 'capability')");
const extractionStart = visionFunction.indexOf('const storagePath', capabilityStart);
check(capabilityStart > visionFunction.indexOf('asCaller.auth.getUser()'),
  'the credential-presence probe is available only after real user authentication');
const capabilityBranch = strip(visionFunction.slice(capabilityStart, extractionStart));
check(/credentialConfigured/.test(capabilityBranch)
  && !/extractIdentity|storage\.from|\.download\(|open_ocr|record_provider_health/.test(capabilityBranch),
  'THE CAPABILITY PROBE RETURNS ONE BOOLEAN WITHOUT READING A DOCUMENT, OPENING AN AUDIT OR CALLING GOOGLE');
check(/storagePath\.startsWith\(`\$\{userId\}\/`\)/.test(visionFunction),
  'A WORKER CAN ONLY EXTRACT FROM A DOCUMENT UNDER THEIR OWN ACCOUNT PATH');
check(/403/.test(visionFunction), 'and another account\'s document is refused');
check(/decideOcrRequest/.test(visionFunction),
  'the function decides whether a paid call is worth making');
check(visionFunction.indexOf('decideOcrRequest') < visionFunction.indexOf('provider.extractIdentity('),
  'BEFORE it calls the provider, not after');
check(/refused_rate_limited/.test(visionFunction),
  'and records the refusal the table has always allowed');
check(!/confidence.*=>.*json\(|p_mean_confidence.*json/.test(visionFunction),
  'confidence is recorded internally and never returned to a client');

// Logging: an identifier, a status, a duration — never a document or a secret.
const providerSecrets = read('supabase/functions/_shared/provider-secrets.ts');
check(/redact/.test(providerSecrets) && /private_key/.test(providerSecrets),
  'provider errors are redacted before they can reach a log');
check(!/console\.log\(.*bytes|console\.log\(.*text/.test(visionFunction),
  'no document content is logged');

// The client hook asks the capability before spending anything.
const hook = read('src/verification/use-identity-extraction.ts');
check(/extractionCapability\(\)/.test(hook),
  'the client checks whether the provider is switched on before asking');
check(/shouldRequestExtraction/.test(hook),
  'and applies the shared idempotency rule rather than its own');

// The screen surfaces it, which is the whole gap this closes.
const screen = read('app/worker/verification.tsx');
check(/useIdentityExtraction/.test(screen),
  'THE VERIFICATION SCREEN NOW ASKS — IT PREVIOUSLY NEVER DID');
check(/extraction\.request\('national_id_front'/.test(screen)
  || /extraction\.request\(type, document\.storagePath\)/.test(screen),
  'extraction runs after a National ID upload succeeds');
check(/candidateFillsField/.test(screen),
  'and candidates go through the shared suggest-never-overwrite rule');
check(/identityExtractionAssistiveNote/.test(screen),
  'with the assistive promise on screen beside the result');
check(screen.includes('void extraction.request(type, document.storagePath)'),
  'reading is fire-and-forget, so a provider fault cannot fail the upload');


// --- OCR is not an authority over anything --------------------------------
//
// The single most important property in this feature, and the one most easily
// lost by accident: extraction proposes, a person decides. It is asserted here
// against the source rather than left to the design documents, because a
// document cannot fail a build.
{
  const wps023 = readFileSync(
    'supabase/migrations/202608080001_wps023_authentication_role_onboarding_worker_vetting.sql',
    'utf8');

  // Two tables, not one. A candidate and a confirmed value are different kinds
  // of fact about a person and are never stored in the same place.
  check(/create table if not exists private\.worker_identity_extractions/.test(wps023),
    'candidates have a table of their own');
  check(/private\.provider_verification_identities/.test(wps023),
    'and confirmed identity fields have a different one');

  // The confirmed row can only be written by the worker confirming it. The
  // extraction path has no route into it at all.
  const confirm = wps023.slice(
    wps023.indexOf('create or replace function public.confirm_my_identity_fields'),
    wps023.indexOf('create or replace function public.confirm_my_identity_fields') + 4000);
  check(/v_user uuid := \(select auth\.uid\(\)\)/.test(confirm)
    && /Authentication required/.test(confirm),
    'CONFIRMATION IS THE WORKERS OWN ACT, NOT THE EXTRACTIONS');
  check(/p_legal_name|p_national_id/.test(confirm),
    'and it takes the values from the worker, never reads them back out of a candidate');
  check(!/worker_identity_extractions/.test(confirm),
    'THE CONFIRMATION PATH NEVER READS A CANDIDATE, SO RERUNNING OCR CANNOT OVERWRITE IT');

  // Nothing in the extraction function decides anything about a person.
  const visionSource = readFileSync('supabase/functions/vision-extract/index.ts', 'utf8');
  for (const verdict of [
    'verification_status', 'approve', 'reject', 'is_authentic', 'authenticity',
    'trust_score', 'forgery', 'eligible',
  ]) {
    check(!new RegExp(`${verdict}\\s*[:=]`, 'i').test(visionSource),
      'THE EXTRACTION FUNCTION ASSIGNS NO VERDICT ABOUT A PERSON OR A DOCUMENT');
  }
  check(!/provider_verification_identities|verification_decisions|worker_vetting/
    .test(visionSource),
    'AND WRITES TO NO TABLE THAT HOLDS A DECISION');

  // The register says the same thing, in a row a reviewer can read.
  const wps024 = readFileSync(
    'supabase/migrations/202608090001_wps024_legal_compliance_governance.sql', 'utf8');
  check(/human_confirmation_required/.test(wps024)
    && /prohibited_decisions/.test(wps024),
    'the AI use register records both the prohibition and the confirmation requirement');
}

console.log(`identity extraction: ${checks} checks passed`);
