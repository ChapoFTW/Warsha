For the **OpenAI Codex extension in VS Code**, the prompt should be more repository-aware and command-driven. Codex can inspect and edit files inside the active workspace, run terminal commands, and show diffs, so the instructions should tell it exactly how to work inside the project instead of asking it to dump an entire application into chat. 

Open the project folder in VS Code, add the reference image somewhere inside the workspace—preferably:

```text
docs/reference/warsha-home-reference.jpeg
```

Then paste the following prompt into the Codex extension:

---

# Build Warsha — Full Mobile Marketplace Application

You are working directly inside my currently opened VS Code workspace.

Act as the lead full-stack engineer, mobile developer, product designer, database architect, security engineer, and QA engineer for this project.

Your task is to build a complete application called **Warsha**, an Egyptian marketplace that connects customers with trusted craftsmen and home-service providers.

Do not respond with only an architecture proposal or sample snippets. Inspect the workspace, create and edit the actual files, install dependencies, run commands, check errors, and progressively build a working application.

---

## 1. Working Rules

Follow these rules throughout the project:

1. Inspect the existing repository before modifying anything.
2. Preserve any useful existing code.
3. Do not overwrite working configuration without a reason.
4. Make changes directly inside the current workspace.
5. Use terminal commands when needed.
6. Run formatting, linting, type checking, and tests after meaningful changes.
7. Fix errors before moving to the next milestone.
8. Do not place the entire application in one file.
9. Do not use placeholder comments such as:

```ts
// TODO: implement later
```

for core functionality.

10. For unavailable third-party services, create:
   - A typed interface
   - A mock implementation
   - Environment-variable placeholders
   - Clear replacement instructions

11. Before large or destructive changes, explain the intended change briefly.
12. Keep changes focused and reviewable.
13. After each milestone, summarize:
   - Files created
   - Files changed
   - Commands run
   - Tests performed
   - Remaining limitations

14. Never expose secrets or hard-code API keys.
15. Do not claim that something works unless you have run the relevant check.
16. Do not silently simplify requirements.
17. Use Git-friendly, incremental changes.
18. Do not commit files unless I explicitly ask you to commit them.

---

## 2. Product Overview

Warsha is a marketplace for customers in Egypt to find and book local home-service professionals, including:

- Plumbers
- Electricians
- Carpenters
- Air-conditioning technicians
- Cleaners
- Painters
- Appliance-repair technicians
- Construction workers
- Handymen
- Other skilled tradespeople

The application should support:

- Customers
- Service providers
- Support agents
- Administrators

Customers should be able to discover, compare, book, pay, message, review, and report service providers.

Providers should be able to create profiles, complete verification, list services, set availability, receive bookings, communicate with customers, submit quotations, track jobs, and view earnings.

---

## 3. Reference Image

A visual reference image should be available inside the workspace at:

```text
docs/reference/warsha-home-reference.jpeg
```

First, verify whether that file exists.

If it does not exist, search the workspace for another likely image file containing the Warsha design.

Do not stop the entire project if the reference image is missing. Continue with the design specification below, but clearly tell me that the image could not be found.

Use the reference image as the primary visual direction for the customer home screen.

Do not copy it pixel-for-pixel. Reproduce its visual language and layout hierarchy in an original, functional implementation.

---

## 4. Visual Direction

The interface must feel like a premium Egyptian home-services platform.

Use:

- Near-black main background
- Dark-charcoal cards
- White primary text
- Gray secondary text
- Thin, subtle borders
- Large rounded cards
- Rounded search fields
- Monochrome icons
- Restrained shadows
- Spacious layouts
- Strong visual hierarchy
- Large provider photography
- Smooth horizontal scrolling sections
- Minimal status colors
- No bright decorative colors
- No obvious gradients
- No generic marketplace-template appearance

The customer home screen should visually resemble the reference image and include:

- Warsha logo
- Current address selector
- Search field
- Service-category row
- Featured-provider cards
- Special-offer banner
- Recent-booking section
- Bottom navigation

Suggested design tokens:

```ts
const colors = {
  background: "#080808",
  surface: "#111111",
  surfaceElevated: "#181818",
  border: "#292929",
  textPrimary: "#F5F5F5",
  textSecondary: "#A1A1A1",
  textMuted: "#696969",
};
```

Use status colors only where necessary for:

- Success
- Warning
- Error
- Pending
- Informational states

