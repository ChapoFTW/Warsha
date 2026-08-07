# Document lifecycle — WPS-024

Two different things are called "documents" in Warsha and they have almost
nothing in common. This page covers both, side by side, because confusing them
is easy and expensive.

| | **Legal documents** | **Identity documents** |
| --- | --- | --- |
| What | Terms, policies, registers | National ID images, criminal-record certificates |
| Who authors | Warsha | The worker |
| Stored in | The repository, hashed into the DB | Private Supabase Storage |
| Readable by | Everyone | The owner, and staff with a specific capability |
| Exported | n/a | **Never** |
| Retained | Forever — a superseded version is what somebody accepted | At least one year, then manual review |
| Owner | WPS-024 | WPS-023, governed by WPS-024 |

---

## Part 1 — legal documents

```
  authored in src/legal/legal-corpus-*.ts
        │
        ▼
  hashed  ──→ registered as a version (status: draft)
        │
        ▼
  published ──→ becomes current when effective_at <= today
        │
        ├──→ accepted by a person  ──→ immutable ledger row
        ├──→ declined by a person  ──→ immutable ledger row (as a decline)
        │
        ▼
  superseded by a later version ──→ stays readable forever
```

Nothing leaves this diagram. A superseded version is never deleted: somebody
accepted it, and they are entitled to see what they accepted.

### Twenty-six documents, four accepted

| Accepted explicitly | Incorporated by reference |
| --- | --- |
| Customer Terms | Acceptable Use, Worker Code of Conduct, Content, IP, Trust & Safety, Appeals, Cancellation, Refund |
| Worker Terms | AI Usage, OCR Usage, Location Data, Data Processing, Data Retention, Cookie |
| Privacy Policy | Subprocessor Register, Data Processing Register, Data Retention Register |
| Worker Verification Policy | Incident Response, Security Disclosure, Accessibility, Version History, Legal Contact |

Twelve acceptance screens produce twelve unread documents, not twelve informed
decisions. The two agreements say plainly which documents form part of them.

### Language

Twelve documents carry a **full parallel Arabic text**; fourteen carry a
**complete Arabic summary** with English named as authoritative.

The line is drawn deliberately: text a person is asked to **agree** to is
published in full in both languages — and every one of the four
acceptance-required documents is in that twelve. Text that **explains how a
system works** carries a summary. Publishing a machine-quality Arabic rendering
of a technical policy and calling it binding would be worse than either option.

The reader states which applies, on the page, every time. `arabicIsSummary` is
a column, a corpus field and an assertion.

---

## Part 2 — identity documents

WPS-023 owns the mechanics. WPS-024 governs them.

```
  worker captures or uploads
        │
        ▼
  private storage, owner-isolated path {user_id}/{file}
        │
        ├──→ reduced review copy      (ordinary staff review)
        ├──→ original                 (opened only when necessary)
        ├──→ content hash             (proves the reviewed doc is the submitted doc)
        ├──→ extracted fields         (candidates until the worker confirms)
        ├──→ confidence value         (internal, never a reason for anything)
        └──→ provider + version + timestamp
        │
        ▼
  every access logged: who, when, under which capability
        │
        ▼
  retained ≥ 1 year from upload
        │
        ▼
  worker account closure ──→ manual review, not automatic deletion
```

### What is deliberately not kept

**The raw provider payload.** It is a second copy of the identity document in
another form, and keeping it would double the exposure for no benefit the
extracted fields do not already give. The AI and OCR policies both say so, and
the register records it.

### Signed URLs

Review uses a short-lived signed URL (300 seconds, registered in
`storage_bucket_lifecycle`). No public bucket, no public link, no Realtime
publication.

### Access logging

Every access is recorded **whether or not anything was found**. A log that only
records discoveries cannot show that a lookup was improper, which is the thing
an audit is for.

Opening a criminal-record certificate requires a stronger capability than
opening an ID, plus re-authentication.

### Offence detail

Confined to `private.worker_criminal_record_review`. It is never stored on the
account record, never returned to any client, and never included in a
notification. The certificate table has no offence column **at all** — asserted
by pgTAP, because a column that exists is a column something will eventually
write to.

---

## Retention, both kinds

| Item | Trigger | Period | At expiry | Status |
| --- | --- | --- | --- | --- |
| Legal versions | none | forever | n/a | settled |
| Acceptances | account closure | proposed 2555d | **manual review** | pending legal review |
| Identity original | upload | **≥ 1 year** floor | manual review | floor set by Warsha; longer period pending |
| Criminal record | worker account closure | proposed | manual review | pending legal review |
| Extraction candidates | field confirmation | proposed 30d | delete | pending legal review |

Where a period has not been settled by advice, the register says so, the action
at expiry is manual review rather than deletion, and the rule is **disabled**
so nothing can execute against it.

The alternative — writing a plausible number and letting an automated job
delete against it — risks destroying evidence somebody is entitled to, or that
Warsha is required to keep. A proposal marked as a proposal is honest. A guess
presented as a legal period is not.

**As at v1.0, no retention rule created by Warsha is enabled.**

## Related

- [Legal architecture](./legal-architecture.md)
- [Privacy architecture](./privacy-architecture.md)
- [Agreement versioning](./agreement-versioning.md)
