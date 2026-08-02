# Payment and Payout Provider Selection

## Document metadata

| Field | Value |
| --- | --- |
| Decision | Egyptian payment acceptance and payout provider for Warsha |
| Status | **DEFERRED — provider activation is a formal decision gate** |
| Authority | Warsha Constitution → WPS-007 → WPS-015 |
| Owner | Sief Abdelghfar |
| Last researched | 2026-08-02 |

## Outcome

**No provider can be authoritatively selected from public information alone.**

Every remaining unknown is commercial, legal, or contractual — not technical. The
provider-neutral production foundation described in WPS-015 and WES-015 is
therefore implemented in full, and provider activation is held behind an explicit
decision gate. This follows the Constitution's rule (§6.5) that a decision
depending on information Warsha does not yet have is deferred rather than guessed.

Nothing in this document authorizes live money movement.

## Evidence classification

Every row in the matrices below is labelled with exactly one classification:

| Label | Meaning |
| --- | --- |
| **Confirmed fact** | Stated in official provider or regulator documentation, cited below |
| **Commercial question** | Answerable only by a signed commercial conversation (pricing, eligibility, limits) |
| **Legal question** | Requires Egyptian legal, tax, or regulatory professional confirmation |
| **Implementation inference** | A reasonable engineering conclusion drawn from confirmed facts, not itself confirmed |
| **Unresolved blocker** | Prevents provider selection until answered |

No fee, rate, settlement term, or eligibility rule has been invented. Where this
document does not state a number, Warsha does not yet know it.

## Candidates evaluated

Three Egyptian-licensed candidates with public technical documentation were
evaluated. All are payment institutions operating under Central Bank of Egypt
regulation; Warsha has confirmed none of their commercial terms.

### Paymob

| Capability | Classification | Finding |
| --- | --- | --- |
| Backend-created payment intent | **Confirmed fact** | The Intention Creation API starts every SDK payment from the merchant backend and returns an intention reference (client secret) passed to the mobile SDK |
| Webhook signature verification | **Confirmed fact** | Callbacks are authenticated using HMAC verification to confirm the callback came from Paymob and was not altered |
| Mobile SDKs | **Confirmed fact** | Mobile SDKs are documented for native integration |
| Payouts / disbursement | **Confirmed fact** | The Instant Cashin API disburses to issuers `vodafone`, `etisalat`, `orange`, `bank_wallet`, `bank_card`, `instant_bank`, and `post` |
| Payout idempotency | **Confirmed fact** | `client_reference_id` (UUID, for timeout scenarios) and `client_reference` (unique merchant identifier) are documented reference mechanisms |
| Payout status inquiry | **Confirmed fact** | A Bulk Transaction Inquiry API exists for checking transaction status |
| Payout settlement timing | **Confirmed fact** | Wallet transactions complete immediately; bank cards require approximately 2 working days; instant bank updates occur asynchronously within minutes to hours |
| Payout recipient data requirement | **Confirmed fact** | All issuers require `amount` and the recipient's `national_id`; bank card additionally requires `full_name`, `bank_card_number`, `bank_code`, `bank_transaction_type` |
| Meeza card acceptance | **Commercial question** | Not confirmed from the documentation reviewed |
| Apple Pay / Google Pay | **Commercial question** | Not confirmed from the documentation reviewed |
| Merchant discount rate and fees | **Commercial question** | Public pricing page exists; Warsha's actual rate is contractual |
| Marketplace split payments | **Commercial question** | Not confirmed |
| Individual vs incorporated eligibility | **Unresolved blocker** | Not publicly documented |

### Geidea