Use border radii mainly between 14 and 24 pixels.

Create a centralized design system rather than repeating arbitrary values.

---

## 5. Required Technology Stack

Build the mobile application using:

- React Native
- Expo
- TypeScript
- Expo Router
- Supabase
- PostgreSQL
- Supabase Authentication
- Supabase Storage
- Supabase Realtime
- Supabase Edge Functions where appropriate
- TanStack Query
- Zustand
- React Hook Form
- Zod
- React Native Reanimated
- React Native Gesture Handler
- Expo Secure Store
- Expo Notifications
- Expo Location
- Expo Image Picker
- An Expo-compatible maps solution
- An internationalization library with RTL support

For styling, use either:

- NativeWind, or
- A well-structured React Native StyleSheet-based design system

Choose the option that provides the most reliable compatibility with the current Expo SDK.

Build the admin dashboard using:

- Next.js
- TypeScript
- Supabase
- A shared or closely matching design system

Use current stable package versions that are compatible with one another.

Before installing packages, inspect the current package configuration.

---

## 6. Recommended Repository Structure

Prefer a monorepo if the current workspace is empty or suitable for one.

Suggested structure:

```text
apps/
  mobile/
  admin/

packages/
  ui/
  types/
  validation/
  config/

supabase/
  migrations/
  seed/
  functions/
  tests/

docs/
  reference/
  architecture/
  flows/

scripts/
```

Suggested mobile structure:

```text
apps/mobile/
  app/
  src/
    components/
    features/
      auth/
      bookings/
      chat/
      customers/
      providers/
      payments/
      reviews/
      search/
      services/
      support/
    hooks/
    lib/
    services/
    store/
    theme/
    types/
    utils/
    i18n/
  assets/
```

Do not force this exact structure if the existing repository already has a sensible architecture. Adapt intelligently.

---

## 7. First Action

Before writing code:

1. Inspect the workspace.
2. List the important existing files.
3. Determine whether this is:
   - An empty workspace
   - An existing Expo project
   - A web project
   - A monorepo
   - Another project type

4. Inspect:
   - `package.json`
   - Lock files
   - TypeScript configuration
   - Existing environment files
   - Existing source directories
   - Existing Supabase configuration
   - The visual reference image

5. Report briefly:
   - What currently exists
   - What architecture you recommend
   - What you will build first

Then begin implementation.

Do not wait for another confirmation unless a decision would create significant irreversible consequences.

---

## 8. Languages and Localization

The app must support:

- English
- Arabic
- Full right-to-left Arabic layouts
- Egyptian Arabic-friendly terminology

The user must be able to change language in Settings.

Use natural Arabic labels, including:

```text
Home: الرئيسية
Orders: الطلبات
Chat: المحادثات
Profile: الحساب
Plumbing: سباكة
Electrical: كهرباء
Carpentry: نجارة
Cleaning: تنظيف
AC Repair: صيانة تكييف
Book Now: احجز الآن
Service Provider: مقدم الخدمة
Craftsman: فني or صنايعي depending on context
```

Keep translation files separate from components.

Do not embed user-facing strings directly throughout the UI.

Choose a font solution with good Arabic and English support.

---

## 9. Egypt-Specific Defaults

Use:

- Currency: EGP
- Distances: kilometres
- Default phone country code: +20
- Egyptian address conventions
- Egyptian governorates and districts

Initial operating locations:

- Cairo
- Giza
- Alexandria

Design the data model so other governorates can be added later.

Use realistic but fictional Egyptian data.

Never use real national IDs, private phone numbers, or other sensitive personal data in seed files.

---

## 10. User Roles

Support these account roles:

### Customer

Can:

- Browse services
- Search providers
- Save favourites
- Book services
- Pay
- Chat
- Review
- Submit complaints
- Manage addresses
- View orders

### Service Provider

Can:

- Create and edit a professional profile
- Submit verification documents
- List skills and services
- Set prices
- Set service areas
- Set availability
- Accept or decline jobs
- Submit quotations
- Request approved extra charges
- Chat with customers
- Update job status
- View earnings
- Request payouts

### Support Agent

Can:

- View assigned support cases
- Review disputes
- Review booking history
- Communicate with customers and providers
- Escalate cases

### Administrator

Can manage:

- Users
- Providers
- Verification
- Categories
- Services
- Bookings
- Payments
- Payouts
- Reviews
- Disputes
- Promotions
- Notifications
- Platform configuration
- Support permissions
- Audit logs

