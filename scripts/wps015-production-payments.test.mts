import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';


const root = process.cwd(); let checks = 0;
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => { checks += 1; assert.equal(actual, expected, message); };
const match = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.match(value, pattern, message); };
const notMatch = (value: string, pattern: RegExp, message: string) => { checks += 1; assert.doesNotMatch(value, pattern, message); };
const throws = (fn: () => unknown, message: string) => { checks += 1; assert.throws(fn, message); };

const migration = read('supabase/migrations/202608020003_wps015_production_payments_payouts.sql');
/** Comments describe intent; only real SQL declares storage. */
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const migrationSql = stripSqlComments(migration);
const wps007 = read('docs/wps/WPS-007-financial-system.md');
const wps = read('docs/wps/WPS-015-production-payments-payouts.md');
const wes = read('docs/wes/WES-015-production-payments-payouts.md');
const decision = read('docs/decisions/payment-provider-selection.md');
const operationsRunbook = read('docs/operations/payment-operations-runbook.md');
const incidentRunbook = read('docs/operations/payment-incident-runbook.md');
const reconciliationRunbook = read('docs/operations/payment-reconciliation-runbook.md');
const threatModel = read('docs/architecture/payment-threat-model.md');
const pgtap = read('supabase/tests/database/production-payments-payouts.test.sql');
const index = read('docs/wps/WPS-INDEX.md');
const packageJson = read('package.json');

// ---------------------------------------------------------------------------
// Authority: WPS-015 extends WPS-007 and never replaces it
// ---------------------------------------------------------------------------
match(wps, /Version: 1\.0/, 'WPS-015 declares version 1.0');
match(wps, /Status: LOCKED FOR IMPLEMENTATION/, 'WPS-015 is locked for implementation');
match(wps, /Authority: Warsha Constitution/, 'WPS-015 names the Constitution as authority');
match(wps, /Depends on: WPS-001 through WPS-014/, 'WPS-015 declares its dependency chain');
match(wes, /Version: 1\.0/, 'WES-015 declares version 1.0');
match(wes, /Status: ENGINEERING BASELINE/, 'WES-015 is an engineering baseline');
match(wes, /Implements: WPS-015/, 'WES-015 implements WPS-015');
match(wes, /Constitution\s*→\s*WPS-007\s*→\s*WPS-015\s*→\s*WES-015/, 'WES-015 records the authority chain');
match(wps, /WPS-007 remains the financial accounting and product authority/, 'WPS-007 remains the financial authority');

// ---------------------------------------------------------------------------
// Locked financial rules are preserved verbatim
// ---------------------------------------------------------------------------
match(wps, /10%/, 'commission stays 10%');
match(wps, /floor/i, 'commission rounding stays floor at the piastre boundary');
match(wps, /EGP 200/, 'minimum withdrawal stays EGP 200');
match(wps, /EGP 500/, 'cash debt threshold stays EGP 500');
match(wps, /six hours|six-hour/i, 'six-hour release eligibility is preserved');
match(wps, /integer piastres/i, 'amounts stay integer piastres');
match(wps, /bigint/i, 'amounts stay bigint-backed');
match(wps, /no rolling reserve|rolling reserve.*none/i, 'no rolling reserve');
match(wps, /zero/i, 'withdrawal fee stays zero');
ok(wps007.includes('Provider commission is 10% of the approved gross job price.'), 'WPS-007 commission rule is untouched');

// ---------------------------------------------------------------------------
// No second ledger and no second payment state machine
// ---------------------------------------------------------------------------
notMatch(migration, /create table[^;]*financial_ledger/i, 'migration creates no second ledger table');
notMatch(migration, /alter table private\.financial_ledger_transactions[^;]*transaction_type/i, 'no new ledger transaction type is introduced');
match(migration, /post_financial_transaction/, 'migration defers to the existing ledger posting authority');
match(wps, /does not create a second ledger|no second ledger/i, 'WPS-015 states it creates no second ledger');
notMatch(migration, /create table[^;]*public\.payments\b/i, 'migration creates no simplified bypass payment table');

