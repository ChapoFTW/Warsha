'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { appCopy } from '@/lib/app-copy';
import { workerNavigation } from '@/lib/nav';
import { intlLocale, type Locale } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import {
  WORKER_FINISHED,
  WORKER_NEXT_STATUS,
  WORKER_RESCHEDULABLE,
  parseWorkerBookings,
  type WorkerBooking,
} from '@/lib/worker';
import { workerCopy, type WorkerWords } from '@/lib/worker-copy';
import { cataloguedServiceReferenceLabel } from '@/src/services/specific-services';
import { bookingLifecycleSemantic } from '@/src/lifecycle/lifecycle-presentation';

import styles from '@/components/product-surface.module.css';

/** Provider-owned booking list and the exact lifecycle transitions the RPCs permit. */
export default function WorkerJobsPage() {
  const locale = useAppLocale();
  const appWords = appCopy[locale] as Record<string, string>;
  const words = workerCopy[locale];
  const [bookings, setBookings] = useState<WorkerBooking[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const client = supabase();
    const { data: profileData, error: profileError } = await client.rpc('get_my_worker_profile');
    const providerId = profileData && typeof profileData === 'object' && 'id' in profileData
      ? String((profileData as { id: unknown }).id) : '';
    if (profileError || !providerId) {
      setFailed(true);
      return;
    }
    const { data, error } = await client.from('bookings')
      .select('id,status,customer_name_snapshot,service_id,service_name_snapshot,issue_description,notes,'
        + 'scheduled_date,scheduled_time,address_snapshot,estimated_price_egp,final_price_egp,'
        + 'proposed_scheduled_date,proposed_scheduled_time,provider_reschedule_note,'
        + 'services(translation_key),booking_status_history(status,created_at,metadata)')
      .eq('provider_id', providerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setFailed(true);
    else setBookings(parseWorkerBookings(data));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const [active, past] = useMemo(() => {
    const rows = bookings ?? [];
    return [rows.filter((item) => !WORKER_FINISHED.has(item.status)), rows.filter((item) => WORKER_FINISHED.has(item.status))];
  }, [bookings]);
  const opened = bookings?.find((item) => item.id === openId) ?? null;

  return (
    <AppShell navigation={workerNavigation(appWords)} mode={appWords.modeWorker}>
      <div className={styles.head}><h1 className={styles.title}>{words.workerJobsTitle}</h1></div>
      <p className={styles.lead}>{words.workerJobsLead}</p>
      {failed ? <section className={styles.panel}><p className={styles.error}>{appWords.loadFailed}</p>
        <button type="button" className={styles.secondary} onClick={() => void load()}>{appWords.retry}</button></section> : null}
      {opened ? <WorkerJobDetail booking={opened} locale={locale} appWords={appWords} words={words}
        onClose={() => setOpenId(null)} onChanged={load} /> : null}
      {failed && bookings === null ? null : <>
        <WorkerJobList title={words.workerJobsActive} empty={words.workerJobsNoneActive} rows={bookings === null ? null : active}
          locale={locale} appWords={appWords} onOpen={setOpenId} />
        <WorkerJobList title={words.workerJobsPast} empty={words.workerJobsNonePast} rows={bookings === null ? null : past}
          locale={locale} appWords={appWords} onOpen={setOpenId} />
      </>}
    </AppShell>
  );
}

function WorkerJobDetail({ booking, locale, appWords, words, onClose, onChanged }: {
  booking: WorkerBooking;
  locale: Locale;
  appWords: Record<string, string>;
  words: WorkerWords;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const next = WORKER_NEXT_STATUS[booking.status];
  const serviceLabel = cataloguedServiceReferenceLabel(booking, [], locale);

  const act = async (operation: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await operation();
    if (result.error) setFailed(true);
    else await onChanged();
    setBusy(false);
  };

  return (
    <section className={styles.panel} aria-label={serviceLabel}>
      <div className={styles.head}><h2 className={styles.sectionTitle}>{serviceLabel}</h2>
        <button type="button" className={styles.secondary} onClick={onClose}>{appWords.close}</button></div>
      <div className={styles.rowMeta}><LifecycleBadge label={appWords[`bookingStatus_${booking.status}`] ?? booking.status}
        semantic={bookingLifecycleSemantic(booking.status)} />
        <time className={styles.when}>{formatDay(booking.scheduledDate, locale)} · {booking.scheduledTime.slice(0, 5)}</time></div>
      <p className={styles.factValue}>{booking.issueDescription}</p>
      <div className={styles.facts}>
        <Fact label={words.workerJobCustomer} value={booking.customerName} />
        <Fact label={words.workerJobAddress} value={booking.address} />
        <Fact label={words.workerJobPrice} value={`${booking.finalPrice ?? booking.estimatedPrice} ${appWords.currencyEgp}`} />
      </div>

      {booking.status === 'pending_provider_approval' ? (
        <div className={styles.subpanel}>
          <div className={styles.actions}>
            <button type="button" className={styles.action} disabled={busy}
              onClick={() => void act(() => supabase().rpc('accept_provider_booking', { p_booking_id: booking.id }))}>{words.workerJobAccept}</button>
          </div>
          <label className={styles.field}><span className={styles.label}>{words.workerJobRejectReason}</span>
            <input className={styles.input} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label>
          <button type="button" className={styles.danger} disabled={busy || reason.trim().length < 3}
            onClick={() => void act(() => supabase().rpc('reject_provider_booking', { p_booking_id: booking.id, p_reason: reason.trim() }))}>{words.workerJobReject}</button>
        </div>
      ) : null}

      {WORKER_RESCHEDULABLE.has(booking.status) ? (
        <div className={styles.subpanel}>
          <h3 className={styles.sectionTitle}>{words.workerJobReschedule}</h3>
          <div className={styles.formGrid}>
            <Field label={words.workerJobDate}><input className={styles.input} type="date" min={today()} value={date}
              onChange={(event) => setDate(event.target.value)} disabled={busy} /></Field>
            <Field label={words.workerJobTime}><input className={styles.input} type="time" value={time}
              onChange={(event) => setTime(event.target.value)} disabled={busy} /></Field>
          </div>
          <Field label={words.workerJobNote}><input className={styles.input} maxLength={500} value={note}
            onChange={(event) => setNote(event.target.value)} disabled={busy} /></Field>
          <button type="button" className={styles.secondary} disabled={busy || !date || !time || note.trim().length < 3}
            onClick={() => void act(() => supabase().rpc('propose_provider_reschedule', {
              p_booking_id: booking.id, p_date: date, p_time: time, p_note: note.trim(),
            }))}>{words.workerJobReschedule}</button>
        </div>
      ) : null}

      {next ? (
        <div className={styles.subpanel}>
          {next === 'completed' ? <Field label={words.workerJobCompleteNote}><textarea className={styles.textarea} maxLength={1000} value={note}
            onChange={(event) => setNote(event.target.value)} disabled={busy} /></Field> : null}
          <button type="button" className={styles.action} disabled={busy}
            onClick={() => void act(() => supabase().rpc('advance_provider_booking_status', {
              p_booking_id: booking.id, p_status: next, p_note: note.trim() || null,
            }))}>{words.workerJobNext.replace('{status}', appWords[`bookingStatus_${next}`] ?? next)}</button>
        </div>
      ) : null}

      {booking.status === 'provider_arrived' ? (
        <div className={styles.subpanel}>
          <Field label={words.opportunityReason}><input className={styles.input} maxLength={500} value={reason}
            onChange={(event) => setReason(event.target.value)} disabled={busy} /></Field>
          <button type="button" className={styles.danger} disabled={busy || reason.trim().length < 3}
            onClick={() => void act(() => supabase().rpc('report_provider_no_show', { p_booking_id: booking.id, p_reason: reason.trim() }))}>{words.workerJobNoShow}</button>
        </div>
      ) : null}

      {['job_started', 'work_in_progress'].includes(booking.status) ? (
        <div className={styles.subpanel}>
          <Field label={words.workerJobNote}><textarea className={styles.textarea} maxLength={1000} value={reason}
            onChange={(event) => setReason(event.target.value)} disabled={busy} /></Field>
          <button type="button" className={styles.danger} disabled={busy || reason.trim().length < 3}
            onClick={() => void act(() => supabase().rpc('advance_provider_booking_status', {
              p_booking_id: booking.id, p_status: 'disputed', p_note: reason.trim(),
            }))}>{words.workerJobDispute}</button>
        </div>
      ) : null}

      <div className={styles.subpanel}>
        <h3 className={styles.sectionTitle}>{words.workerJobTimeline}</h3>
        {booking.history.length === 0 ? <p className={styles.muted}>{appWords.jobsNoTimeline}</p> : (
          <ol className={styles.timeline}>{booking.history.map((item, index) => (
            <li key={`${item.at}-${index}`}><span className={styles.cardName}>{appWords[`bookingStatus_${item.status}`] ?? item.status}</span>
              {item.note ? <span className={styles.cardMeta}>{item.note}</span> : null}
              <time className={styles.when}>{formatMoment(item.at, locale)}</time></li>
          ))}</ol>
        )}
      </div>
      {failed ? <p className={styles.error} role="alert">{words.workerJobActionFailed}</p> : null}
    </section>
  );
}

function WorkerJobList({ title, empty, rows, locale, appWords, onOpen }: {
  title: string; empty: string; rows: WorkerBooking[] | null; locale: Locale;
  appWords: Record<string, string>; onOpen: (id: string) => void;
}) {
  return <section className={styles.panel}><h2 className={styles.sectionTitle}>{title}</h2>
    {rows === null ? <p className={styles.muted}>{appWords.loading}</p> : rows.length === 0 ? <p className={styles.muted}>{empty}</p> : (
      <ul className={styles.list}>{rows.map((item) => <li key={item.id} className={styles.row}>
        <button type="button" className={styles.rowTitle} onClick={() => onOpen(item.id)}>{cataloguedServiceReferenceLabel(item, [], locale)}</button>
        <span className={styles.cardMeta}>{item.customerName}</span>
        <div className={styles.rowMeta}><LifecycleBadge label={appWords[`bookingStatus_${item.status}`] ?? item.status}
          semantic={bookingLifecycleSemantic(item.status)} />
          <time className={styles.when}>{formatDay(item.scheduledDate, locale)} · {item.scheduledTime.slice(0, 5)}</time></div>
      </li>)}</ul>
    )}</section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={styles.field}><span className={styles.label}>{label}</span>{children}</label>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className={styles.fact}><span className={styles.factLabel}>{label}</span><span className={styles.factValue}>{value || '—'}</span></div>; }
function today() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); }
function formatDay(value: string, locale: Locale) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' }).format(date); }
function formatMoment(value: string, locale: Locale) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
