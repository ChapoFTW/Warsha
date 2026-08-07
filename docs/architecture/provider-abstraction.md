# Provider abstraction — WPS-024

Warsha calls two external services that could plausibly be replaced: an OCR
provider and a map provider. Neither vendor's name appears anywhere in business
logic.

This is not a hypothetical. Vision pricing changes, Places quotas change, and
Egypt-specific alternatives exist for both. The cost of the abstraction is two
interfaces and a registry; the cost of not having it is that switching means
finding every call site in an application that has grown for a year.

---

## Where the vendor is allowed to be named

Exactly four files, and a test asserts it:

```
supabase/functions/_shared/google-vision-provider.ts   ← OCR implementation
supabase/functions/_shared/ocr-providers.ts            ← composition root
supabase/functions/_shared/google-maps-provider.ts     ← map implementation
supabase/functions/_shared/map-providers.ts            ← composition root
components/warsha/GoogleMapRenderer.tsx(.web.tsx)      ← the device renderer
```

Everything else — the Edge Functions, the contracts, the parser, the address
surface, the capability RPCs — asks for a **capability role** and gets whatever
fills it.

---

## Three layers

```
                    ┌──────────────────────────────────────────┐
  business logic    │ vision-extract        location-proxy     │
                    │   asks for 'identity_ocr'   'location'   │
                    └────────────────┬─────────────────────────┘
                                     │  resolve by key
                    ┌────────────────▼─────────────────────────┐
  contract          │ OcrProvider              MapProvider     │
                    │  extractDocument()        autocomplete()  │
                    │  extractIdentity()        placeDetails()  │
                    │  extractConfidence()      forwardGeocode()│
                    │  extractMetadata()        reverseGeocode()│
                    │                           renderMap()     │
                    └────────────────┬─────────────────────────┘
                                     │  registry
                    ┌────────────────▼─────────────────────────┐
  implementation    │ googleVisionProvider   googleMapsProvider │
                    └──────────────────────────────────────────┘
```

The role comes from the database. `private.external_providers.capability_role`
records what a provider is FOR, and `private.provider_for_role()` answers which
one fills it. So the choice of vendor is *data*, and switching is a registry
update plus an implementation file.

---

## Why the OCR interface has four methods

They fail and change for different reasons, and collapsing them would couple
things that should move independently.

**`extractDocument()`** — bytes in, recognised text out. The generic capability
every OCR vendor sells. Nothing about Egypt, nothing about identity documents.

**`extractIdentity()`** — recognised text in, candidate identity fields out.
Most vendors do not do this at all, so the default is Warsha's own parser
(`ocr-identity-fields.ts`) running on top of `extractDocument()`. A vendor that
*does* offer native identity parsing — AWS Textract `AnalyzeID`, for one —
overrides it, and no caller changes.

**`extractConfidence()`** — how sure the provider was, summarised identically
across vendors. This is what makes one accuracy baseline comparable with the
next: if each implementation invented its own arithmetic, a change of vendor
would move the numbers for two reasons at once and nobody could tell which.

**`extractMetadata()`** — provider version, extraction timestamp, confidence and
document hash. WPS-024 requires every OCR result to record all four, so it is a
method on the contract rather than four things each call site remembers.

### The Egyptian ID parser is not vendor knowledge

`ocr-identity-fields.ts` knows about fourteen-digit identifiers, century digits
and Arabic script. It knows nothing about any OCR vendor, and no vendor knows
anything about it. Keeping them apart means a vendor change does not touch the
parser, and a parsing change does not touch the vendor boundary.

It also carries its own version, `IDENTITY_PARSER_VERSION`. Extraction accuracy
moves for two independent reasons — the vendor improved, or the parser did — and
a baseline that cannot tell them apart cannot direct any effort.

---

## Why the map interface has five methods

Four are searches. The fifth is the interesting one.