Implement role-based permissions and Supabase Row Level Security.

---

## 11. Authentication

Implement:

- Customer registration
- Provider registration
- Phone-number sign-up architecture
- OTP verification architecture
- Optional email sign-up
- Login
- Logout
- Persistent sessions
- Password-reset flow where email authentication is enabled
- Account deletion
- Terms acceptance
- Privacy-policy acceptance
- Role selection

During registration, ask whether the user wants to:

- Hire a professional
- Work as a service provider

Users may later request access to both experiences.

For development, provide a documented local/demo authentication strategy if live SMS credentials are unavailable.

---

## 12. Customer Onboarding

Create these onboarding steps:

1. Welcome to Warsha
2. Find trusted professionals nearby
3. Book services easily
4. Communicate safely
5. Pay securely
6. Receive support and service protection
7. Select language
8. Request location permission
9. Register, log in, or continue browsing as a guest

Guests can browse categories and providers but must authenticate before booking.

Persist onboarding completion locally.

---

## 13. Customer Home Screen

Implement the home screen closely following the reference image.

### Header

Include:

- Warsha logo
- Current address
- Address selector
- Notification button
- Optional quick-action button

### Search

Include:

- Large rounded search field
- Search by service
- Search by provider
- Search by problem description
- Filter button

### Service Categories

Create a horizontally scrollable category row.

Initial categories:

- Plumbing
- Electrical
- Carpentry
- AC repair
- Cleaning
- Painting
- Appliance repair
- Handyman
- Construction
- More

Use minimal monochrome icons.

### Featured Providers

Create horizontally scrollable provider cards showing:

- Provider photograph
- Name
- Profession
- Rating
- Review count
- Distance
- Starting price
- Verified badge
- Availability
- Favourite button

### Offers

Create promotional banners for:

- First booking
- Cleaning bundles
- Seasonal maintenance
- Provider promotions
- Platform campaigns

### Recent Bookings

Show:

- Provider photo
- Provider name
- Service
- Date and time
- Booking status
- Rebook action

### Additional Sections

Add:

- Recommended near you
- Available now
- Top rated
- Emergency services
- Most booked this week
- Recently viewed

### Navigation

Customer bottom tabs:

- Home
- Orders
- Chat
- Profile

Match the reference image’s clean, dark, monochrome navigation style.

---

## 14. Search and Discovery

Users should be able to search by:

- Service category
- Provider
- Area
- Skill
- Keyword
- Problem description

Filters:

- Price range
- Rating
- Distance
- Availability
- Verified providers
- Emergency availability
- Service type
- Home visit
- Workshop visit
- Offers

Sorting:

- Recommended
- Nearest
- Highest rated
- Lowest price
- Highest price
- Most reviewed
- Earliest available

Create both:

- List mode
- Map mode

Use pagination or infinite loading.

---

## 15. Provider Profiles

Each provider profile must include:

- Profile image
- Cover image
- Full name
- Profession
- Verified badge
- Rating
- Review count
- Completed-job count
- Years of experience
- Response time
- Location
- Service radius
- Languages
- About section
- Skills
- Certifications
- Portfolio
- Before-and-after images
- Offered services
- Pricing
- Availability
- Reviews
- Cancellation policy
- Guarantee information
- Report action
- Favourite action
- Chat action
- Booking action

---

## 16. Provider Verification

Collect:

- Legal name
- Phone number
- National ID number
- National ID front image
- National ID back image
- Selfie
- Address
- Profession
- Years of experience
- Skills
- Service areas
- Optional certificates
- Optional criminal-record document
- Bank or mobile-wallet details
- Emergency contact

Statuses:

- Not submitted
- Pending
- More information required
- Approved
- Rejected
- Suspended

Verification documents must be stored privately.

Customers must never be able to access verification documents or national-ID data.

---

## 17. Provider Dashboard

Provider navigation:

- Dashboard
- Jobs
- Calendar
- Messages
- Profile

Dashboard content:

- Today’s bookings
- Upcoming bookings
- New requests
- Earnings overview
- Acceptance rate
- Completion rate
- Rating
- Response time
- Profile completion
- Unread messages
- Required actions

Provider capabilities:

- Go online or offline
- Set working hours
- Set available dates
- Set service radius
- Add services
- Set prices
- Accept bookings
- Decline bookings
- Suggest another time
- Submit quotations
- Request approved extra payment
- Upload before-and-after images
- Mark on the way
- Mark arrived
- Start job
- Complete job
- View earnings
- Request payout
- Respond to reviews
- Contact support

---

## 18. Pricing Models

Support:

- Fixed price
- Starting price
- Hourly price
- Inspection fee
- Quotation required
- Emergency surcharge
- Transportation fee
- Materials

Clearly label prices as:

- Fixed
- Estimated
- Starting from
- Inspection fee only

Do not present estimated prices as guaranteed final prices.

---

## 19. Booking Flow

Implement:

1. Select provider
2. Select service
3. Describe the issue
4. Upload images
5. Select address
6. Select date
7. Select time
8. Choose emergency or scheduled service
9. Review pricing
10. Add promo code
11. Select payment method
12. Confirm

Booking statuses:

```text
draft
pending_provider_approval
accepted
rejected
rescheduling_requested
confirmed
provider_on_the_way
provider_arrived
job_started
awaiting_quote_approval
work_in_progress
awaiting_customer_confirmation
completed
cancelled
disputed
refunded
no_show
```

Create a booking timeline and immutable status history.

Prevent duplicate booking submissions.

---

## 20. Quotations and Extra Charges

For inspection-based services, allow providers to submit quotations containing:

- Labour items
- Material items
- Quantities
- Unit prices
- Notes
- Estimated duration
- Total
- Expiration time

Providers must not increase a confirmed price without approval.

Create a change-order process:

1. Provider explains additional work.
2. Provider enters labour cost.
3. Provider enters materials cost.
4. Provider attaches evidence where relevant.
5. Customer approves or rejects.
6. Previous and revised totals remain visible.
7. Each action is timestamped.
8. The decision is written to an audit log.

---

## 21. Payments

Design a provider-agnostic payment layer supporting:

- Cash
- Cards
- Mobile wallets
- Vodafone Cash
- Orange Cash
- e& Cash
- Manual InstaPay-compatible flow
- Promo credit
- Platform wallet

Initially implement:

- A typed payment-provider interface
- A secure mock provider
- Mock success and failure scenarios
- Transaction records
- Receipts
- Refund records

Make future integration possible for services such as:

- Paymob
- Fawry
- Accept
- Meeza-compatible payment systems

Do not install or claim support for a live payment provider without verifying its current official SDK and requirements.

Never hard-code keys.

---

## 22. Escrow-Like Payment Architecture

Where legally and technically supported by the eventual payment provider:

1. Customer authorizes payment.
2. Payment is held or marked pending.
3. Provider completes the service.
4. Customer confirms completion.
5. Warsha deducts its commission.
6. Provider balance becomes available.
7. A dispute pauses release.

Implement this behind an abstraction because true escrow may require regulated payment infrastructure.

Do not describe Warsha as a legally licensed escrow service in the UI.

---

## 23. Chat

Use Supabase Realtime.

Support:

- Booking-linked conversations
- Text
- Images
- Voice-note data model
- Location messages
- System messages
- Quotation cards
- Change-order cards
- Payment updates
- Read receipts
- Typing indicators
- Timestamps
- Report action
- Block action
- Support conversations

Create optimistic message sending with retry handling.

Do not expose private contact details unnecessarily.

---

## 24. Notifications

Support:

- In-app notifications
- Push notifications
- Optional email notifications
- SMS integration placeholder

Events include:

- New booking request
- Booking accepted
- Booking rejected
- Rescheduling requested
- Provider on the way
- Provider arrived
- New message
- Quotation submitted
- Change order submitted
- Payment completed
- Booking cancelled
- Review reminder
- Dispute update
- Verification result
- Payout update

Create notification preferences per user.

---

## 25. Maps and Location

Implement:

- Current location
- Address search
- Saved addresses
- Map-pin selection
- Provider distance
- Service radius
- Map search results
- Active-booking location sharing
- ETA display

Location sharing must require explicit permission.

Do not track providers continuously outside active bookings.

Provide graceful handling when location permission is denied.

---

## 26. Reviews

After a completed booking, customers may rate:

- Overall experience
- Work quality
- Professionalism
- Punctuality
- Value
- Cleanliness

Reviews may include:

- Text
- Images
- Provider response
- Report action
- Optional anonymous public display

Only customers associated with a completed booking may review that booking.

Allow one review per booking.

---

## 27. Complaints and Disputes

