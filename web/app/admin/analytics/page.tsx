'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ConsoleShell } from '@/components/console-shell';
import {
  ReauthDialog, usePendingReauth, type ReauthRefusalReason,
} from '@/components/reauth-dialog';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import {
  analyticsChange,
  analyticsFileName,
  businessRowsToCsv,
  parseBusinessReport,
  reportingPresets,
  type BusinessReport,
  type ComparisonMode,
  type ReportingPreset,
} from '@/lib/business-analytics';
import { hasCapability } from '@/lib/staff';
import { intlLocale, type Locale } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { serviceCategoryLabel } from '@/src/i18n/service-labels';

import styles from './reporting.module.css';

type Category = { id: string; translationKey: string };
const verificationStatuses = [
  'not_started', 'draft', 'submitted', 'under_review', 'approved', 'rejected',
  'requires_resubmission', 'expired',
] as const;

const summaryMetrics = [
  'accountsCreated', 'customersRegistered', 'workersRegistered', 'activeCustomers',
  'activeWorkers', 'requestsCreated', 'quotesSubmitted', 'jobsCompleted',
] as const;
const jobMetrics = ['jobsCreated', 'jobsCompleted', 'jobsCancelled', 'supportCasesOpened'] as const;
const financialMetrics = ['grossJobValueMinor', 'workerEarningsMinor', 'platformFeesMinor', 'refundsMinor'] as const;

function today(): string { return new Date().toISOString().slice(0, 10); }
function daysAgo(days: number): string { return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10); }

