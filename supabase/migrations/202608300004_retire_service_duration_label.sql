-- `public.services.duration_label` is retired as a display concept.
--
-- It was null for all 171 rows of the real service catalogue and carried
-- free-text English ("1-2 hours", "30-45 min") for five demo rows in the seed.
-- Nothing in the product ever wrote it: no migration, no RPC, no worker or
-- admin surface. The clients read it and rendered it verbatim, which put
-- English inside Arabic and French interfaces, and rendered a bare separator
-- for every service that had none.
--
-- Warsha does have a duration feature, and it is not this one: a worker enters
-- a duration in minutes on a quote (`app/worker-quote/[id].tsx`), per job,
-- localized by the client. A second, unlocalizable, never-written catalogue
-- attribute is not a product attribute.
--
-- The column is left in place rather than dropped. Dropping it destroys the
-- five demo values for no benefit, and nothing reads it any more: the client
-- `Service` type no longer declares `duration`, `mapService` no longer selects
-- it, and `supabase/seed.sql` no longer writes it. The comment is what stops
-- the next reader assuming it is live.

comment on column public.services.duration_label is
  'RETIRED 2026-08-30. Never populated by the product and unlocalizable free '
  'text. No client reads it. Service duration is quoted per job by the worker, '
  'in minutes. Do not render this column.';
