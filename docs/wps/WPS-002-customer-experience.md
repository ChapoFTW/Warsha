# WPS-002 - Customer Experience

## Document metadata

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Status | **AS-BUILT BASELINE - SUBJECT TO CONSTITUTION** |
| Authority | Warsha Constitution |
| Source | Existing repository, migrations, tests, and implemented behavior |

## 1. Purpose and authority

This as-built baseline records the customer mobile experience before full WPS-008 implementation. Later locked marketplace and financial rules govern any conflict.

Primary evidence includes the customer routes under `app`, marketplace/address/booking repositories, Mock data, migrations `202607200007`, `202607200011`, `202607200012`, `202607270001`, `202607290002`, `202607300001`, `202607300002`, and `202607310001`, and their pgTAP suites.

## 2. Customer profile and preferences

- A signed-in customer can view the current email or phone, edit display name, switch preferred language, manage saved addresses, view favourites, add a verified phone for worker activation, and sign out.
- Addresses support label, governorate, district, street, building, floor, apartment, landmark, instructions, and one default. Supabase deletion is soft deletion.
- Favourites are account-scoped in Supabase and local in Mock mode. Recent searches are stored locally per active account namespace.
- There is no complete payment-method wallet, policy center, support center, profile-image, or account-deletion UI.

## 3. Home, categories, and discovery

- Home shows search, active service categories, featured workers, an offer banner, and a recent-booking card when applicable.
- The aligned launch taxonomy contains exactly ten active categories: plumbing, electrical, carpentry, AC, cleaning, painting, appliance repair, satellite/TV installation, moving help, and general maintenance.
- Category pages list workers and expose local filter/sort controls with loading, error, retry, and empty states.
- Search matches worker name, location, biography, skills, services, and translated profession. It supports category/preset filtering, recent searches, availability, verification, rating, price, distance, and recommended/nearest/top-rated/lowest-price ordering.
- Current Supabase discovery loads one sanitized catalog RPC and performs UI filtering locally. It is not yet the server-ranked WPS-008 quote marketplace.
- The `recentlyViewed` preset has no persisted implementation and therefore returns no workers.

## 4. Worker profile viewing

- Customer-visible profiles include sanitized public name, profession, coarse location label, image, about text, service radius, experience, languages, skills, services and price labels, rating summary, provider reply, and permitted trust indicators.
- Only identity-approved, published, approved workers appear in the aligned Supabase catalog. Mock discovery likewise filters out unverified workers.
- Public trust output is limited to identity verification and optional Skill Certificate verification. Verification documents and private workflow state are never shown.
- Historical, starting, hourly, inspection, and quote-required price labels are estimates/labels rather than authority to change an agreed price.

## 5. Booking creation

- **Previous/as-built path:** a customer opens a worker profile, selects a service, describes the issue, optionally adds notes and up to four issue images, selects an address, chooses scheduled or emergency timing, reviews a price preview, and creates a booking for that specific worker.
- Supabase creation uses `create_customer_booking(uuid,uuid,text,text,uuid,date,time,text,text)`, resolves the customer from Auth, validates the worker/service/address, prevents duplicate submission with an idempotency key, snapshots public booking data, and begins at `pending_provider_approval`.
- Customer issue attachments use the private booking-attachments bucket and participant-scoped signed URLs.
- Direct booking now requires approved identity verification, publication, approval, availability, and compatible active service data.
- **Current locked correction:** WPS-008 makes `Request a Quote` the primary Browse Worker action for MVP. The specific worker must quote or decline; customer acceptance and worker confirmation then convert into the existing booking lifecycle. Direct fixed-price booking remains only a compatibility path until the UI is changed and must not be presented as the completed WPS-008 Browse Worker flow.

## 6. Orders and booking details

- Orders are grouped into upcoming, past, and cancelled tabs and reload on foreground and Realtime invalidation.
- Booking details show authoritative status history, worker/service, time, address snapshot, issue, notes, attachments, price/payment cards, review state, chat entry, cancellation, and rescheduling where allowed.
- Customers can cancel through `cancel_customer_booking(uuid,text)` while the server-authoritative lifecycle permits it.
- Customers can reschedule an eligible direct booking; a worker proposal can be accepted or rejected through guarded RPCs.
- Customer-visible booking state is always reconciled from the repository after a mutation or live invalidation.

## 7. Payments, price changes, and reviews

- WPS-007 payment cards, receipts, cash confirmation, mock online intent, refund projection, and controlled price-adjustment cards are integrated into booking details.
- Financial truth is server-authoritative in integer piastres and immutable snapshots. The client preview is not an approved final price.
- After an eligible completed booking, the customer can submit one 1-5 rating, optional comment, and up to four bounded image attachments.
- Rating summaries, review attachments, and worker replies are visible through sanitized participant/public paths. Review moderation and visibility remain server-authoritative.

## 8. Notifications and trust

- The Notifications screen exposes durable in-app events, unread count, mark one/all read, dismiss, pagination, refresh, and safe routing to booking, chat, payment, review, verification, or earnings destinations.
- Foreground banners suppress a booking-message banner while that booking chat is active.
- Verified Identity and verified Skill Certificate indicators are customer-visible; other verification material is private.

## 9. Existing limitations

- The current customer UI does not implement WPS-008 request, invitation, competing quote, comparison, selection, confirmation, Rescue Mode, Running Late, no-show, or comeback flows.
- Search distance is a catalog placeholder in Supabase mode; no live mapping/routing provider is integrated.
- Emergency direct booking exists, but WPS-008 pre-creation surcharge approval and race-safe dispatch are not yet implemented.
- The mobile app has no push/background notification delivery, phone relay, live location, promo redemption flow, dispute/support UI, or legal deletion flow.
- Accessibility, Arabic/RTL, native background/return, payment, and end-to-end manual results are not recorded as passed.