| Capability | Classification | Finding |
| --- | --- | --- |
| Meeza Digital integration | **Confirmed fact** | Geidea became the first non-bank institution to integrate directly with Meeza Digital |
| Meeza QR wallet payment | **Confirmed fact** | Documented as a payment method: customer selects mobile wallet on a hosted payment page, a QR code is generated, and the customer approves in their wallet app |
| Hosted payment page | **Confirmed fact** | Documented as the integration surface for the Meeza wallet method |
| Merchant onboarding data | **Confirmed fact** | Requires National ID and Commercial Register Number for merchant registration |
| Payment links | **Confirmed fact** | Offered as a documented product for Egypt |
| Tokenization, refunds, webhooks, payouts | **Commercial question** | Not covered in the documentation reviewed; requires the full documentation index |
| Commercial Register requirement | **Unresolved blocker** | Merchant registration referencing a Commercial Register Number implies an incorporated entity |

### Kashier

| Capability | Classification | Finding |
| --- | --- | --- |
| Card acceptance | **Confirmed fact** | Accepts Mastercard/Visa credit, debit and prepaid cards |
| Meeza card acceptance | **Confirmed fact** | Accepts local Meeza cards |
| Channels | **Confirmed fact** | Online and in-store acceptance |
| Settlement timing to merchant | **Confirmed fact** | Payments are transferred automatically to the merchant bank account, or mobile wallet, after 3 working days from the transaction date |
| Developer APIs and SDKs | **Confirmed fact** | Documented API and SDK integration is offered |
| Webhook signing, tokenization, partial refunds | **Commercial question** | Not confirmed from the sources reviewed |
| Provider payouts to third parties | **Commercial question** | Merchant settlement is documented; disbursement to workers as third-party recipients is not |
| Merchant discount rate | **Commercial question** | Contractual |

## Requirement coverage matrix

| Requirement | Paymob | Geidea | Kashier |
| --- | --- | --- | --- |
| Egyptian card acceptance | Commercial question | Commercial question | **Confirmed fact** |
| Meeza cards | Commercial question | Commercial question | **Confirmed fact** |
| Meeza wallet / QR | Commercial question | **Confirmed fact** | Commercial question |
| Mobile-wallet acceptance | **Confirmed fact** (payout side) | **Confirmed fact** | Commercial question |
| Apple Pay / Google Pay | Commercial question | Commercial question | Commercial question |
| Hosted checkout / payment links | Implementation inference | **Confirmed fact** | Commercial question |
| Tokenization / saved payment | Commercial question | Commercial question | Commercial question |
| Refunds (full) | Commercial question | Commercial question | Commercial question |
| Partial refunds | Commercial question | Commercial question | Commercial question |
| Webhook signing | **Confirmed fact** (HMAC) | Commercial question | Commercial question |
| Idempotency | **Confirmed fact** (payouts) | Commercial question | Commercial question |
| Reconciliation export/API | **Confirmed fact** (bulk inquiry) | Commercial question | Commercial question |
| Split / marketplace payments | Commercial question | Commercial question | Commercial question |
| Provider payouts | **Confirmed fact** | Commercial question | Commercial question |
| Bank-account payouts | **Confirmed fact** | Commercial question | Commercial question |
| Mobile-wallet payouts | **Confirmed fact** | Commercial question | Commercial question |
| Settlement timing | **Confirmed fact** (per channel) | Commercial question | **Confirmed fact** (3 working days) |
| Chargebacks / disputes | Commercial question | Commercial question | Commercial question |
| Sandbox quality | Implementation inference | Implementation inference | Implementation inference |
| Expo / React Native compatibility | **Implementation inference** — see below | Implementation inference | Implementation inference |
| PCI scope | **Implementation inference** — see below | Implementation inference | Implementation inference |
| Individual vs incorporated eligibility | Unresolved blocker | Unresolved blocker | Unresolved blocker |
| D-U-N-S / company documents | Unresolved blocker | Unresolved blocker | Unresolved blocker |
| Support quality | Commercial question | Commercial question | Commercial question |

### Named implementation inferences

These are engineering conclusions, explicitly **not** confirmed facts:

1. **Expo compatibility.** A provider offering a hosted checkout page or payment
   link can be integrated from Expo without a custom native module, because the
   payment is collected in a provider-hosted web context. A provider-native
   mobile SDK may require a development build rather than Expo Go. Warsha's
   architecture therefore targets hosted checkout first.
