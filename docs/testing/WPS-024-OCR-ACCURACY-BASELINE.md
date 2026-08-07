# WPS-024 — OCR accuracy baseline

## Status: **NOT MEASURED**

No accuracy baseline has been measured. `private.ocr_accuracy_runs` is empty
and the pgTAP suite asserts that it is.

This is not an oversight and it is not a deferral of work that could have been
done. Measuring the baseline requires two things that do not exist in this
environment:

1. **A Google Cloud Vision credential.** No GCP project, service account or
   billing account has been supplied. `private.external_providers` records
   `google_cloud_vision` as `implemented_awaiting_credential`, and
   `private.provider_enabled('google_cloud_vision')` returns false.
2. **A sample set of Egyptian National ID images with transcribed ground
   truth.** None exists in this repository, synthetic or otherwise.

The harness that produces the baseline is built and covered by the regression
suite. With either input missing it **records NOT MEASURED and exits cleanly**:
nothing is estimated, nothing is written to the database, and a pipeline that
runs it before anyone has assembled a sample set is not permanently red.

It distinguishes two things that look alike and are not. **Absence** — no sample
set, no endpoint — is not a fault; the measurement simply has not been made, and
the run exits 0 having written the words NOT MEASURED. **Invalidity** — a
forbidden sample source, a missing image, a manifest of only clean photographs,
a readable sample carrying no transcribed ground truth — would produce a
misleading figure, so the run fails with a non-zero exit. Both refuse to invent
anything; the difference is only whether an operator has something to fix.

> A fabricated baseline would be worse than an absent one. A baseline is the
> number every future change to extraction is judged against; inventing it
> would silently redefine "improvement" against a fiction, and the fiction
> would be indistinguishable from a measurement to everyone who read it later.

---

## The measurements

When run, the harness produces exactly the figures WPS-024 requires, plus one
that separates a defect in Warsha's parser from a defect in the vendor's OCR.

| # | Measurement | How it is computed | Value |
| --- | --- | --- | --- |
| 1 | Successful extraction rate | Samples marked readable that returned `succeeded`, over all readable samples | **NOT MEASURED** |
| 2 | Field-by-field accuracy | Per field key: extracted value exactly equal to transcribed ground truth, over attempts | **NOT MEASURED** |
| 3 | Confidence distribution | Mean per-sample confidence, bucketed into four quartiles | **NOT MEASURED** |
| 4 | False-positive rate | Fields RETURNED and WRONG, over fields returned | **NOT MEASURED** |
| 5 | Unreadable-document rate | Deliberately unreadable samples correctly rejected, over unreadable samples | **NOT MEASURED** |
| 6 | Extraction latency | Mean and p95 wall-clock, measured at the Edge Function boundary | **NOT MEASURED** |
| 7 | Parser failures | Readable samples the provider READ and the parser found no fields in, over readable samples | **NOT MEASURED** |

### Why parser failures are measured separately from OCR failures

`no_text_found` means the provider saw nothing — a capture problem, fixed by a
better photograph. `unreadable` on a sample a human could read means the
provider *did* return text and Warsha's own parser found no fields in it. That
is a defect in `ocr-identity-fields.ts`, and no amount of retaking will fix it.

Merging the two would send the next person to argue with a vendor about a
regular expression. The run also records `parser_version`, so an accuracy change
can be attributed to the thing that actually changed.

### Why the false-positive rate is measured separately from accuracy

They are different failures with very different consequences.

A field the extractor **declines to guess** is the system working: the worker
types it, and nothing is wrong. That lowers the extraction rate and is not a
defect.

A field returned **confidently and wrongly** is the dangerous outcome. A worker
skimming a pre-filled form may accept a value that is not on their card, and
the confirmation step — which is the whole safeguard — gets defeated by a
plausible-looking wrong answer.

So the harness measures the second separately and does not let a high
extraction rate hide it.

### Why the sample set must contain unreadable documents

An unreadable rate cannot be measured from a set of clean images, and a
baseline built only from good photographs measures the wrong thing. Real
submissions include cards photographed in a stairwell at night, at an angle,
with a thumb over one corner.

The harness **refuses to run** if every sample is marked `readable: true`.

---

## Running it

```bash
node --experimental-strip-types scripts/ocr-accuracy-baseline.mts \
  --samples ./ocr-samples \
  --out docs/testing/WPS-024-OCR-BASELINE-RESULTS.md
```

Requires:

| Requirement | Why |
| --- | --- |
| `OCR_EXTRACT_URL` | A deployed extraction function in **local or staging**. Never production. |
| `OCR_EXTRACT_TOKEN` | A caller token. The harness exercises the same path the app does, so the baseline describes what ships. |
| `OCR_PROVIDER_KEY` and `OCR_PROVIDER_VERSION` | Read from the provider registry, never guessed. A baseline attributed to the wrong provider version is worse than one nobody recorded, because it *will* be compared with. |
| `--samples <dir>` with `manifest.json` | The sample set and its ground truth. |

The harness is provider-agnostic: it posts to the extraction endpoint exactly as
the app does and scores what comes back, so a change of OCR vendor is measured
by this harness unchanged. That is the point of a baseline meant to outlive a
vendor decision.

### Sample manifest

```json
{
  "sampleSource": "synthetic",
  "notes": "Generated cards. No real identities.",
  "samples": [
    {
      "file": "front-01.jpg",
      "documentType": "national_id_front",
      "readable": true,
      "truth": {
        "national_id_number": "29801011234567",
        "legal_name_ar": "…",
        "date_of_birth": "1998-01-01"
      }
    },
    {
      "file": "front-blurred-01.jpg",
      "documentType": "national_id_front",
      "readable": false,
      "truth": {}
    }
  ]
}
```

`sampleSource` must be `synthetic`, `consented_staff_samples` or
`public_specimen`. Anything else is refused by the harness **and** by a CHECK
constraint on `private.ocr_accuracy_runs`, and `environment` may never be
`production`.

**Production customer documents may not be used.** A field absent from `truth`
is not scored, so a partial transcription is honest rather than penalised.

---

## What the baseline is for

The objective is explicitly **not** perfect OCR.

Extraction is assistive. It fills a form the worker then confirms, and it
decides nothing — not document authenticity, not identity, not forgery, not
criminal eligibility, not approval. A poor extraction rate costs a worker some
typing. It cannot cost them their account, because no extraction outcome is an
input to any decision.

So the baseline exists to answer one question: *did this change make it better
or worse?* That requires a measured starting point and a repeatable method, and
this document plus the harness is that method waiting for its inputs.

---

## Acceptance position

| Item | State |
| --- | --- |
| Harness implemented | **Yes** |
| Harness covered by regression suite | **Yes** |
| Measurement schema in the database | **Yes** — `private.ocr_accuracy_runs` |
| Production customer documents structurally excluded | **Yes** — CHECK constraint |
| Parser failures separated from OCR failures | **Yes** — `parser_failure_rate`, `parser_version` |
| Harness independent of any vendor | **Yes** — no provider is hardcoded |
| Credential supplied | **No** |
| Sample set supplied | **No** |
| **Baseline measured** | **NO** |

WPS-024's local acceptance records this as an outstanding item, not as a
completed one. The two inputs are procurement and sample-preparation tasks, not
engineering ones.
