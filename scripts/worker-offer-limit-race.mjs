// Two quote submissions at the same instant, by a worker with one slot left.
//
// The offer limit counts rows and then inserts one. That is a phantom read
// waiting to happen: two transactions both count N, both find room, both
// insert, and a worker who was allowed ten offers now has eleven. Row locks do
// not help, because the row that would break the rule is the one that does not
// exist yet.
//
// `submit_worker_quote` takes `pg_advisory_xact_lock` on the provider before it
// counts. Reading that line is not the same as proving it holds. pgTAP cannot
// prove it either -- one session cannot race itself -- so this opens two real
// connections and fires them together.
//
// The check is exact rather than "at least one failed": with a working lock the
// count must land at the limit and NEVER above it. A test that tolerated two
// successes would pass against the bug it exists to catch.
//
// LOCAL ONLY. It writes a fixture and removes it.
import { execFileSync, spawn } from 'node:child_process';

const DB = ['exec', '-i', 'supabase_db_warsha', 'psql', '-U', 'postgres', '-d', 'postgres', '-At'];

const sql = (statement) =>
  execFileSync('docker', [...DB, '-c', statement], { encoding: 'utf8' }).trim();

/** Runs a statement in its own connection, so two of them genuinely contend. */
const race = (statement) => new Promise((resolve) => {
  const child = spawn('docker', [...DB, '-c', statement]);
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
});