2. **PCI scope.** Collecting card data exclusively in a provider-hosted context
   keeps card data out of Warsha's systems and minimizes PCI scope. This is an
   architectural intention, **not** a PCI assessment, and carries no certification
   claim.
3. **Payout recipient identity.** Paymob's documented requirement for a recipient
   `national_id` on every payout issuer implies Warsha would need to collect and
   process worker national ID numbers to disburse. This is a material privacy,
   data-minimization, and legal consideration recorded in the threat model.

## Unresolved blockers

Provider selection cannot complete until every item below is answered:

1. **Entity eligibility.** Whether Warsha can onboard as its current legal entity,
   or whether an Egyptian incorporated entity with a Commercial Register Number is
   required. — *Unresolved blocker / Legal question*
2. **Commercial terms.** Merchant discount rate, per-transaction fees, payout
   fees, settlement schedule, minimum volumes, and rolling-reserve requirements.
   WPS-007 locks a **zero** rolling reserve and a **zero** withdrawal fee to the
   worker; a provider requiring a reserve would require constitutional review. — *Commercial question*
3. **Marketplace disbursement licensing.** Whether Warsha may disburse to
   independent workers as third-party recipients, and under what CBE licensing
   basis. — *Legal question / Unresolved blocker*
4. **Worker national-ID processing.** Whether collecting worker national ID
   numbers for payouts is lawful, proportionate, and consistent with Egyptian data
   protection law. — *Legal question / Unresolved blocker*
5. **Tax treatment.** Withholding, VAT, and reporting obligations on commission
   and worker earnings. WPS-007 implements **no** tax calculation. — *Legal question*
6. **Chargeback liability allocation.** Who bears chargeback loss, and the
   evidence window. WPS-007 forbids automatic external debit from a worker. — *Commercial question / Legal question*
7. **Partial-refund support.** WPS-007's cumulative proportional reversal model
   requires provider partial refunds. — *Commercial question*
8. **Webhook signing scheme.** The exact algorithm, canonical payload, and
   timestamp/replay semantics for the selected provider. — *Commercial question*

## Decision gate

Provider activation requires **all** of the following, recorded in
`docs/testing/WPS-015-PRODUCTION-READINESS.md`:

- [ ] Provider selected with every unresolved blocker above answered in writing
- [ ] Commercial contract executed
- [ ] Egyptian legal and accounting confirmation obtained (tax, licensing, data protection)
- [ ] Sandbox credentials issued and a sandbox account row activated
- [ ] Webhook signature verification implemented against the provider's real scheme and verified end to end in sandbox
- [ ] Payout destination tokenization confirmed available; otherwise payouts stay closed
- [ ] Secrets deployed to the server boundary only, never to any Expo bundle
- [ ] Operations, incident, and reconciliation runbooks reviewed and approved
- [ ] Owner authorization for the hosted migration and for enabling each mode

Until every box is checked, `gateway_mode` and `payout_mode` remain `disabled`,
and the database fails closed by construction.

## Sources

- [Paymob Developer Portal](https://developers.paymob.com/)
- [Paymob Egypt Developer Hub](https://developers.paymob.com/hub/egypt)
- [Paymob Intention Payment API](https://developers.paymob.com/egypt/checkout/integration-guide-and-api-reference/intention-payment-api)
- [Paymob Instant Cashin (Payouts) API](https://payouts.paymobsolutions.com/docs/instant_cashin_api/)
- [Paymob Payouts product page](https://paymob.com/en/payouts)
- [Geidea Meeza QR Wallet Payment documentation](https://docs.geidea.net/docs/meeza-qr-payment-method)
- [Geidea Egypt payment gateway](https://www.geidea.net/egy/en/solutions/payments/payment-gateway)
- [Kashier FAQs](https://www.kashier.io/en/faqs)
- [Meeza (Egyptian Banks Company)](https://meeza-eg.com/)

## Changelog

- 2026-08-02 — Initial research. No provider selected; activation deferred to the decision gate above.
