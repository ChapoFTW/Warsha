/**
 * WPS-024 OCR accuracy baseline harness.
 *
 * Measures what WPS-024 requires and writes it into `private.ocr_accuracy_runs`
 * and a markdown table:
 *
 *   1. successful extraction rate
 *   2. field-by-field accuracy
 *   3. confidence distribution
 *   4. false-positive rate
 *   5. unreadable-document rate
 *   6. extraction latency (mean and p95)
 *   7. parser failures
 *
 * The objective is explicitly not perfect OCR. It is a measured starting point
 * that future work can be compared against, which means the method has to be
 * repeatable and the sample set has to be stable.
 *
 * Provider-agnostic. It posts to the extraction endpoint exactly as the app
 * does and scores what comes back, so a change of OCR vendor is measured by
 * this harness unchanged — which is the point of a baseline that outlives a
 * vendor decision.
 *
 * WHAT THIS HARNESS WILL NOT DO
 * -----------------------------
 * It will not invent a measurement. There is no default, no sample figure and
 * no placeholder anywhere in this file. A baseline is a number future work is
 * judged against, and a fabricated one is worse than an absent one: absence is
 * visible, and a plausible fiction is not.
 *
 * It will not accept production customer documents. `sample_source` is
 * constrained in the database to `synthetic`, `consented_staff_samples` or
 * `public_specimen`, and this harness requires the manifest to declare one.
 *
 * TWO KINDS OF NOT-RUNNING, AND THEY EXIT DIFFERENTLY
 * ---------------------------------------------------
 * ABSENCE — no sample set, or no configured endpoint. Nothing is wrong; the
 * measurement simply has not been made. The harness records NOT MEASURED and
 * exits 0, so a pipeline that runs it before anyone has assembled a sample set
 * is not permanently red.
 *
 * INVALIDITY — a forbidden sample source, a missing image, a manifest of only
 * clean photographs. Something IS wrong, and it is the kind of wrong that
 * produces a misleading number if ignored. Exit 1.
 *
 * Both refuse to invent a figure. The difference is only whether the operator
 * needs to fix something.
 *
 * SAMPLE SET
 * ----------
 * `--samples <dir>` must contain `manifest.json`:
 *
 *   {
 *     "sampleSource": "synthetic",
 *     "notes": "Generated cards, no real identities.",
 *     "samples": [
 *       {
 *         "file": "front-01.jpg",
 *         "documentType": "national_id_front",
 *         "readable": true,
 *         "truth": {
 *           "national_id_number": "29801011234567",
 *           "legal_name_ar": "…",
 *           "date_of_birth": "1998-01-01"
 *         }
 *       }
 *     ]
 *   }
 *
 * `readable: false` marks a deliberately unreadable sample. The unreadable
 * rate is meaningless without some, and a sample set of only clean images
 * measures the wrong thing — real submissions include photographs taken in a
 * stairwell at night.
 *
 * `truth` is the ground truth a human transcribed. A field absent from `truth`
 * is not scored, so a partial ground truth is honest rather than penalised.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  IDENTITY_PARSER_VERSION,
  parseIdentityCandidates,
} from '../supabase/functions/_shared/ocr-identity-fields.ts';

type Sample = {
  file: string;
  documentType: 'national_id_front' | 'national_id_back';
  readable: boolean;
  truth: Record<string, string>;
};

type Manifest = {
  sampleSource: 'synthetic' | 'consented_staff_samples' | 'public_specimen';
  notes: string;
  samples: Sample[];
};

type Outcome =
  | 'succeeded'
  | 'no_text_found'
  | 'unreadable'
  | 'provider_error'
  | 'timed_out'
  | 'refused_disabled'
  | 'refused_no_credential';

type PerSampleResult = {
  file: string;
  outcome: Outcome;
  latencyMs: number;
  meanConfidence: number | null;
  fields: { key: string; expected: string; actual: string | null; correct: boolean }[];
};

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

const outPath = argValue('--out');

/**
 * The measurement has not been made, and nothing is wrong.
 *
 * Writes NOT MEASURED wherever the operator asked for output, and exits 0.
 * No row is written to `private.ocr_accuracy_runs`: that table requires a
 * sample source and a sample count above zero, and supplying either for a run
 * that did not happen would be the fabrication this harness exists to prevent.
 * Absence lives in the document, where a person reads it.
 */
