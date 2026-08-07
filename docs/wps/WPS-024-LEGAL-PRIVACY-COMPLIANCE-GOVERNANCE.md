# WPS-024 — Legal, Privacy, Compliance & Governance

| | |
| --- | --- |
| **Version** | 1.0 |
| **Status** | LOCKED FOR IMPLEMENTATION |
| **Authority** | Warsha Constitution |
| **Depends on** | WPS-001 through WPS-023 |
| **Supersedes** | The previously proposed WPS-024 (Manual QA), which becomes WPS-025 |

---

## 1. Purpose

Warsha has consent and it has verification. What it has never had is an
**agreement**: a versioned document with a publication date, an effective date,
a hash of its exact words, and a record binding a named person to the exact
version they read in the exact language they read it in.

WPS-022 built the right seam for this. `privacy_consent_purposes` already
carries a `document_key` and a `current_version` — it simply had no documents
behind it. WPS-024 supplies them and **extends** that model rather than
building a second one.

The deliverable is a governance framework that can answer, for any account and
any moment: *what did this person agree to, and can we still prove it.*

---

## 2. Scope

**In scope**

- Twenty-six legal documents, complete, in English and Egyptian Arabic.
- A versioned document register with immutable versions and content hashes.
- An append-only acceptance ledger binding person → text → language → instant.
- Materiality classification and the re-consent rules that follow from it.
- Decline handling that never records a decline as consent.
- Subprocessor, data-processing and data-retention registers.
- AI and OCR governance, including a structural bar on training.
- The worker activation model change (provisional activation, post-hoc review).
- Staff governance surfaces, capabilities and audit.

**Out of scope**

- WPS-025: manual QA, UX friction review, defect closure, release certification.
- Integrating Google Cloud Vision, Google Maps Platform or a payment gateway.
- Obtaining legal advice, a compliance finding, or any certification.

---

## 3. Locked product decisions

These are implemented exactly and are not open to reinterpretation.

### 3.1 Agreements

1. Customer and worker agreements are **separate documents**, accepted
   separately, evaluated independently. A customer re-accepting Customer Terms
   is never dragged through Worker Terms.
2. Every document is complete binding text. No placeholder, no lorem ipsum, no
   `[insert]` token. Asserted by test against the raw source.
3. Every agreement carries: version, published date, effective date, superseded
   version, change class, change summary, and a content hash per language.
4. Every acceptance records: version, accepted language, acceptance hash,
   rendered hash, source surface, account role, environment and instant.

### 3.2 Materiality

5. **Material** and **urgent** changes require renewed acceptance before the
   affected functionality continues. **Editorial** and **non-material** changes
   do not, and the system will not ask.
6. A material change covers: pricing or commission, payment or refund
   obligations, identity-document processing, criminal-record processing, OCR
   or AI processing, subprocessors, data retention, dispute rules, worker
   eligibility, suspension or termination, limitation of liability, governing
   terms.
7. Declining is recorded truthfully as a decline. It is **never** recorded as
   acceptance, and inactivity never becomes acceptance — there is no third
   value in the ledger that could be read as "probably agreed".
8. Declining preserves access to records, export, deletion, support, appeals
   and account closure. The consequences shown come from the server and only
   for classes that may restrict.
9. Prior acceptance history is preserved. Declining v2 does not erase that v1
   was accepted.

### 3.3 Machine processing

10. The approved OCR provider is **Google Cloud Vision**, called **server-side
    only**. Credentials never reach a device. Only extracted fields return.
11. OCR is assistive. It **never** decides document authenticity, identity
    authenticity, forgery, criminal eligibility, suspension, or an appeal
    outcome. Confidence values are internal and are never a reason for a
    decision.
12. Identity documents are **not** used for AI model training. Changing that
    requires a governance decision, updated privacy documentation, an updated
    subprocessor and processing register, advance notice, explicit consent
    where required, and a versioned rollout.
13. As at v1.0 neither provider is integrated. The registers say so.

### 3.4 Worker activation

14. A worker becomes **provisionally active** on completing submission. They do
    not wait for a member of staff.
15. Staff review happens **after** activation. Staff may approve, request
    correction, suspend or deactivate.
16. The system may grant a provisional **capability**. The system may make no
    **decision** — it cannot reach `active`, `approved`, `rejected` or
    `suspended`.
17. Provisional activation is still gated: documents uploaded, fields confirmed
    by the worker, certificate submitted, agreements accepted, phone verified,
    not banned, no blocking trust action.
18. A provisionally active worker is not described to customers as verified.

### 3.5 Documents and storage

