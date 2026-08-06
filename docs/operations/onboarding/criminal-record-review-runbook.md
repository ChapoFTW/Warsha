# Runbook — criminal-record certificate review

Authority: WPS-023. Capability required: `review_criminal_records`
(**high risk, reauth required**).

> **The eligibility policy is not legally approved.** `wps023-v1` carries
> `legal_review_status = 'pending'`. Until a lawyer has answered Q-01, Q-05,
> Q-06 and Q-08 in WPS-023 §18, adverse decisions on this basis should be
> escalated rather than taken routinely.
>
> No decision UI exists yet. The RPCs are implemented and tested; the admin
> surface is read-only.

---

## What you are looking at, and what you are not

The worker obtained this certificate themselves. **Warsha has no Ministry
integration, no government API, and no way to confirm it is genuine.** You are
reading a document, not a verified record.

If you doubt its authenticity, that is `authenticity_concern = true` and an
escalation — not a rejection you can justify on your own.

---

## Before you start

`review_criminal_records` is high-risk and requires reauth. Every open writes a
`private.staff_access_log` row naming you and the capability.

This is the most sensitive document Warsha holds. Open it only for the case in
front of you, and only when you are about to make a decision on it.

---

## Procedure

1. Move the case:
   ```
   staff_worker_vetting_decision(user_id, 'start_certificate_review',
     reason_code, safe_reason)
   ```

2. Open the document:
   ```
   staff_worker_document_reference(user_id, 'criminal_record')
   ```
   300-second expiry. The access is logged before the path is returned.

3. Check the metadata against the document: declared name matches the confirmed
   legal name · issue date matches · document reference matches if present · the
   document is legible and complete.

4. If the certificate is clear, that is the whole decision. Record it and move
   on.

5. If it is not clear, **do not decide alone**. See below.

---

## If the certificate is not clear

You are weighing factors, not applying a rule. `wps023-v1` lists twelve, each
marked `reviewer_judgement`:

offence category · severity · **relevance to entering customers' homes** ·
conviction versus accusation · judgment finality · recency · pending appeal ·
mistaken identity · document authenticity · rehabilitation or legal correction ·
repeat pattern · staff evidence

The single question that matters most: **does this bear on the safety of
somebody letting this person into their home?**

There is no twelve-month rule, no automatic rejection, and no scoring. If you
find yourself wanting one, that is a signal to escalate.

**Escalate to `manual_review` when:** the record is ambiguous · it is an
accusation rather than a final conviction · an appeal is pending · mistaken
identity is plausible · the offence has no obvious bearing on this work · you
are simply unsure.

Escalating is not a failure. An adverse decision that cannot be defended later
is.

---

## Recording an outcome

```
staff_record_certificate_outcome(user_id, status, safe_reason,
  assessment_note, authenticity_concern)
```

`status` ∈ `clear` · `approved` · `correction_required` · `manual_review` ·
`rejected`.

**`safe_reason` goes to the worker.** It must never contain offence
information. The table has no offence column and the RPC has no offence
parameter — the schema will not carry it — but the free-text reason could, and
must not.

Good: *"Your certificate was accepted."*
Good: *"We need a clearer copy of the certificate."*
Bad: anything naming an offence, a date, a court, or a charge.

**`assessment_note` is private.** It goes to
`private.worker_criminal_record_review`, no RPC returns it, and the worker
cannot read it. Write what you actually saw and why you reached your view — this
is the record that defends the decision.

The server refuses an outcome whose assessment note is shorter than ten
characters.

---

## Rejection

Requires `reject_worker_application` — a **different capability**, with dual
control. Recording a certificate outcome of `rejected` and rejecting the
application are two decisions by design.

---

## Never

- Put offence detail in `safe_reason`, a notification, a support ticket, a chat
  message, or any log.
- Discuss the contents outside the case record.
- Reject on a low-confidence extraction — extraction cannot reach this decision
  and is asserted not to.
- Decide an appeal against your own adverse decision. The server refuses it.
- Treat the illustrative offence categories in WPS-023 §11.1 as approved policy.
  They are not.
