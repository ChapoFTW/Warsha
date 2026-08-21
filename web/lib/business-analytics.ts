export const reportingPresets = [
  'today', 'yesterday', 'last_7_days', 'last_30_days', 'this_week', 'last_week',
  'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year',
  'last_year', 'all_time', 'custom',
] as const;

export type ReportingPreset = typeof reportingPresets[number];
export type ComparisonMode = 'none' | 'previous_period' | 'previous_year';

export type BusinessPeriod = {
  preset: ReportingPreset;
  timezone: string;
  from: string;
  to: string;
  comparison: ComparisonMode;
  comparisonFrom: string | null;
  comparisonTo: string | null;
  partial: boolean;
};

export type BusinessSeriesRow = {
  day: string;
  accountsCreated: number;
  customersRegistered: number;
  workersRegistered: number;
  requestsCreated: number;
  quotesSubmitted: number;
  jobsCreated: number;
  jobsCompleted: number;
  supportCasesOpened: number;
};

export type BusinessReport = {
  period: BusinessPeriod;
  filters: { category: string | null; governorate: string | null; verificationStatus: string | null };
  metrics: Record<string, number | string | null>;
  comparisonMetrics: Record<string, number | string | null> | null;
  series: BusinessSeriesRow[];
  dimensions: {
    categories: { categoryId: string; requestCount: number }[];
    governorates: { governorate: string; requestCount: number }[];
    verificationStatuses: { status: string; workerCount: number }[];
  };
  funnel: { requests: number; withQuotes: number; acceptedQuotes: number; completedJobs: number };
  generatedAt: string;
  privacy: { containsPii: false; identifiers: 'none' };
  financialVisible: boolean;
  financialAuthoritative: boolean;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const nullableText = (value: unknown): string | null => typeof value === 'string' ? value : null;
const number = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const metricRecord = (value: unknown): Record<string, number | string | null> => {
  const source = record(value);
  return Object.fromEntries(Object.entries(source).map(([key, raw]) => [
    key,
    raw === null ? null : typeof raw === 'string' ? raw : number(raw),
  ]));
};

/** Parse the bounded RPC contract. Unknown or malformed fields fail to safe values. */
export function parseBusinessReport(value: unknown): BusinessReport {
  const root = record(value);
  const period = record(root.period);
  const filters = record(root.filters);
  const dimensions = record(root.dimensions);
  const funnel = record(root.funnel);
  return {
    period: {
      preset: reportingPresets.includes(period.preset as ReportingPreset)
        ? period.preset as ReportingPreset : 'last_30_days',
      timezone: text(period.timezone) || 'Africa/Cairo',
      from: text(period.from),
      to: text(period.to),
      comparison: ['none', 'previous_period', 'previous_year'].includes(text(period.comparison))
        ? text(period.comparison) as ComparisonMode : 'none',
      comparisonFrom: nullableText(period.comparisonFrom),
      comparisonTo: nullableText(period.comparisonTo),
      partial: period.partial === true,
    },
    filters: {
      category: nullableText(filters.category),
      governorate: nullableText(filters.governorate),
      verificationStatus: nullableText(filters.verificationStatus),
    },
    metrics: metricRecord(root.metrics),
    comparisonMetrics: root.comparisonMetrics ? metricRecord(root.comparisonMetrics) : null,
    series: (Array.isArray(root.series) ? root.series : []).map(item => {
      const row = record(item);
      return {
        day: text(row.day ?? row.date),
        accountsCreated: number(row.accountsCreated ?? row.accounts_created),
        customersRegistered: number(row.customersRegistered ?? row.customers_registered),
        workersRegistered: number(row.workersRegistered ?? row.workers_registered),
        requestsCreated: number(row.requestsCreated ?? row.requests_created),
        quotesSubmitted: number(row.quotesSubmitted ?? row.quotes_submitted),
        jobsCreated: number(row.jobsCreated ?? row.jobs_created),
        jobsCompleted: number(row.jobsCompleted ?? row.jobs_completed),
        supportCasesOpened: number(row.supportCasesOpened ?? row.support_cases_opened),
      };
    }),
    dimensions: {
      categories: (Array.isArray(dimensions.categories) ? dimensions.categories : []).map(item => {
        const row = record(item);
        return { categoryId: text(row.categoryId ?? row.category_id), requestCount: number(row.requestCount ?? row.request_count) };
      }),
      governorates: (Array.isArray(dimensions.governorates) ? dimensions.governorates : []).map(item => {
        const row = record(item);
        return { governorate: text(row.governorate), requestCount: number(row.requestCount ?? row.request_count) };
      }),
      verificationStatuses: (Array.isArray(dimensions.verificationStatuses) ? dimensions.verificationStatuses : []).map(item => {
        const row = record(item);
        return { status: text(row.status), workerCount: number(row.workerCount ?? row.worker_count) };
      }),
    },
    funnel: {
      requests: number(funnel.requests),
      withQuotes: number(funnel.withQuotes),
      acceptedQuotes: number(funnel.acceptedQuotes),
      completedJobs: number(funnel.completedJobs),
    },
    generatedAt: text(root.generatedAt),
    privacy: { containsPii: false, identifiers: 'none' },
    financialVisible: root.financialVisible === true,
    financialAuthoritative: root.financialAuthoritative === true,
  };
}

export const businessExportColumns = [
  'date', 'accounts_created', 'customers_registered', 'workers_registered',
  'requests_created', 'quotes_submitted', 'jobs_created', 'jobs_completed',
  'support_cases_opened',
] as const;

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

/** Stable machine-readable CSV; never accepts server-selected arbitrary columns. */
export function businessRowsToCsv(rows: readonly Record<string, unknown>[]): string {
  const header = businessExportColumns.join(',');
  const body = rows.map(row => businessExportColumns.map(column => csvCell(row[column])).join(','));
  return [header, ...body].join('\r\n');
}

export function analyticsChange(current: unknown, previous: unknown): number | null {
  const now = number(current);
  const before = number(previous);
  if (before === 0) return now === 0 ? 0 : null;
  return ((now - before) / before) * 100;
}

export function analyticsFileName(from: string, to: string): string {
  const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : 'start';
  const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : 'end';
  return `warsha-business-${safeFrom}-${safeTo}.csv`;
}