Reasons:

- Provider did not arrive
- Customer unavailable
- Poor-quality work
- Property damage
- Price disagreement
- Unapproved extra charge
- Inappropriate behaviour
- Safety concern
- Payment issue
- Other

Evidence:

- Images
- Video metadata or upload support
- Chat references
- Documents
- Written statement

Statuses:

- Submitted
- Under review
- Waiting for customer
- Waiting for provider
- Escalated
- Resolved for customer
- Resolved for provider
- Partial refund
- Full refund
- Closed

Create a support-agent case-management interface in the admin application.

---

## 28. Warsha Guarantee

Create a configurable guarantee module.

Administrators can define:

- Eligible categories
- Claim limit
- Claim deadline
- Evidence requirements
- Exclusions
- Rework eligibility
- Refund eligibility

Do not make unconditional promises.

Mark legal wording for professional review before launch.

---

## 29. Promotions and Loyalty

Support:

- Promo codes
- Percentage discounts
- Fixed discounts
- First-booking discounts
- Category promotions
- Provider-funded discounts
- Platform-funded discounts
- Referral codes
- Wallet credit
- Loyalty points
- Usage limits
- Start and end dates
- Minimum order values

Validate promotions on the server, not only on the client.

---

## 30. Emergency Services

Create an emergency-booking mode.

Include:

- Need help now action
- Providers currently available
- Estimated response time
- Clearly shown surcharge
- Provider-request timeout
- Request to next eligible provider
- Cancellation terms
- Safety warning

---

## 31. Profile and Settings

Customer profile:

- Personal information
- Profile image
- Phone
- Email
- Saved addresses
- Favourite providers
- Payment methods
- Wallet
- Promotions
- Notifications
- Language
- Appearance
- Help centre
- Policies
- Delete account
- Logout

Provider profile settings must also include:

- Services
- Service areas
- Availability
- Verification
- Payout methods
- Professional information

---

## 32. Provider Earnings

Display:

- Available balance
- Pending balance
- Total earnings
- Warsha commission
- Refund deductions
- Bonuses
- Payout history
- Weekly earnings
- Monthly earnings
- Completed jobs
- Downloadable statement architecture

Payout methods:

- Bank account
- Mobile wallet
- Manual payout placeholder

Financial records must be auditable.

Do not silently modify finalized transaction records.

---

## 33. Admin Dashboard

Build a responsive Next.js admin application.

Sections:

- Overview
- Customers
- Providers
- Provider verification
- Bookings
- Payments
- Refunds
- Payouts
- Disputes
- Reviews
- Categories
- Services
- Promotions
- Notifications
- Support tickets
- Reports
- Audit logs
- Roles
- Platform settings

Metrics:

- Total users
- Active customers
- Active providers
- Booking volume
- Completed bookings
- Cancellation rate
- Gross booking value
- Platform revenue
- Average booking value
- Refund rate
- Dispute rate
- Provider acceptance rate
- Customer retention
- Top categories
- Top locations

Use the same premium monochrome design adapted for desktop.

---

## 34. Database

Create Supabase migrations for tables including:

```text
profiles
user_roles
customer_profiles
provider_profiles
provider_verification_documents
service_categories
services
provider_services
provider_availability
provider_service_areas
addresses
bookings
booking_status_history
booking_attachments
booking_quotes
quote_items
change_orders
change_order_items
payments
payment_transactions
refunds
provider_earnings
provider_payouts
conversations
conversation_members
messages
message_attachments
reviews
review_responses
favourites
notifications
notification_preferences
promo_codes
promo_code_uses
wallets
wallet_transactions
disputes
dispute_evidence
support_tickets
support_messages
provider_portfolio
provider_certifications
user_reports
admin_roles
admin_permissions
audit_logs
app_settings
```

Include:

- UUID primary keys
- Foreign keys
- Constraints
- Indexes
- Timestamps
- Status fields
- Updated-at handling
- Soft deletion where appropriate
- Audit metadata
- Geospatial strategy where useful

Use lookup tables rather than rigid enums for business values likely to change frequently.

Create Mermaid entity-relationship documentation.

---

## 35. Row Level Security

Enable Row Level Security on all relevant tables.

Policies must ensure:

- Users access only their private account data.
- Booking participants access their bookings.
- Conversation members access their conversations.
- Only providers access their private provider records.
- Only authorized staff access disputes.
- Verification files are private.
- Public provider profiles expose only approved public fields.
- Administrative access requires explicit roles.
- Service-role operations stay server-side.
- Public users cannot read sensitive tables.