function notMeasured(reason: string): never {
  const record = [
    '# OCR accuracy baseline',
    '',
    '**NOT MEASURED.**',
    '',
    reason,
    '',
    'No figures are recorded, and none are estimated. This harness will not',
    'invent a measurement: a baseline is the number every future change is',
    'judged against, and a plausible fiction is worse than a visible absence.',
    '',
    'No row was written to `private.ocr_accuracy_runs`. That table requires a',
    'sample source and a positive sample count, and supplying either for a run',
    'that did not happen would be the fabrication described above.',
    '',
    `Parser version at the time of this attempt: \`${IDENTITY_PARSER_VERSION}\`.`,
    '',
  ].join('\n');

  console.log(`\n${record}`);
  if (outPath) {
    writeFileSync(outPath, `${record}\n`);
    console.log(`NOT MEASURED written to ${outPath}`);
  }
  process.exit(0);
}

/** Something is wrong and the operator has to fix it before any figure means anything. */
function refuse(message: string): never {
  console.error(`\nOCR accuracy baseline REFUSED.\n\n  ${message}\n`);
  console.error('Nothing was written. A baseline is a number future work is judged');
  console.error('against, and this harness will not invent one.\n');
  process.exit(1);
}

const samplesDir = argValue('--samples');
const endpoint = process.env.OCR_EXTRACT_URL ?? process.env.VISION_EXTRACT_URL ?? null;
const token = process.env.OCR_EXTRACT_TOKEN ?? process.env.VISION_EXTRACT_TOKEN ?? null;

// ---------------------------------------------------------------------------
// Absence: exit cleanly, record NOT MEASURED
// ---------------------------------------------------------------------------

if (!samplesDir) {
  notMeasured(
    'No sample set was supplied. Pass `--samples <dir>` containing `manifest.json` and the '
    + 'images, with a human-transcribed ground truth for each.',
  );
}
const manifestPath = join(samplesDir, 'manifest.json');
if (!existsSync(manifestPath)) {
  notMeasured(
    `No manifest at \`${manifestPath}\`. See the header of \`scripts/ocr-accuracy-baseline.mts\` `
    + 'for its shape.',
  );
}

let manifest: Manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
} catch (error) {
  // A manifest that exists and does not parse is a fault, not an absence.
  refuse(`The manifest at ${manifestPath} is not valid JSON: ${String(error).slice(0, 160)}`);
}

// ---------------------------------------------------------------------------
// Invalidity: refuse
// ---------------------------------------------------------------------------

if (!['synthetic', 'consented_staff_samples', 'public_specimen'].includes(manifest.sampleSource)) {
  refuse(
    `sampleSource "${manifest.sampleSource}" is not permitted. WPS-024 forbids testing with `
    + 'production customer documents; declare synthetic, consented_staff_samples or public_specimen.',
  );
}
if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
  refuse('The manifest declares no samples.');
}
if (!manifest.samples.some((s) => s.readable === false)) {
  refuse(
    'Every sample is marked readable. The unreadable-document rate cannot be measured from a '
    + 'set of clean images, and a baseline that only covers good photographs measures the wrong '
    + 'thing — real submissions include cards photographed in a stairwell at night.',
  );
}
for (const sample of manifest.samples) {
  if (!existsSync(join(samplesDir, sample.file))) {
    refuse(`The manifest lists ${sample.file}, and it is not in ${samplesDir}.`);
  }
  if (sample.readable && Object.keys(sample.truth ?? {}).length === 0) {
    refuse(
      `${sample.file} is marked readable and carries no ground truth. Accuracy against nothing `
      + 'is not accuracy.',
    );
  }
}

