# Warsha v0.7 Provider Trust & Verification Audit

## Product boundary

Warsha remains a marketplace for independent service providers. Verification is a customer-trust signal, not hiring, training, employment, career management, or a condition for receiving work. A Skill Certificate is optional and independently reviewed.

## Whole-application UX audit

| Area | Finding | Decision |
| --- | --- | --- |
| Customer home | The address selector and recent-booking card displayed placeholder data or actions. “Warsha Select” and its inactive claim button implied unsupported curation/action. | Removed the placeholder address control, connected recent booking to real booking state, and removed the unsupported curation label/action. |
| Customer search and categories | Filters, sorting, availability, rating, price, distance, and verified-only controls improve comparison and booking confidence. | Preserved; touch targets were increased. |
| Customer provider cards/profile | Existing verification was an unexplained icon. | Replaced it with explicit positive-only identity and optional Skill Certificate indicators. No workflow or document detail is exposed. |
| Customer booking | The five steps collect only service, problem, location, time, and confirmation data required to make a usable booking. | Preserved. |
| Customer chat | Chat is booking-participant scoped, while the global tab and pre-booking “Chat now” action led to an empty screen. | Hid the empty global tab and removed pre-booking chat. Secure chat remains available from a booking. |
| Orders, reviews, notifications | These surfaces support job transparency, trust, communication, and recovery from errors. | Preserved. Verification notification routes were added. |
| Authentication and password recovery | Authentication is shared by customer and provider modes and does not imply employment. | Preserved. |
| Customer profile/favourites | These are simple account and marketplace controls. | Preserved. |
| Provider navigation | Five sections included a metrics dashboard, calendar duplicate, and placeholder messages. | Reduced to two large choices: Jobs and Work profile. Verification is a prominent job-screen card. Chat remains inside each job. |
| Provider dashboard | Acceptance rate, completion rate, average rating, eight metrics, and onboarding status resembled an enterprise employee dashboard. | Removed. The main provider surface is job-first and shows only verification status plus job groups. |
| Provider job list | Six status tabs required unnecessary decisions. | Reduced to New, Active, and Done without losing any booking status. |
| Provider profile | “Foundation,” “onboarding,” completion percentage, and every optional biography field being mandatory created HR-style friction. | Reworded as an independent Work profile, removed the percentage, marked biography/experience/language/skills optional, and limited go-live requirements to trade, service, area, and agreement. |
| Provider verification | No complete workflow existed. | Added a three-photo identity flow, masked 14-digit National ID entry, optional documents, clear status/reason, large controls, retry/replace/delete while editable, and mock parity. |
| Empty/error/loading states | Existing states are short, actionable, and generally localized. | Preserved; verification adds equivalent retry and status states. |
| Reusable controls | Several common buttons were below a 44-point touch target. An earlier brand tagline did not match the current brand authority. | Increased common touch targets; the later locked brand correction now requires `YOUR WORK, OUR MISSION` / `شغلك مهمتنا`. |

## Security architecture

- `private.provider_verification_identities` stores only a SHA-256 hash and last four National ID digits. It is outside the API schema and has no client grants.
- `public.provider_verifications` contains only workflow state, provider-visible reason, review timestamps, and the optional-certificate answer.
- `public.provider_verification_documents` contains owner/staff-only metadata. Customers cannot select it.
- Customer-facing trust is limited to `provider_profiles.is_verified` and `provider_profiles.skill_certificate_verified`, both protected from provider mutation.
- Upload path: `<auth-user-id>/<provider-id>/<document-type>/<unique-file>.<extension>`.
- The existing `verification-documents` bucket remains private, is image-only, has an 8 MB limit, has no UPDATE policy, and permits owner deletion only while editable.
- Providers upload a fresh object and then register it through an ownership-checked RPC. Submission rechecks required object existence.
- Only a staff-authorized RPC can approve, reject, request resubmission, or expire verification. Every staff transition is audited.
- Realtime publishes the non-sensitive verification status table and public provider profile trust flags. Document paths and National ID material are not published.
