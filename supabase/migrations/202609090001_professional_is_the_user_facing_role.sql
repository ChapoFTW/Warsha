-- The English lock-screen preview calls the role "Worker". The product calls it
-- "Professional".
--
-- Warsha's English user-facing role noun is now Professional, matching the
-- Arabic صنايعي and the French Professionnel that both surfaces already used.
-- The internal role key stays `worker` everywhere — routes, columns, capability
-- names and this table's own `category` value are unchanged, because the
-- decision is about what a person reads, not what the code calls it.
--
-- This row has to move with the client. `private.notification_push_copy` is the
-- copy the SERVER renders for a queued push, and
-- `scripts/push-delivery.test.mts` compares all thirty rows against the
-- TypeScript table string for string — two copies of one table are a parity
-- defect the moment they disagree. So the client change and this one are the
-- same change.
--
-- Copy only. No schema, no policy, no grant, no rule. Arabic and French rows
-- are untouched: they were already right.

update private.notification_push_copy
set title = 'Professional account update',
    body = 'Your professional account has an update.'
where category = 'worker_account'
  and language = 'en';