if (!endpoint || !token) {
  notMeasured(
    'No extraction endpoint is configured. Set `OCR_EXTRACT_URL` and `OCR_EXTRACT_TOKEN` to a '
    + 'deployed extraction function in a local or staging environment. This harness never runs '
    + 'against production, and never against production customer documents.',
  );
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

const results: PerSampleResult[] = [];

for (const sample of manifest.samples) {
  const started = Date.now();
  let payload: {
    outcome?: string;
    candidates?: { fieldKey: string; editableValue: string }[];
    meanConfidence?: number;
  };
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        // The harness posts a path the function can read, exactly as the app
        // does. Measuring a different code path than production would make the
        // baseline describe something nobody ships.
        storagePath: sample.file,
        documentType: sample.documentType,
        baselineRun: true,
      }),
    });
    payload = await response.json();
  } catch (error) {
    refuse(`Sample ${sample.file} could not be processed: ${String(error).slice(0, 160)}`);
  }
  const latencyMs = Date.now() - started;

  const candidates = new Map(
    (payload.candidates ?? []).map((c) => [c.fieldKey, c.editableValue]),
  );

  const fields = Object.entries(sample.truth ?? {}).map(([key, expected]) => {
    const actual = candidates.get(key) ?? null;
    return { key, expected, actual, correct: actual !== null && actual === expected };
  });

  results.push({
    file: sample.file,
    outcome: (payload.outcome as Outcome) ?? 'provider_error',
    latencyMs,
    meanConfidence: typeof payload.meanConfidence === 'number' ? payload.meanConfidence : null,
    fields,
  });
}

const refused = results.filter(
  (r) => r.outcome === 'refused_disabled' || r.outcome === 'refused_no_credential',
);
if (refused.length === results.length) {
  notMeasured(
    'Every request was refused: the extraction provider is disabled or has no credential in the '
    + 'target environment. Enable the provider there and run again.',
  );
}

// ---------------------------------------------------------------------------
// The figures
// ---------------------------------------------------------------------------

const readable = manifest.samples.filter((s) => s.readable);
const unreadable = manifest.samples.filter((s) => !s.readable);
const byFile = new Map(results.map((r) => [r.file, r]));

const succeededOnReadable = readable.filter(
  (s) => byFile.get(s.file)?.outcome === 'succeeded',
).length;
const successfulExtractionRate = succeededOnReadable / readable.length;

/**
 * A false positive is the dangerous outcome and is measured separately from
 * accuracy.
 *
 * It is a field returned CONFIDENTLY and WRONGLY — the case where a worker
 * skimming a pre-filled form accepts a value that is not on their card. A
 * field the extractor declined to guess is not a false positive; it is the
 * system behaving correctly.
 */
const scoredFields = results.flatMap((r) => r.fields);
const returnedFields = scoredFields.filter((f) => f.actual !== null);
const falsePositives = returnedFields.filter((f) => !f.correct);
const falsePositiveRate = returnedFields.length > 0
  ? falsePositives.length / returnedFields.length
  : 0;

// An unreadable sample that the extractor reported as readable is a failure of
// the unreadable detection, so the rate is measured against what it SHOULD have
// rejected.
const correctlyRejected = unreadable.filter((s) => {
  const outcome = byFile.get(s.file)?.outcome;
  return outcome === 'unreadable' || outcome === 'no_text_found';
}).length;
const unreadableRate = correctlyRejected / unreadable.length;

/**
 * Parser failures, separated from OCR failures.
 *
 * `no_text_found` means the provider saw nothing — a capture problem, fixed by
 * a better photograph. `unreadable` on a sample a human could read means the
 * provider DID return text and Warsha's own parser found no fields in it. That
 * is a defect in `ocr-identity-fields.ts`, and no amount of retaking will fix
 * it. Merging the two would send the next person to argue with a vendor about
 * a regular expression.
 */
const parserFailures = readable.filter(
  (s) => byFile.get(s.file)?.outcome === 'unreadable',
).length;
const parserFailureRate = parserFailures / readable.length;

const fieldAccuracy: Record<string, { attempted: number; correct: number; accuracy: number }> = {};
for (const field of scoredFields) {
  const entry = fieldAccuracy[field.key] ?? { attempted: 0, correct: 0, accuracy: 0 };
  entry.attempted += 1;
  if (field.correct) entry.correct += 1;
  entry.accuracy = entry.correct / entry.attempted;
  fieldAccuracy[field.key] = entry;
}

