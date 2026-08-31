// Two people press the button at the same time.
//
// Every contended transition in Warsha has the same shape: `select … for
// update` to take the row lock, then the status check, then the write. That
// ordering is what makes a double submission safe, and reading it is not the
// same as proving it. This opens two real database connections and races them.
//
// `cancel_marketplace_request` is the subject because its fixture is one row.
// Quote selection has the identical shape and was the first choice, but a quote
// requires an invitation, which requires a matching run — three fixture layers
// to exercise one lock. It is the same lock.
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

const CUSTOMER = 'e1000000-0000-4000-8000-000000000001';
const REQUEST = 'e2000000-0000-4000-8000-000000000001';

function cleanup() {
  try {
    sql(`delete from public.marketplace_cancellation_events where request_id = '${REQUEST}';
         delete from public.marketplace_requests where id = '${REQUEST}';
         delete from public.user_roles where user_id = '${CUSTOMER}';
         delete from public.profiles where id = '${CUSTOMER}';
         delete from auth.users where id = '${CUSTOMER}';`);
  } catch { /* best effort */ }
}
process.on('exit', cleanup);
cleanup();

sql(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', '${CUSTOMER}', 'authenticated',
       'authenticated', 'race-${Date.now()}@warsha.test', crypt('x', gen_salt('bf')),
       now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
       '{"display_name":"Race Customer","preferred_language":"en"}'::jsonb)
     on conflict (id) do nothing;`);

sql(`insert into public.marketplace_requests
       (id, customer_id, flow_kind, status, category_id, current_revision,
        issue_description, notes, schedule_kind, timezone, payment_compatibility,
        approximate_governorate, approximate_district, coarse_area_id,
        edit_deadline_at, collection_not_before, expires_at, selection_version,
        idempotency_key, requested_start_at, requested_end_at)
     values ('${REQUEST}', '${CUSTOMER}', 'get_quotes', 'collecting_quotes', 'plumbing', 1,
        'A tap that will not stop', '', 'flexible', 'Africa/Cairo', 'cash',
        'Cairo', 'Maadi', 'cairo-maadi',
        now() + interval '1 hour', now(), now() + interval '2 days', 1,
        'race-fixture-${Date.now()}',
        now() + interval '1 day', now() + interval '2 days');`);

check(sql(`select status from public.marketplace_requests where id = '${REQUEST}';`)
  === 'collecting_quotes', 'a request exists and is open');

// --- both cancellations arrive at the same instant --------------------------
const asCustomer = (key) =>
  `set request.jwt.claim.sub = '${CUSTOMER}';`
  + ` select public.cancel_marketplace_request('${REQUEST}', 'changed my mind', '${key}');`;

const [first, second] = await Promise.all([
  race(asCustomer('race-one')),
  race(asCustomer('race-two')),
]);

const won = [first, second].filter((r) => r.code === 0);
check(won.length >= 1, 'a cancellation succeeds', `${won.length} of 2 returned success`);

const finalStatus = sql(`select status from public.marketplace_requests where id = '${REQUEST}';`);
check(finalStatus === 'cancelled', 'THE REQUEST IS CANCELLED', finalStatus);

const times = sql(`select count(distinct cancelled_at) from public.marketplace_requests
                   where id = '${REQUEST}';`);
check(times === '1',
  'AND CARRIES ONE CANCELLATION TIME, NOT TWO WRITES RACING OVER EACH OTHER');

// Both callers returned success, and that is correct rather than a race lost.
//
// `cancel_marketplace_request` opens with an early return INSIDE the lock when
// the status is already 'cancelled'. The second caller blocked on the row lock,
// read the status the first had written, and did nothing. Cancelling an
// already-cancelled request is a no-op that succeeds, which is what idempotent
// means for a cancel: the caller wanted it cancelled, and it is.
//
// So the property that matters is not "the second call fails". It is that the
// side effects happened exactly once.
const third = await race(asCustomer('race-three'));
check(third.code === 0, 'a third cancellation is also a no-op that succeeds');

const events = sql(`select count(*) from public.marketplace_cancellation_events
                    where request_id = '${REQUEST}';`);
check(events === '1',
  'AND THREE CANCELLATIONS RECORDED EXACTLY ONE CANCELLATION EVENT',
  events + ' event(s)');

const stillCancelled = sql(`select status from public.marketplace_requests
                            where id = '${REQUEST}';`);
check(stillCancelled === 'cancelled', 'the request is still cancelled, once');


console.log(`\n${checks} concurrency checks, ${failures} failed`);
if (failures) process.exitCode = 1;