Do not create broad policies that expose all rows to authenticated users.

Add tests for critical RLS rules.

---

## 36. Storage

Create storage strategy and policies for:

- Profile images
- Provider portfolios
- Booking attachments
- Chat attachments
- Verification documents
- Dispute evidence
- Review images

Explicitly classify each bucket as:

- Public
- Private
- Signed-URL access

Verification documents and dispute evidence should be private by default.

---

## 37. Seed Data

Seed realistic fictional Egyptian data:

- At least 20 providers
- Cairo providers
- Giza providers
- Alexandria providers
- Multiple service categories
- Ratings
- Reviews
- Starting prices
- Availability
- Promotions
- Example bookings
- Example chats

Use Egyptian names and EGP pricing.

Do not use real personal information.

Ensure seed data can be rerun safely or document reset procedures.

---

## 38. Reusable Components

Build reusable components such as:

```text
AppHeader
AddressSelector
SearchBar
CategoryCard
ProviderCard
VerifiedBadge
RatingDisplay
PriceDisplay
BookingStatusBadge
OfferBanner
RecentBookingCard
EmptyState
ErrorState
LoadingSkeleton
BottomNavigation
ModalSheet
DatePicker
TimeSlotSelector
ImageUploader
ChatBubble
QuotationCard
ChangeOrderCard
PaymentSummary
ReviewCard
ConfirmationDialog
Toast
```

Components must support:

- English
- Arabic
- RTL layouts
- Accessibility
- Loading states
- Disabled states
- Error states

---

## 39. Accessibility

Implement:

- Screen-reader labels
- Good contrast
- Dynamic text support
- Minimum touch-target sizes
- Form error announcements
- Keyboard-safe forms
- Logical focus order
- Reduced-motion preferences
- Arabic accessibility labels

---

## 40. Poor Connectivity

Design for unstable mobile internet.

Include:

- Cached categories
- Cached provider results
- Retry states
- Offline indicator
- Optimistic chat
- Image compression
- Lazy loading
- Pagination
- Duplicate-request prevention
- Idempotent booking creation
- Low-data-mode preparation

---

## 41. Error Handling

Create user-friendly handling for:

- No internet
- Location denied
- Payment failure
- Expired OTP
- Provider unavailable
- Booking conflict
- Upload failure
- Invalid promotion
- Session expiration
- Server errors
- Duplicate booking submission

Never display raw database or server errors to customers.

Log technical errors in a controlled development-safe manner.

---

## 42. Testing

Add:

- Unit tests
- Component tests
- Integration tests
- Authentication tests
- Booking-flow tests
- Payment-adapter tests
- Role-permission tests
- RLS policy tests
- RTL layout checks where practical

Create a QA checklist covering:

- English
- Arabic
- RTL
- Customer
- Provider
- Admin
- Small Android phones
- Large phones
- iOS
- Slow connection
- Offline mode
- Loading states
- Empty states
- Error states

---

## 43. Analytics

Create a provider-independent analytics abstraction.

Track:

- Registration completed
- Category viewed
- Provider viewed
- Search performed
- Booking started
- Booking created
- Booking completed
- Booking cancelled
- Payment completed
- Promotion used
- Review submitted
- Provider accepted
- Provider declined

Do not send sensitive personal data in analytics events.

Use a console or local mock adapter initially unless a real analytics provider is configured.

---

## 44. Legal Screens

Create clearly marked draft screens for:

- Terms and Conditions
- Privacy Policy
- Provider Agreement
- Cancellation Policy
- Refund Policy
- Community Standards
- Warsha Guarantee
- Data-deletion request

Add a clear development note that legal wording requires review by a qualified Egyptian legal professional before production launch.

---

## 45. Environment Variables

Create an `.env.example`.

Include only placeholders:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

EXPO_PUBLIC_MAPS_API_KEY=
MAPS_SERVER_API_KEY=

EXPO_PUBLIC_PAYMENT_MODE=mock
PAYMENT_PROVIDER_PUBLIC_KEY=
PAYMENT_PROVIDER_SECRET_KEY=