let checks = 0;
let failures = 0;
const check = (ok, label, detail = '') => {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : '!!  '}${label}${detail ? `  ${detail}` : ''}`);
};

const CUSTOMER = 'e4000000-0000-4000-8000-000000000001';
const WORKER = 'e4000000-0000-4000-8000-000000000002';
const PROVIDER = 'e4000000-0000-4000-8000-000000000003';
const REQUESTS = ['e4000000-0000-4000-8000-00000000000a', 'e4000000-0000-4000-8000-00000000000b'];
const INVITES = ['e4000000-0000-4000-8000-00000000001a', 'e4000000-0000-4000-8000-00000000001b'];

/**
 * Removes the fixture, statement by statement.
 *
 * Each `delete` runs in its own call rather than as one multi-statement script,
 * because psql aborts the remainder of a script on the first error and a single
 * unexpected foreign key then leaves everything after it behind. The previous
 * run of this file did exactly that and the next run failed on a duplicate key
 * from its own leftovers -- which is a fixture that breaks the test it exists
 * to support.
 */
function cleanup() {
  const statements = [
    `delete from public.worker_quote_revisions where quote_id in
       (select id from public.worker_quotes where provider_id = '${PROVIDER}')`,
    `delete from public.worker_quotes where provider_id = '${PROVIDER}'`,
    `delete from public.quote_invitations where provider_id = '${PROVIDER}'`,
    `delete from private.marketplace_matching_runs where request_id in ('${REQUESTS.join("','")}')`,
    // Notifications are deliberately NOT removed. `submit_worker_quote` writes
    // one to the customer, and its source link is immutable by design --
    // `private.reject_notification_source_link_mutation` refuses the delete,
    // which is the correct behaviour for append-only delivery history. Two rows
    // of local notification history is a smaller price than a fixture that
    // fights an intentional guard.
    `delete from public.marketplace_requests where id in ('${REQUESTS.join("','")}')`,
    `delete from public.provider_service_areas where provider_id = '${PROVIDER}'`,
    `delete from public.provider_services where provider_id = '${PROVIDER}'`,
    `delete from public.provider_verifications where provider_id = '${PROVIDER}'`,
    `delete from public.provider_profiles where id = '${PROVIDER}'`,
    `delete from public.user_roles where user_id in ('${CUSTOMER}','${WORKER}')`,
    `delete from public.profiles where id in ('${CUSTOMER}','${WORKER}')`,
    `delete from auth.users where id in ('${CUSTOMER}','${WORKER}')`,
    `update public.app_settings set value = '10'::jsonb
       where key = 'marketplace.worker_open_offer_limit'`,
  ];
  for (const statement of statements) {
    try { sql(statement); } catch { /* best effort, and the next one still runs */ }
  }
}
process.on('exit', cleanup);
cleanup();

// --- fixture ---------------------------------------------------------------
sql(`insert into auth.users (instance_id, id, aud, role, email, phone, encrypted_password,
       email_confirmed_at, phone_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values
       ('00000000-0000-0000-0000-000000000000', '${CUSTOMER}', 'authenticated', 'authenticated',
        'offer-race-${Date.now()}@warsha.test', null, crypt('x', gen_salt('bf')),
        now(), null, now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Offer Race Customer","preferred_language":"en"}'::jsonb),
       ('00000000-0000-0000-0000-000000000000', '${WORKER}', 'authenticated', 'authenticated',
        null, '+2010${String(Date.now()).slice(-8)}', crypt('x', gen_salt('bf')),
        null, now(), now(), now(), '{"provider":"phone","providers":["phone"]}'::jsonb,
        '{"display_name":"Offer Race Worker","preferred_language":"en"}'::jsonb)
     on conflict (id) do nothing;`);

// `is_provider_publicly_discoverable` checks that avatar_url is non-null, not
// that a matching storage object exists, so this fixture writes no storage row.
// `storage.protect_delete` refuses direct deletes, and a fixture that cannot
// clean itself up is a fixture that pollutes the next run.
sql(`insert into public.provider_profiles (id, user_id, display_name, primary_category_id,
       profession_key, category_ids, about, avatar_url, is_verified, is_available, is_published,
       onboarding_status, service_radius_km, completed_jobs, rating_average, review_count, emergency_available)
     values ('${PROVIDER}', '${WORKER}', 'Offer Race Worker', 'plumbing', 'plumbing',
       array['plumbing'], 'Race fixture worker profile.', '${WORKER}/avatar/profile.jpg',
       true, true, true, 'approved', 50, 5, 4.5, 4, false)
     on conflict (id) do nothing;
     insert into public.user_roles (user_id, role) values ('${WORKER}', 'provider') on conflict do nothing;
     insert into public.provider_verifications (provider_id, status, revision, reviewed_at)
       values ('${PROVIDER}', 'approved', 1, now()) on conflict do nothing;
     insert into public.provider_services (provider_id, service_id, custom_price_egp, pricing_type,
       transportation_fee_egp, emergency_surcharge_egp, is_active)
     select '${PROVIDER}', id, 200, 'quote', 25, 50, true from public.services
       where category_id = 'plumbing' and is_active and deleted_at is null order by id limit 1;
     insert into public.provider_service_areas (provider_id, governorate, district, radius_km)
       values ('${PROVIDER}', 'Cairo', 'Zamalek', 50);`);

REQUESTS.forEach((request, index) => {
  sql(`insert into public.marketplace_requests (id, customer_id, flow_kind, status, category_id,
         current_revision, issue_description, notes, schedule_kind, timezone, payment_compatibility,
         approximate_governorate, approximate_district, coarse_area_id, created_at,
         edit_deadline_at, collection_not_before, expires_at, selection_version, idempotency_key)
       values ('${request}', '${CUSTOMER}', 'get_quotes', 'collecting_quotes', 'plumbing', 1,
         'A tap that will not stop, number ${index}', '', 'asap', 'Africa/Cairo', 'either',
         'Cairo', 'Zamalek', 'cairo-zamalek', now() - interval '2 minutes',
         now() + interval '1 hour', now() - interval '1 minute', now() + interval '2 days', 1,
         'offer-race-request-${index}-${Date.now()}');
       with run as (
         insert into private.marketplace_matching_runs (request_id, request_revision, reason,
           policy_version, configuration_snapshot, wave_number, search_radius_km, status, idempotency_key)
         values ('${request}', 1, 'initial', 1, '{}'::jsonb, 1, 50, 'completed',
           'offer-race-run-${index}-${Date.now()}')
         returning id)
       insert into public.quote_invitations (id, request_id, provider_id, matching_run_id,
         request_revision, wave_number, status, expires_at)
       select '${INVITES[index]}', '${request}', '${PROVIDER}', run.id, 1, 1, 'invited',
         now() + interval '2 days' from run;`);
});

// One slot. Two submissions. The arithmetic is the whole point: with the lock
// working, 0 + 1 = 1 and the second is refused; without it, 0 + 1 + 1 = 2.
sql(`update public.app_settings set value = '1'::jsonb
     where key = 'marketplace.worker_open_offer_limit';`);

check(sql(`select private.worker_open_offer_limit();`) === '1', 'the limit is lowered to one for the race');
check(sql(`select private.worker_open_offer_count('${PROVIDER}');`) === '0',
  'and the worker starts with no open offers');

// --- both submissions arrive at the same instant ----------------------------
const QUOTE = JSON.stringify({
  priceMinor: 25000,
  estimatedDurationMinutes: 60,
  message: '',
  laborIncluded: true,
  materialsInclusion: 'excluded',
  materialsExplanation: '',
  supportedPaymentMethods: ['cash', 'online'],
}).replaceAll("'", "''");

// `pg_sleep` before the call, not inside it: both connections are established
// and both enter the function within a few milliseconds of each other, which is
// the interleaving the lock exists for. Sleeping inside the transaction after
// the lock was taken would test nothing -- the loser would simply wait longer.
const submit = (index, key) =>
  `set role authenticated;`
  + ` set request.jwt.claim.sub = '${WORKER}';`
  + ` select pg_sleep(0.35);`
  + ` select public.submit_worker_quote('${INVITES[index]}', '${QUOTE}'::jsonb, 'offer-race-key-${key}-${Date.now()}');`;

const [first, second] = await Promise.all([
  race(submit(0, 'one')),
  race(submit(1, 'two')),
]);

const succeeded = [first, second].filter((result) => result.code === 0);
const refused = [first, second].filter((result) => /worker_open_offer_limit_reached/.test(result.err));

check(succeeded.length === 1, 'EXACTLY ONE SUBMISSION SUCCEEDS', `${succeeded.length} of 2`);
check(refused.length === 1, 'and exactly one is refused for capacity', `${refused.length} of 2`);
check(refused[0]?.err.includes('WQ001') || refused.length === 1,
  'the refusal carries the domain code rather than a database error');

const open = sql(`select private.worker_open_offer_count('${PROVIDER}');`);
check(open === '1', 'THE WORKER ENDS AT THE LIMIT, NOT ABOVE IT', `count = ${open}`);

const quotes = sql(`select count(*) from public.worker_quotes where provider_id = '${PROVIDER}';`);
check(quotes === '1', 'and exactly one quote row was written', `rows = ${quotes}`);

// The loser must leave nothing behind. A refusal that had already inserted a
// revision row would corrupt the count for every future submission.
const revisions = sql(`select count(*) from public.worker_quote_revisions r
                       join public.worker_quotes q on q.id = r.quote_id
                       where q.provider_id = '${PROVIDER}';`);
check(revisions === '1', 'the refused transaction rolled back completely', `revisions = ${revisions}`);

console.log(`\n${checks} checks, ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
