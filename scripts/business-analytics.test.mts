import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  analyticsChange,
  analyticsFileName,
  businessExportColumns,
  businessRowsToCsv,
  parseBusinessReport,
  reportingPresets,
} from '../web/lib/business-analytics.ts';

let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks += 1; };
const equal = <T,>(actual: T, expected: T, label: string) => { assert.deepEqual(actual, expected, label); checks += 1; };
const read = (path: string) => readFileSync(path, 'utf8');

const parsed = parseBusinessReport({
  period: { preset: 'last_7_days', timezone: 'Africa/Cairo', from: '2026-08-15', to: '2026-08-21', comparison: 'previous_period', comparisonFrom: '2026-08-08', comparisonTo: '2026-08-14', partial: true },
  filters: { category: 'plumbing', governorate: 'Cairo', verificationStatus: null },
  metrics: { accountsCreated: 4, grossJobValueMinor: '12500' },
  comparisonMetrics: { accountsCreated: 2 },
  series: [{ day: '2026-08-21', accounts_created: 1, customers_registered: 1, workers_registered: 0, requests_created: 2, quotes_submitted: 3, jobs_created: 1, jobs_completed: 1, support_cases_opened: 0 }],
  dimensions: { categories: [{ category_id: 'plumbing', request_count: 2 }], governorates: [], verificationStatuses: [] },
  funnel: { requests: 2, withQuotes: 2, acceptedQuotes: 1, completedJobs: 1 },
  generatedAt: '2026-08-21T12:00:00Z', privacy: { containsPii: false, identifiers: 'none' }, financialVisible: true, financialAuthoritative: true,
});
equal(parsed.period.timezone, 'Africa/Cairo', 'the reporting timezone is explicit');
equal(parsed.series[0]?.requestsCreated, 2, 'snake-case SQL series fields parse deterministically');
equal(parsed.metrics.grossJobValueMinor, '12500', 'minor-unit ledger totals retain exact string form');
equal(parsed.privacy.containsPii, false, 'the parsed contract can never claim PII');
equal(analyticsChange(4, 2), 100, 'comparison percentage is calculated from server periods');
equal(analyticsChange(4, 0), null, 'growth from zero is shown as undefined rather than infinity');
check(reportingPresets.includes('all_time') && reportingPresets.includes('custom'), 'all required range modes exist');
equal(reportingPresets.length, 14, 'all fourteen required presets are represented');

const csv = businessRowsToCsv([{
  date: '2026-08-21', accounts_created: 1, customers_registered: 1,
  workers_registered: 0, requests_created: 2, quotes_submitted: 3,
  jobs_created: 1, jobs_completed: 1, support_cases_opened: 0,
  email: 'must-not-export@example.test', phone: '+201000000000', address: 'private',
}]);
equal(csv.split('\r\n')[0], businessExportColumns.join(','), 'CSV has stable machine-readable columns');
check(!csv.includes('must-not-export') && !csv.includes('+201') && !csv.includes('private'), 'CSV rejects unexpected PII-shaped fields');
equal(analyticsFileName('2026-08-01', '2026-08-21'), 'warsha-business-2026-08-01-2026-08-21.csv', 'CSV filename is stable');

const migration = read('supabase/migrations/202608220001_first_party_business_reporting.sql');
const staffAuthority = read('supabase/migrations/202608020005_wps017_operations_analytics_admin.sql');
for (const authority of [
  'public.profiles', 'public.customer_profiles', 'public.provider_profiles',
  'public.worker_onboarding_events', 'public.marketplace_requests', 'public.worker_quotes',
  'public.booking_status_history', 'public.provider_earnings_ledger', 'public.support_tickets',
]) check(migration.includes(authority), `report derives from ${authority}`);
check(!/create table[^;]+analytics_event/is.test(migration), 'no duplicate analytics event stream is introduced');
check(migration.includes("private.require_staff_capability('view_analytics')"), 'report reads require the analytics capability');
check(migration.includes("private.require_staff_capability('export_operational_report')"), 'exports require the stronger capability');
check(/'export_operational_report','analytics'[^\n]+true,false,true\)/.test(staffAuthority),
  'the export capability is authoritatively marked as requiring fresh authentication');
check(/v_cap\.requires_reauth and not private\.staff_recent_reauth/.test(staffAuthority),
  'the central capability gate enforces fresh authentication server-side');
check(migration.includes('private.record_staff_audit'), 'exports create immutable staff audit evidence');
check(migration.includes('idempotency_key'), 'exports are idempotent');
check(migration.includes("'Africa/Cairo'"), 'server period resolution is Cairo-aware');
check(migration.includes('at time zone v_timezone'), 'Cairo date boundaries are converted server-side');
check(migration.includes('p_range_end - p_range_start > 366'), 'exports are bounded');
check(migration.includes("'containsPii',false"), 'report contract explicitly denies PII');

const page = read('web/app/admin/analytics/page.tsx');
for (const token of ['get_staff_business_report', 'staff_request_business_export', 'staff_business_export_preview', 'ReauthDialog', 'businessRowsToCsv']) {
  check(page.includes(token), `admin analytics uses ${token}`);
}
check(migration.includes("'view_financial_ledger' = any(private.staff_capability_keys(v_actor))"), 'financial metrics keep their separate capability gate');
check(migration.includes("'financialVisible', v_financial_visible"), 'financial visibility is explicit in the RPC contract');
const areas = read('web/lib/console-areas.ts');
check(areas.includes("href: '/analytics', capability: 'view_analytics'"), 'admin navigation is capability-gated');
const copy = read('web/lib/app-copy.ts');
check(copy.includes("analyticsTitle: 'Business analytics'"), 'English analytics copy exists');
check(copy.includes("analyticsTitle: 'تحليلات النشاط'"), 'Arabic analytics copy exists');
const dictionary = read('docs/analytics/metric-dictionary.md');
for (const key of ['accountsCreated', 'activeCustomers', 'workersApproved', 'requestsCreated', 'quotesAccepted', 'jobsCompleted', 'grossJobValueMinor', 'supportCasesOpened']) {
  check(dictionary.includes(`\`${key}\``), `${key} has a durable definition`);
}

console.log(`Business analytics regressions: ${checks} checks passed.`);