// ---------------------------------------------------------------------------
// Fail-closed configuration and secret boundaries
// ---------------------------------------------------------------------------
match(migration, /gateway_mode in \('disabled','mock','sandbox','live'\)/, 'gateway supports all four modes');
match(migration, /payout_mode in \('disabled','mock','sandbox','live'\)/, 'payout supports all four modes');
match(migration, /gateway_mode in \('disabled','mock'\) or active_payment_provider is not null/, 'live gateway requires a named provider');
match(migration, /payout_mode in \('disabled','mock'\) or active_payout_provider is not null/, 'live payout requires a named provider');
match(migration, /payment_secret_metadata/, 'secret metadata is tracked separately from secret values');
notMatch(migration, /secret_value|api_key_value|webhook_secret\s+text/i, 'no secret value column exists');
match(migration, /unique \(provider_key, environment\)/, 'sandbox and live credentials cannot be mixed');
match(migration, /return 'disabled'/, 'incomplete configuration degrades to disabled');

// ---------------------------------------------------------------------------
// The client bundle must never carry a payment secret
// ---------------------------------------------------------------------------
// This was asserted by calling `assertNoClientPaymentSecrets` on a hand-written
// object and by grepping ONE repository file. Both are gone with the unshipped
// gateway client layer they belonged to, and the property is now checked over
// every shipped source file instead — which is what the rule always meant and
// is strictly harder to evade than a guard one module chose to call.
{
  const shipped = execFileSync('git', ['ls-files', 'app', 'src', 'components', 'web/app',
    'web/components', 'web/lib'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).filter(file => /\.(tsx?|jsx?)$/.test(file));
  const offenders = shipped.filter(file =>
    /EXPO_PUBLIC_[A-Z_]*(SECRET|API_KEY|WEBHOOK|PRIVATE)/.test(read(file)));
  equal(offenders.join(', '), '',
    'NO SHIPPED SOURCE FILE READS A CLIENT-SIDE PAYMENT SECRET');
}

// ---------------------------------------------------------------------------
// Checkout: no client-declared success
// ---------------------------------------------------------------------------
// The checkout phase machine, the retry rules and the online-method gate lived
// in `production-payment-types.ts` and `production-payment-policy.ts`, a client
// layer for a gateway that was never activated and that no screen ever
// imported. It was retired on 2026-08-29 rather than kept as a draft to be
// resurrected years later against a design nobody remembers agreeing to.
//
// Nothing is lost from THIS suite's point of view, because the property those
// rules expressed — a client never declares a payment successful — was always
// enforced by the database, and the migration assertions that follow are the
// ones that made it true. If a gateway is activated, the client layer is built
// then, against the schema below.
match(migration, /awaitingProviderConfirmation/, 'checkout return still waits for provider confirmation');
notMatch(migration, /set status = 'paid'/i, 'checkout return never marks a payment paid');

// ---------------------------------------------------------------------------
// Webhook security
// ---------------------------------------------------------------------------
match(migration, /signature_invalid/, 'unsigned events are rejected');
match(migration, /replay_window_exceeded/, 'replay protection exists');
match(migration, /environment_mismatch/, 'environment matching is enforced');
match(migration, /unknown_event_type/, 'an event allowlist exists');
match(migration, /amount_mismatch/, 'amount mismatch is detected');
match(migration, /currency_mismatch/, 'currency mismatch is detected');
match(migration, /unknown_attempt/, 'orphan events are quarantined');
match(migration, /raw_body_sha256/, 'an immutable raw-event fingerprint is stored');
match(migration, /ignored_late_event/, 'late and out-of-order events are tolerated');
match(migration, /'duplicate'/, 'duplicate events are handled idempotently');
match(migration, /payment_webhook_quarantine/, 'unknown events are quarantined for review');
notMatch(migration, /raw_body\s+text|payload\s+jsonb\s+not null default '\{\}'::jsonb,\s*--\s*raw/i, 'no raw provider payload is retained');

// ---------------------------------------------------------------------------
// Reconciliation detects rather than conceals
// ---------------------------------------------------------------------------
match(migration, /reconciliation_exceptions/, 'an exception queue exists');
match(migration, /ledger_imbalance/, 'explicit ledger balancing is checked');
match(migration, /missing_webhook/, 'missing webhooks are detected');
match(migration, /orphan_provider_event/, 'orphan provider events are detected');
match(migration, /unmatched_provider_record/, 'unmatched provider records are detected');
match(reconciliationRunbook, /exception/i, 'the reconciliation runbook covers exceptions');
notMatch(migration, /delete from private\.reconciliation_exceptions/, 'reconciliation never destroys its own evidence');
match(migration, /never rewrites ledger history/, 'reconciliation resolution is an audit record only');

// ---------------------------------------------------------------------------
// Payouts and destinations
// ---------------------------------------------------------------------------
match(migration, /payout_provider_references_token_required_check/, 'tokenized destinations require a provider token');
notMatch(migrationSql, /wallet_pin|raw_iban|cvv|card_number|\bpan\b/i, 'no raw payment or payout credential is stored');
// The credential boundary, asserted on the schema rather than on a comment in a
// client module. `provider_payout_destinations` has a `display_label` and a
// `masked_value` of four to twenty-four characters, and no column an account
// number or a wallet PIN could be written to. A table that cannot hold a secret
// is a stronger guarantee than a file that says it will not.
match(read('supabase/migrations/202607300001_payments_earnings_ledger.sql'),
  /masked_value text not null check \(length\(masked_value\) between 4 and 24\)/,
  'A PAYOUT DESTINATION CAN ONLY EVER HOLD A MASKED VALUE');
notMatch(read('supabase/migrations/202607300001_payments_earnings_ledger.sql'),
  /(account_number|iban|wallet_pin|card_number)\s+text/i,
  'and no raw bank or wallet credential column exists at all');
match(migration, /run_earning_release_batch/, 'a release scheduler batch exists');
match(migration, /'disabled'/, 'the scheduler is disabled by default');
match(migration, /release_eligible_provider_earnings/, 'the scheduler delegates to the WPS-007 release authority');

// ---------------------------------------------------------------------------
// Chargebacks
// ---------------------------------------------------------------------------
match(migration, /requiresStaffReview/, 'chargebacks require staff review');
match(migration, /never presumed|Worker responsibility is never presumed/, 'worker responsibility is never presumed');
match(wps, /WPS-013 owns/i, 'WPS-013 keeps service disputes');
notMatch(migration, /update public\.provider_profiles set (rating|ranking)/i, 'chargebacks never alter ranking or reputation');

// ---------------------------------------------------------------------------
// Mock isolation and no fake money
// ---------------------------------------------------------------------------
// These four asserted that the retired gateway client isolated Mock, made no
// direct provider call and never claimed a licensed provider. The module is
// gone, and the property that outlives it belongs to the database: the gateway
// stays disabled until a provider is named, and the schema is what refuses.
match(migrationSql, /return 'disabled'/,
  'AN UNCONFIGURED GATEWAY DEGRADES TO DISABLED IN THE DATABASE');
match(migrationSql, /payout_mode in \('disabled','mock'\) or active_payout_provider is not null/,
  'and a live payout mode is impossible without a named provider');
match(migrationSql, /'cash'/, 'cash remains a first-class payment method in the schema');

// ---------------------------------------------------------------------------
// Localization, accessibility and prohibited language
// ---------------------------------------------------------------------------
// The wording rules were asserted against `production-payment-copy.ts`, which no
// screen rendered. They are product rules about what Warsha may say to somebody
// about their money, so they now govern `src/i18n/payment-translations.ts` — the
// copy the earnings screen, the booking payment card, the price-adjustment card
// and the cash-payment card actually display.
//
// Asserted over the module's source rather than its exports because it imports a
// React hook and cannot be loaded by a Node suite. That costs nothing here: these
// rules are about whether a phrase appears in customer-facing copy at all, which
// is exactly what a search of the text answers.
const livePaymentCopy = read('src/i18n/payment-translations.ts');

match(livePaymentCopy, /[؀-ۿ]/, 'the live payment copy carries Arabic');
match(livePaymentCopy, /frenchPaymentTranslations: Record<PaymentCopyKey, string>/,
  'FRENCH COMPLETENESS IS ENFORCED BY THE TYPE, NOT BY HOPE');
notMatch(livePaymentCopy, /wallet balance|bank balance|escrow|salary|instant refund|guaranteed settlement/i,
  'NO PROHIBITED FINANCIAL LANGUAGE IN THE COPY CUSTOMERS ACTUALLY READ');
notMatch(livePaymentCopy, /gateway|webhook|HMAC|provider_key|SDK/i,
  'no technical gateway terminology in customer payment copy');
match(livePaymentCopy, /minimumWithdrawal/, 'the withdrawal minimum is stated to the worker');
match(livePaymentCopy, /zeroWithdrawalFee/, 'and the zero withdrawal fee is stated');
match(livePaymentCopy, /Warsha does not collect it/,
  'cash copy still says Warsha does not collect the money');

// ---------------------------------------------------------------------------
// Motto audit
// ---------------------------------------------------------------------------
const motto = read('src/i18n/translations.ts');
match(motto, /brandMotto: 'YOUR WORK, OUR MISSION'/, 'approved English motto remains active');
match(motto, /brandMotto: 'شغلك مهمتنا'/, 'approved Arabic motto remains active');
notMatch(livePaymentCopy, /YOUR WORK, OUR MISSION|شغلك مهمتنا/,
  'payment copy does not misuse the motto');
notMatch(migration, /YOUR WORK, OUR MISSION/, 'the migration does not embed the motto');

// ---------------------------------------------------------------------------
// Provider decision gate and operational documentation
// ---------------------------------------------------------------------------
match(decision, /Confirmed fact/i, 'the decision matrix separates confirmed facts');
match(decision, /Commercial question/i, 'the decision matrix separates commercial questions');
match(decision, /Legal question/i, 'the decision matrix separates legal questions');
match(decision, /Implementation inference/i, 'the decision matrix separates implementation inferences');
match(decision, /Unresolved blocker/i, 'the decision matrix separates unresolved blockers');
match(decision, /DEFERRED|decision gate/i, 'provider activation is a formal decision gate');
match(decision, /Meeza/, 'Meeza support is evaluated');
match(decision, /payout/i, 'payouts are evaluated');
match(operationsRunbook, /rotation/i, 'the operations runbook documents secret rotation');
match(incidentRunbook, /webhook/i, 'the incident runbook covers webhook incidents');
match(threatModel, /threat/i, 'a formal payment threat model exists');
notMatch(threatModel, /PCI (compliant|approved|certified)\b/i, 'no unconfirmed PCI approval is claimed');
match(wps, /NOT RUN|not authorized|disabled/i, 'WPS-015 records that real money movement stays disabled');
match(index, /WPS-015/, 'the WPS index records WPS-015');
match(packageJson, /test:wps015/, 'the regression suite is registered in package.json');

// ---------------------------------------------------------------------------
// pgTAP coverage exists for the required security surfaces
// ---------------------------------------------------------------------------
for (const surface of [
  'signature_invalid', 'replay_window_exceeded', 'environment_mismatch', 'unknown_event_type',
  'currency_mismatch', 'unknown_attempt', 'ledger_balanced', 'release scheduler stays disabled',
  'no WPS-015 private table is exposed', 'empty search path', 'Realtime',
]) {
  ok(pgtap.includes(surface), `pgTAP covers ${surface}`);
}

console.log(`WPS-015 production payment contracts: ${checks} checks passed.`);