const confidences = results
  .map((r) => r.meanConfidence)
  .filter((c): c is number => c !== null)
  .sort((a, b) => a - b);
const bucket = (lo: number, hi: number) =>
  confidences.filter((c) => c >= lo && c < hi).length;
const confidenceDistribution = {
  '0.00-0.25': bucket(0, 0.25),
  '0.25-0.50': bucket(0.25, 0.5),
  '0.50-0.75': bucket(0.5, 0.75),
  '0.75-1.00': bucket(0.75, 1.01),
};

const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const meanLatency = Math.round(latencies.reduce((t, l) => t + l, 0) / latencies.length);
const p95Latency = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const table = [
  '| Measurement | Value |',
  '| --- | --- |',
  `| Sample source | \`${manifest.sampleSource}\` |`,
  `| Samples | ${manifest.samples.length} (${readable.length} readable, ${unreadable.length} deliberately unreadable) |`,
  `| Parser version | \`${IDENTITY_PARSER_VERSION}\` |`,
  `| Successful extraction rate | **${pct(successfulExtractionRate)}** |`,
  `| False-positive rate | **${pct(falsePositiveRate)}** |`,
  `| Unreadable correctly rejected | **${pct(unreadableRate)}** |`,
  `| Parser failure rate | **${pct(parserFailureRate)}** |`,
  `| Mean latency | **${meanLatency} ms** |`,
  `| p95 latency | **${p95Latency} ms** |`,
  '',
  '| Field | Attempted | Correct | Accuracy |',
  '| --- | ---: | ---: | ---: |',
  ...Object.entries(fieldAccuracy).map(
    ([key, v]) => `| \`${key}\` | ${v.attempted} | ${v.correct} | **${pct(v.accuracy)}** |`,
  ),
  '',
  '| Confidence bucket | Samples |',
  '| --- | ---: |',
  ...Object.entries(confidenceDistribution).map(([k, v]) => `| ${k} | ${v} |`),
].join('\n');

console.log(`\n${table}\n`);

if (outPath) {
  writeFileSync(outPath, `${table}\n`);
  console.log(`Written to ${outPath}`);
}

// The provider key is read from the environment rather than hardcoded, because
// this harness measures whichever provider fills the `identity_ocr` role.
const providerKey = process.env.OCR_PROVIDER_KEY ?? null;
const providerVersion = process.env.OCR_PROVIDER_VERSION ?? null;

if (!providerKey || !providerVersion) {
  console.log(
    '\nSet OCR_PROVIDER_KEY and OCR_PROVIDER_VERSION to the values in the provider registry to\n'
    + 'get the insert statement for this run. They are not guessed: a baseline attributed to the\n'
    + 'wrong provider version is worse than one nobody recorded.',
  );
} else {
  console.log('SQL to record this run:\n');
  console.log(
    'insert into private.ocr_accuracy_runs\n'
    + '  (run_label, provider_key, provider_version, parser_version, sample_source, sample_count,\n'
    + '   successful_extraction_rate, field_accuracy, confidence_distribution,\n'
    + '   false_positive_rate, unreadable_rate, parser_failure_rate, mean_latency_ms, p95_latency_ms,\n'
    + '   environment, notes)\n'
    + `values ('baseline', ${JSON.stringify(providerKey)}, ${JSON.stringify(providerVersion)},\n`
    + `  '${IDENTITY_PARSER_VERSION}', '${manifest.sampleSource}', ${manifest.samples.length},\n`
    + `  ${successfulExtractionRate.toFixed(4)},\n`
    + `  '${JSON.stringify(fieldAccuracy)}'::jsonb,\n`
    + `  '${JSON.stringify(confidenceDistribution)}'::jsonb,\n`
    + `  ${falsePositiveRate.toFixed(4)}, ${unreadableRate.toFixed(4)}, ${parserFailureRate.toFixed(4)},\n`
    + `  ${meanLatency}, ${p95Latency}, 'local',\n`
    + `  ${JSON.stringify(manifest.notes)});`,
  );
}

// The parser is pure and provider-independent, so the regression suite
// exercises it directly without any credential at all.
export { parseIdentityCandidates };