**`renderMap()`** does not return an image, because no server can draw a map on
a phone. It returns the **descriptor** the client needs in order to pick a
renderer: which renderer, whether a publishable render key is required, what
attribution the vendor's terms demand, and where the map opens.

That keeps the choice of map vendor in one place. The server knows which
provider is active because the registry says so; the client asks and obeys.
Without it, swapping to MapLibre would mean editing a component, and that
component would go on importing `react-native-maps` for a vendor no longer in
use.

### The device half

```
src/providers/map-renderer-types.ts   the contract, types only, no imports
src/providers/map-renderers.ts        the registry: key → component
components/warsha/GoogleMapRenderer    the one renderer Warsha ships
components/warsha/AddressMap           provider-agnostic; imports no map library
```

`resolveMapRenderer()` falls back to the sole registered renderer when the key
is missing or unknown, and returns null once two are registered. That asymmetry
is deliberate: with one renderer, a slow capability lookup should not leave a
customer staring at "maps unavailable" while the only map Warsha ships sits
unused in the bundle. With two, the ambiguity is real and guessing which vendor
to draw would be worse than drawing nothing.

The renderer key is declared in two runtimes that cannot import each other, so
the regression suite reads both files and asserts they agree, and pgTAP asserts
the registry row holds the same string.

---

## Adding a provider

1. Write the implementation against the contract.
2. Register it in the composition root (`ocr-providers.ts` / `map-providers.ts`).
3. Add a registry row with the `capability_role`, a feature flag and — if it
   touches identity data — a kill switch.
4. For a map provider, also write a renderer and register it client-side.
5. Subprocessor Register, Data Processing Register, Privacy Policy — a new
   subprocessor is a **material change** requiring renewed acceptance.

No Edge Function, no screen and no RPC changes.

`identity_ocr` and `location` are **singular roles**: a partial unique index
permits at most one non-retired provider each. Two active OCR providers would
make "which one read this document" unanswerable and the audit trail worthless.
`document_capture` is plural on purpose — camera, image picker and document
picker all fill it, and a worker uses whichever their device and their document
allow.

---

## Provider health

Every provider call records a sample: provider, operation, version, outcome,
latency, attempts, whether it timed out. A rollup carries the cumulative
figures and answers the first question on an incident call — when did this last
work.

**Availability excludes Warsha's own refusals.** A `refused_disabled` outcome
means a kill switch was active; counting our own decision against a supplier's
availability would make the number meaningless during exactly the incident it
exists for.

**An unobserved window reports null, not 100%.** A provider nobody has called
since Tuesday is not healthy — it is unobserved, and a green figure against an
empty window is the kind of reassurance that gets believed.

**No health table holds an account, a document, an extracted value or a
credential.** Health answers "is the vendor working". A health screen that could
also answer "what did this worker submit" would be a second route to identity
data behind a different capability, and the first thing anyone would do with it
is look somebody up. Asserted as a property of the schema, not promised in a
comment.

Surfaced at **Admin → Governance → External providers**, gated on
`review_legal_governance`.

---

## Timeouts and retries live on the contract

| | OCR | Maps |
| --- | --- | --- |
| Timeout | 20 s | 8 s |
| Max attempts | 2 | 2 |

Different because the human situation is different. A worker holding a phone
waiting for an identity card to be read has concluded it is broken somewhere
around twenty seconds; a suggestion that arrives after somebody has finished
typing an address is worse than no suggestion, because it changes what is under
their thumb.

A retry is attempted only for a fault a retry could fix — a transport failure, a
429, a 5xx. A 4xx, a refusal and an unreadable photograph get one attempt: the
same bytes produce the same answer, and retrying doubles the bill and the wait.

---

## Related

- [External Provider Registry](./external-provider-registry.md)
- [Google Cloud setup runbook](../operations/google-cloud-setup-runbook.md)
- [OCR accuracy baseline](../testing/WPS-024-OCR-ACCURACY-BASELINE.md)
- [Privacy architecture](./privacy-architecture.md)
