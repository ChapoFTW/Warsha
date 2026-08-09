# Google Maps material-change approval checklist

Authority: Warsha Constitution → WPS-022 → WPS-024.

Status: **template only — no approval has been given and nothing is published**.

This checklist is the evidence package a human legal/privacy owner must complete
before Warsha sends a worker or customer address, place query, or coordinate to
Google Maps Platform. Engineering may prepare credentials and disabled controls;
it must not infer approval from their existence.

## Decision record

- [ ] Decision owner, role, date and review reference recorded.
- [ ] Google contracting entity and applicable terms identified.
- [ ] Data-processing/subprocessor agreement reviewed.
- [ ] Processing locations and any cross-border transfer position reviewed.
- [ ] Egyptian lawful basis confirmed for address, place-query and coordinate
      processing; a proposed or pending basis is not approval.
- [ ] Existing consent purposes assessed and any new purpose approved.
- [ ] Data categories confirmed: address text, place query, place identifier,
      latitude/longitude and provider request metadata—no identity documents.
- [ ] Retention confirmed for Warsha and Google, including provider logs and
      transient request data.
- [ ] Google terms, key restrictions, billing controls and incident contact
      accepted by the responsible security/operations owners.
- [ ] Location privacy semantics confirmed unchanged: exact worker home/work
      location remains private from customers.

## Human-approved corpus changes

No wording belongs in the repository until the owner approves both languages.

- [ ] Privacy Policy: new material version, exact English and Arabic text.
- [ ] Location Data Policy: new material version, exact English and Arabic text.
- [ ] Subprocessor Register: Google Maps Platform changes from approved/not in
      use to the approved future `in_use` disclosure.
- [ ] Data Processing Register reviewed; update it if the approved purpose,
      lawful basis, recipients, retention or transfer description changes.
- [ ] English material-change summary approved (minimum 20 characters is a
      database floor, not a legal-quality standard).
- [ ] Arabic material-change summary approved as a real translation, not an
      automatically generated placeholder.
- [ ] Effective date and affected audience approved.
- [ ] Renewed-acceptance scope approved for customers, workers, or both.
- [ ] Decline behavior and preserved account rights reviewed.

## Publication and activation evidence

- [ ] The bundled corpus is updated first and both SHA-256 hashes are recorded.
- [ ] First authorized staff member requests dual control for each exact
      `document_key:version:environment` publication.
- [ ] A different authorized staff member checks the text, hashes, summaries,
      effective date and approves each request.
- [ ] `staff_publish_legal_version()` consumes each approval exactly once.
- [ ] A renewed-acceptance path is available before affected functionality is
      allowed to transmit data.
- [ ] Provider activation has its own `google_maps_platform:development`
      approval; legal approval is never reused as provider approval.
- [ ] `location_provider` remains disabled until server credential presence,
      API restrictions and controlled health evidence are recorded.
- [ ] Subprocessor promotion has its own
      `google_maps_platform:development:in_use` approval and occurs only after
      the provider is actually enabled.

## Sign-off

Legal/privacy owner: ____________________  Date: __________

Security owner: _________________________  Date: __________

Operations owner: _______________________  Date: __________

Second approver(s) and dual-control request IDs:

____________________________________________________________________________

Open conditions or refusal reason:

____________________________________________________________________________
