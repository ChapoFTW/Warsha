-- Retire the server-side financial notification localisation.
--
-- `private.localize_financial_notification()` fires `before insert on
-- public.notifications`, and for fifteen financial types it looks up
-- `profiles.preferred_language` and, when that language is Arabic, overwrites
-- `new.title` and `new.body` with Arabic strings held in the function body.
--
-- It has never been able to affect anything a person sees.
--
-- `get_my_notifications` — the only RPC any client uses to read notifications —
-- returns `eventKey`, `category`, `priority`, `routeType` and the rest, and
-- does NOT return `title` or `body`. Both clients localise from the event key:
-- `web/lib/notifications.ts` calls `legacyNotificationEventCopy`, and
-- `notification-engagement-translations.ts` resolves `eventCopy` then falls
-- through to the same table. No Edge Function reads the notifications table.
-- `private.notification_delivery_attempts` stores no rendered text. Push
-- previews are category-generic by construction and push delivery is disabled.
--
-- So the trigger wrote Arabic into two columns that are never transmitted, in a
-- second copy of strings the clients already own, covering two languages of the
-- three Warsha supports. The parity constitution names that exactly: a second
-- implementation of a shared authority is a defect even when it looks correct.
-- French never had a server-side branch at all, which is what that defect looks
-- like from the outside.
--
-- The seventeen financial event keys are now in
-- `src/notifications/notification-copy.ts`, in English, Arabic and French, on
-- the one table both platforms read. `financial-notifications.test.mts` asserts
-- every key resolves in every language and that no generic fallback is used.
--
-- What is NOT removed: `notifications.title` and `notifications.body` keep
-- their English values from the insert. They are a stable, language-neutral
-- record of what the event was, which is the right thing for a column nobody
-- renders, and dropping columns is not what this migration is for.

drop trigger if exists localize_financial_notifications on public.notifications;
drop function if exists private.localize_financial_notification();

notify pgrst, 'reload schema';