export default function AnalyticsPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const copy = words as Record<string, string>;
  const { session } = useStaff();
  const canView = hasCapability(session, 'view_analytics');
  const canExport = hasCapability(session, 'export_operational_report');
  const [preset, setPreset] = useState<ReportingPreset>('last_30_days');
  const [comparison, setComparison] = useState<ComparisonMode>('previous_period');
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [verification, setVerification] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [report, setReport] = useState<BusinessReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [exportReason, setExportReason] = useState('');
  const [exporting, setExporting] = useState(false);
  const [continuation, setContinuation] = useState<string | null>(null);
  const onReauthRefused = useCallback((refusal: ReauthRefusalReason) => {
    setContinuation(refusal === 'another-action-pending' ? words.reauthAnotherPending
      : refusal === 'already-retried' ? words.reauthAlreadyRetried
        : words.reauthPendingExpired);
  }, [words]);
  const reauth = usePendingReauth(onReauthRefused);
  const { remember: rememberReauth } = reauth;

  useEffect(() => {
    void supabase().from('service_categories').select('id,translation_key').eq('is_active', true)
      .order('sort_order').then(({ data }) => {
        setCategories((data ?? []).flatMap(row => typeof row.id === 'string'
          ? [{ id: row.id, translationKey: typeof row.translation_key === 'string' ? row.translation_key : row.id }]
          : []));
      });
  }, []);

  const load = useCallback(async () => {
    if (!canView) return;
    setBusy(true); setFailure(null);
    const { data, error } = await supabase().rpc('get_staff_business_report', {
      p_preset: preset,
      p_custom_from: preset === 'custom' ? from : null,
      p_custom_to: preset === 'custom' ? to : null,
      p_comparison: comparison,
      p_category: category || null,
      p_governorate: governorate.trim() || null,
      p_verification_status: verification || null,
    });
    if (error) { setFailure(words.analyticsLoadFailed); setReport(null); }
    else setReport(parseBusinessReport(data));
    setBusy(false);
  }, [canView, category, comparison, from, governorate, preset, to, verification, words.analyticsLoadFailed]);

  useEffect(() => { void load(); }, [load]);

  const exportReport = useCallback(async (reauthenticated = false) => {
    if (!report || exporting || exportReason.trim().length < 10) return;
    if (!session.reauthValid && !reauthenticated) {
      rememberReauth('export', 'export_operational_report', () => { void exportReport(true); });
      return;
    }
    setExporting(true); setFailure(null);
    const idempotencyKey = `business-export:${crypto.randomUUID()}`;
    const request = await supabase().rpc('staff_request_business_export', {
      p_range_start: report.period.from,
      p_range_end: report.period.to,
      p_reason: exportReason.trim(),
      p_idempotency_key: idempotencyKey,
      p_category: category || null,
      p_governorate: governorate.trim() || null,
    });
    if (request.error) { setFailure(words.analyticsExportFailed); setExporting(false); return; }
    const payload = request.data && typeof request.data === 'object' ? request.data as Record<string, unknown> : {};
    const exportId = typeof payload.exportId === 'string' ? payload.exportId : '';
    const preview = exportId
      ? await supabase().rpc('staff_business_export_preview', { p_export_id: exportId })
      : { data: null, error: new Error('missing export') };
    if (preview.error || !preview.data || typeof preview.data !== 'object') {
      setFailure(words.analyticsExportFailed); setExporting(false); return;
    }
    const rows = Array.isArray((preview.data as Record<string, unknown>).rows)
      ? (preview.data as Record<string, unknown>).rows as Record<string, unknown>[] : [];
    const blob = new Blob([`\uFEFF${businessRowsToCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href; link.download = analyticsFileName(report.period.from, report.period.to);
    link.click(); URL.revokeObjectURL(href);
    setExporting(false);
  }, [category, exportReason, exporting, governorate, report, session.reauthValid,
    words.analyticsExportFailed, rememberReauth]);

  const maxFunnel = useMemo(() => Math.max(1, report?.funnel.requests ?? 0), [report]);

  return <ConsoleShell title={words.analyticsTitle}>
    <p className={styles.lead}>{words.analyticsLead}</p>
    <p className={styles.privacy}>{words.analyticsNoPii}</p>

    <form className={styles.filters} onSubmit={event => { event.preventDefault(); void load(); }}>
      <Field label={words.analyticsPreset}><select value={preset} onChange={event => setPreset(event.target.value as ReportingPreset)}>
        {reportingPresets.map(value => <option key={value} value={value}>{copy[`preset_${value}`]}</option>)}
      </select></Field>
      <Field label={words.analyticsComparison}><select value={comparison} onChange={event => setComparison(event.target.value as ComparisonMode)}>
        <option value="previous_period">{words.analyticsPreviousPeriod}</option>
        <option value="previous_year">{words.analyticsPreviousYear}</option>
        <option value="none">{words.analyticsNoComparison}</option>
      </select></Field>
      {preset === 'custom' ? <>
        <Field label={words.analyticsCustomFrom}><input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} required /></Field>
        <Field label={words.analyticsCustomTo}><input type="date" value={to} min={from} max={today()} onChange={event => setTo(event.target.value)} required /></Field>
      </> : null}
      <Field label={words.analyticsCategory}><select value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">{words.analyticsAll}</option>
        {categories.map(item => <option key={item.id} value={item.id}>{serviceCategoryLabel(item.translationKey, locale, item.id)}</option>)}
      </select></Field>
      <Field label={words.analyticsGovernorate}><input value={governorate} maxLength={100} onChange={event => setGovernorate(event.target.value)} /></Field>
      <Field label={words.analyticsVerification}><select value={verification} onChange={event => setVerification(event.target.value)}>
        <option value="">{words.analyticsAll}</option>
        {verificationStatuses.map(status => <option key={status} value={status}>{copy[`verification_${status}`]}</option>)}
      </select></Field>
      <button className={styles.primary} type="submit" disabled={busy}>{busy ? words.loading : words.analyticsApply}</button>
    </form>

    {failure ? <p className={styles.failure} role="alert">{failure}</p> : null}
    {!canView ? <p className={styles.failure}>{words.reauthDeniedBody}</p> : null}
    {report ? <>
      <p className={styles.period}>{report.period.from} – {report.period.to} · {report.period.timezone}</p>
      <MetricSection title={words.analyticsExecutive} keys={summaryMetrics} report={report} locale={locale} words={copy} />

      <section className={styles.panel} aria-labelledby="funnel-title">
        <h2 id="funnel-title">{words.analyticsMarketplace}</h2>
        <div className={styles.funnel}>
          {([
            ['requestsCreated', report.funnel.requests], ['requestsWithQuotes', report.funnel.withQuotes],
            ['quotesAccepted', report.funnel.acceptedQuotes], ['jobsCompleted', report.funnel.completedJobs],
          ] as const).map(([key, value]) => <div key={key} className={styles.funnelRow}>
            <span>{copy[`analyticsMetric_${key}`]}</span><strong>{value.toLocaleString(intlLocale(locale))}</strong>
            <span className={styles.track}><span style={{ width: `${Math.max(2, value / maxFunnel * 100)}%` }} /></span>
          </div>)}
        </div>
      </section>

      <MetricSection title={words.analyticsJobs} keys={jobMetrics} report={report} locale={locale} words={copy} />
      {report.financialVisible
        ? <MetricSection title={words.analyticsFinancial} keys={financialMetrics} report={report} locale={locale} words={copy} money />
        : null}

      <section className={styles.panel} aria-labelledby="trend-title">
        <h2 id="trend-title">{words.analyticsTrend}</h2>
        {report.series.length ? <div className={styles.tableWrap}><table><thead><tr>
          <th>{words.analyticsColDate}</th><th>{words.analyticsColAccounts}</th><th>{words.analyticsColCustomers}</th><th>{words.analyticsColWorkers}</th><th>{words.analyticsColRequests}</th><th>{words.analyticsColQuotes}</th><th>{words.analyticsColJobs}</th><th>{words.analyticsColCompleted}</th><th>{words.analyticsColSupport}</th>
        </tr></thead><tbody>{report.series.map(row => <tr key={row.day}>
          <td>{row.day}</td><td>{row.accountsCreated}</td><td>{row.customersRegistered}</td><td>{row.workersRegistered}</td>
          <td>{row.requestsCreated}</td><td>{row.quotesSubmitted}</td><td>{row.jobsCreated}</td><td>{row.jobsCompleted}</td><td>{row.supportCasesOpened}</td>
        </tr>)}</tbody></table></div> : <p>{words.analyticsEmpty}</p>}
      </section>

      <section className={styles.panel} aria-labelledby="dimensions-title"><h2 id="dimensions-title">{words.analyticsDimensions}</h2>
        <ul className={styles.dimensionList}>{report.dimensions.categories.map(item => <li key={item.categoryId}>
          <span>{(() => { const found = categories.find(categoryItem => categoryItem.id === item.categoryId); return found ? serviceCategoryLabel(found.translationKey, locale, found.id) : words.analyticsUnknownCategory; })()}</span>
          <strong>{item.requestCount}</strong>
        </li>)}</ul>
      </section>

      {canExport ? <section className={styles.panel} aria-labelledby="export-title"><h2 id="export-title">{words.analyticsExport}</h2>
        <p className={styles.hint}>{words.analyticsExportFresh}</p>
        <label className={styles.field}><span>{words.analyticsExportReason}</span><input value={exportReason} maxLength={500} onChange={event => setExportReason(event.target.value)} aria-describedby="export-help" /></label>
        <p id="export-help" className={styles.hint}>{words.analyticsExportReasonHelp}</p>
        <button className={styles.primary} type="button" disabled={exportReason.trim().length < 10 || exporting} onClick={() => void exportReport()}>{exporting ? words.loading : words.analyticsExportAction}</button>
      </section> : null}
    </> : null}

    {reauth.capability ? <ReauthDialog capability={reauth.capability} onClose={reauth.discard} onSuccess={reauth.resume} /> : null}
    {continuation ? <p className={styles.failure} role="alert">{continuation}</p> : null}
  </ConsoleShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function MetricSection({ title, keys, report, locale, words, money = false }: {
  title: string;
  keys: readonly string[];
  report: BusinessReport;
  locale: Locale;
  words: Record<string, string>;
  money?: boolean;
}) {
  return <section className={styles.panel}><h2>{title}</h2><div className={styles.metricGrid}>{keys.map(key => {
    const value = Number(report.metrics[key] ?? 0);
    const change = analyticsChange(value, report.comparisonMetrics?.[key]);
    const shown = money
      ? new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'EGP' }).format(value / 100)
      : value.toLocaleString(intlLocale(locale));
    return <article key={key} className={styles.metric}><span>{words[`analyticsMetric_${key}`]}</span><strong>{shown}</strong>
      {report.comparisonMetrics ? <small>{change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}</small> : null}
    </article>;
  })}</div></section>;
}