EXPO_PUBLIC_EXPO_PROJECT_ID=
```

Keep server-only secrets out of client bundles.

Document which variables belong to:

- Expo client
- Next.js server
- Supabase Edge Functions
- Local development

---

## 46. Documentation

Create:

```text
README.md
docs/architecture/overview.md
docs/architecture/database.md
docs/architecture/security.md
docs/architecture/payments.md
docs/architecture/localization.md
docs/flows/customer-booking.md
docs/flows/provider-job.md
docs/flows/dispute.md
docs/deployment.md
docs/testing.md
docs/known-limitations.md
```

Include Mermaid diagrams for:

- System architecture
- Database relationships
- Customer booking flow
- Provider job flow
- Payment flow
- Dispute flow

---

## 47. Implementation Phases

Work in these phases.

### Phase 1 — Repository and Foundation

Build:

- Workspace structure
- Expo application
- Next.js admin shell
- Shared TypeScript configuration
- Formatting
- Linting
- Environment setup
- Design tokens
- Base navigation
- Localization
- Supabase client
- Authentication foundation

### Phase 2 — Customer Marketplace

Build:

- Customer onboarding
- Home screen
- Category browsing
- Search
- Provider listings
- Provider profile
- Favourites
- Seed data

### Phase 3 — Booking

Build:

- Service selection
- Problem description
- Image attachments
- Address selection
- Scheduling
- Price summary
- Booking creation
- Booking history
- Booking timeline
- Cancellation

### Phase 4 — Provider Experience

Build:

- Provider onboarding
- Verification
- Professional profile
- Services
- Pricing
- Service areas
- Availability
- Booking requests
- Provider job management
- Provider dashboard

### Phase 5 — Chat and Payments

Build:

- Realtime chat
- Quotations
- Change orders
- Payment adapter
- Mock payment flow
- Notifications
- Earnings records

### Phase 6 — Reviews and Support

Build:

- Reviews
- Reports
- Disputes
- Support tickets
- Guarantee configuration
- Refund workflow

### Phase 7 — Administration

Build:

- Admin authentication
- Dashboard
- User management
- Provider verification
- Booking management
- Financial views
- Disputes
- Promotions
- Settings
- Audit logs

---

## 48. First Required Milestone

Do not begin by creating dozens of empty screens.

Build a complete vertical slice first.

The first working milestone must allow a user to:

1. Launch the Expo app.
2. View onboarding.
3. Choose English or Arabic.
4. Switch correctly to RTL in Arabic.
5. Register or enter a documented demo session.
6. Select an address.
7. View the customer home screen.
8. See a home screen visually close to the reference image.
9. Browse service categories.
10. Search providers.
11. Open a provider profile.
12. Select a service.
13. Choose a date and time.
14. Create a booking.
15. View the booking under Orders.
16. Open a mock booking conversation.
17. Cancel the booking.

Use Supabase-backed data where possible.

When local Supabase or credentials are unavailable, implement a clearly isolated development adapter so the UI remains testable, then document how to switch to live Supabase.

---

## 49. Verification Commands

Determine the correct commands based on the package manager in the repository.

At minimum, run the equivalent of:

```bash
npm install
npm run lint
npm run typecheck
npm test
```

For Expo, also run an appropriate noninteractive validation command, such as:

```bash
npx expo-doctor
```

Do not leave known TypeScript or lint errors without clearly reporting them.

Do not start a permanently running dev server unless necessary. Prefer validation commands that terminate.

---

## 50. Definition of Done for Each Milestone

A milestone is complete only when:

- Required files exist.
- Core paths are implemented.
- TypeScript checks pass.
- Linting passes or remaining warnings are explained.
- Relevant tests pass.
- No secrets are committed.
- Environment requirements are documented.
- Loading, error, and empty states exist.
- English layout works.
- Arabic RTL is accounted for.
- The implementation can be run using documented commands.

---

## 51. Begin Now

Begin with the following sequence:

1. Inspect the current workspace.
2. Locate and inspect the Warsha reference image.
3. Explain the existing repository state briefly.
4. Propose the final workspace structure.
5. Create the foundation.
6. Implement the first customer vertical slice.
7. Run checks.
8. Fix errors.
9. Report exactly what was completed and what remains.

Do not merely explain how I could build the application.

Build it directly in this workspace.

---

A practical note: Codex’s IDE extension works best when you open the correct repository as the active VS Code workspace and keep the reference image inside that repository. Its default sandbox may restrict network access and generally limits writes to the active workspace, so package installation or external documentation access may require approval depending on your configuration. 