19. The worker obtains the official criminal-record certificate (فيش وتشبيه)
    themselves and uploads it. Warsha has no Ministry integration.
20. Identity documents live in **private** Supabase Storage, owner-isolated,
    reached only through short-lived signed URLs, with every access audited.
21. The original identity document is retained for **at least one year** unless
    a legal hold or an approved policy extends it.
22. A **reduced review copy** is stored so ordinary review does not require
    opening the original.
23. The **raw OCR provider payload is not permanently stored**. What is kept is
    the extracted fields, a confidence value, a document hash, the provider
    version and a timestamp.

### 3.6 Location and capture

24. The selected map provider is **Google Maps Platform**. The selected camera
    implementation is **Expo Camera**. Document Picker and Image Picker remain
    the upload fallbacks.
25. A confirmed map pin is required before a real booking. GPS permission is
    optional and manual pin placement is always available.
26. Warsha does not display a map surface that pretends to be live when no
    provider is configured.

### 3.7 Registers

27. Supabase, Google Cloud Vision and Google Maps Platform appear in both the
    subprocessor register and the data-processing register.
28. A subprocessor entry states whether it is **in use** or **approved and not
    yet integrated**. The distinction is the point of publishing a register.
29. No lawful basis is asserted as settled. Each is recorded as proposed and
    marked pending legal review.

---

## 4. Constraints

WPS-024 must not create parallel: authentication, profile, consent,
verification, marketplace, booking, worker-dashboard, document-storage, trust,
support, privacy, staff-review, notification or audit systems.

It must preserve every validated behaviour of WPS-001 through WPS-023, the
brand system, the motto `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`, English,
Egyptian Arabic, RTL, dark/light/system appearance, existing RLS, RPCs, Storage
policies, Realtime boundaries, audit systems, Mock/Supabase isolation, tests and
migrations.

It must not:

- perform a hosted mutation;
- claim legal approval, compliance, certification or penetration testing;
- claim physical-device acceptance;
- enable a production OCR, map or payment provider;
- begin WPS-025.

---

## 5. The four documents a person accepts

Twenty-six documents exist. Four are accepted explicitly; the remaining
twenty-two are **incorporated by reference** into the two agreements.

| Role | Accepts |
| --- | --- |
| Customer | Customer Terms, Privacy Policy |
| Worker | Worker Terms, Privacy Policy, Worker Verification Policy |

This is deliberate. Asking somebody to tap through twelve acceptance screens
produces twelve unread documents, not twelve informed decisions. The agreements
state plainly which other documents form part of them.

---

## 6. Acceptance criteria

An implementation satisfies WPS-024 when:

1. All twenty-six documents exist in full in both languages, with no
   placeholder text of any kind.
2. The corpus text hashes to the values the register records, verified by test.
3. An acceptance of text the client did not display is refused by the server.
4. A published version cannot be edited or deleted after acceptance.
5. A decline is recorded as a decline and cannot be rewritten into acceptance.
6. No client role can write the acceptance ledger directly.
7. One account cannot read another account's acceptances.
8. A reviewer can see how many accepted and declined, and cannot see who.
9. A material change with no summary cannot be published.
10. Training on identity data is prevented by a database constraint.
11. The system can grant a provisional capability and cannot make a decision.
12. Every WPS-024 surface ships disabled.
13. Every existing pgTAP and regression assertion still passes, unedited.
14. Mock is account-scoped, makes no call, and enforces the same hash rule.

---

## 7. Deliverables

- `docs/wps/WPS-024-LEGAL-PRIVACY-COMPLIANCE-GOVERNANCE.md` (this document)
- `docs/wes/WES-024-LEGAL-PRIVACY-COMPLIANCE-GOVERNANCE.md`
- `docs/architecture/LEGAL-ARCHITECTURE.md`
- `docs/architecture/CONSENT-ARCHITECTURE.md`
- `docs/architecture/PRIVACY-ARCHITECTURE.md`
- `docs/architecture/DOCUMENT-LIFECYCLE.md`
- `docs/architecture/AGREEMENT-VERSIONING.md`
- `docs/testing/WPS-024-ACCEPTANCE-EVIDENCE.md`
- `docs/testing/WPS-024-MANUAL-GOVERNANCE-SUITE.md`
- `docs/testing/WPS-024-DECISION-LOG.md`
- `docs/testing/WPS-024-SECURITY-REVIEW.md`
- `docs/testing/WPS-024-ARCHITECTURE-REVIEW.md`
- Updated `docs/wps/WPS-INDEX.md`

---

## 8. WPS-025

WPS-025 owns manual QA, UX friction review, defect closure and release
certification. **WPS-024 does not begin it.**
