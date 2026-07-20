# Supabase security model

- RLS is enabled on every application table.
- Anonymous users can read only active categories/services and published provider data.
- Customers can read their own private profile, addresses, favourites, bookings, and notifications.
- Only booking participants can read booking history and attachments.
- Conversation membership is checked through a private `security definer` helper to avoid recursive RLS policies.
- Provider verification documents and dispute evidence use private buckets.
- Staff access requires a server-controlled role in `user_roles`; authorization never trusts editable user metadata.
- The service-role key is server-only and must never be placed in an `EXPO_PUBLIC_` variable.
- Booking cancellation uses a narrow database function that checks ownership and allowed statuses.

The initial pgTAP checks verify critical tables, RLS enablement, and controlled cancellation. Add authenticated-user fixtures before expanding policy-behavior tests.
