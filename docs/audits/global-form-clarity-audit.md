# Global form clarity audit

Reviewed: 2026-08-21
Surfaces: Android, iOS, public/customer/worker/admin web
Locales: English, Arabic, French

## Outcome

The pass preserves backend field names and business rules while replacing
placeholder-only or internal wording at the presentation boundary. A visible
label now carries the meaning; examples remain optional placeholders. Shared
mobile code covers Android and iOS. Web uses the same product meaning through
its locale catalog.

| Concept / surface | Previous presentation | Approved presentation |
| --- | --- | --- |
| Saved customer address | `Label` | `Address name` plus “Give this address a name, such as Home or Work.” |
| Address pin | Raw latitude/longitude or coordinates treated as success | Search, current location, or map selection; success only after a resolved address and confirmed pin |
| Building detail | Implied required by a generic placeholder | `Building (optional)` with an example |
| Floor/apartment/landmark | Placeholder carried the only meaning | Persistent customer-only labels with explicit optional status |
| Worker work location | Customer booking instructions and destination fields | Worker-specific location purpose; no customer notes, floor, apartment, or coordinate inputs |
| Worker portfolio/certificates | Placeholder-only title/description fields | Persistent field labels and accessible names |
| Worker quote | Placeholder-only price, arrival, duration, message | Persistent localized labels; placeholders are examples only |
| Provider job actions | Internal/raw state values in controls | Localized action and status copy |
| Analytics export | Unexplained free-text reason | Visible reason label, purpose helper, minimum length, recent-authentication notice |

## Address wording

| Meaning | English | Arabic | French |
| --- | --- | --- | --- |
| Address name | Address name | اسم العنوان | Nom de l’adresse |
| Helper | Give this address a name, such as Home or Work. | سمّي العنوان باسم سهل زي البيت أو الشغل. | Donnez un nom à cette adresse, par exemple Domicile ou Travail. |
| Building | Building (optional) | المبنى (اختياري) | Bâtiment (facultatif) |
| Service directions | Instructions for the worker (optional) | تعليمات للصنايعي (اختياري) | Indications pour le professionnel (facultatif) |

Customer booking may retain floor, apartment, landmark, and access notes
because they describe a service destination. Worker onboarding intentionally
does not render those fields. Neither flow accepts hand-entered latitude or
longitude.

## Errors and statuses

Raw RPC names, database enum identifiers, HTTP status text, provider
credential details, and authorization implementation details remain out of
customer and worker UI. Product surfaces render actionable localized copy and
may retain the original error only in development logging. Admin pages retain
capability keys where operators need an exact governance reference, but pair
them with plain-language purpose, consequences, fresh-authentication, and
dual-control guidance.

## Accessibility

- Every audited text input has a persistent visible label and an
  `accessibilityLabel`/HTML label.
- Helper text is associated with web fields through `aria-describedby`.
- Search suggestions expose combobox/listbox roles and keyboard navigation.
- Status and validation failures use alert semantics where the existing
  component architecture supports them.
- Arabic stays RTL; English and French stay LTR. Mixed numeric address content
  is displayed, never used to infer authoritative coordinates.

## Intentionally retained technical terms

- Staff capability keys are retained in the admin manual because they are the
  exact backend authority operators must verify.
- Cairo timezone identifiers and ISO dates are retained in analytics exports
  because exports are machine-readable evidence.
- Provider and RPC identifiers may appear in development diagnostics and
  tests, but not in normal user-facing failure messages.

The deterministic `test:form-clarity` and `test:address-location` checks guard
these presentation boundaries.
