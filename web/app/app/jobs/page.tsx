'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import { isFinished, parseBookings, type Booking } from '@/lib/customer';
import { customerNav } from '@/lib/nav';
import { intlLocale, type Locale } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/product-surface.module.css';

const CANCELLABLE = new Set([
  'pending_provider_approval', 'accepted', 'rescheduling_requested', 'confirmed',
  'provider_on_the_way', 'provider_arrived',
]);
const RESCHEDULABLE = new Set(['pending_provider_approval', 'accepted', 'confirmed']);
const CANCEL_REASONS = ['plans_changed', 'booked_by_mistake', 'provider_delay', 'price_concern', 'other'] as const;

/** Customer booking state and the customer transitions the database permits. */
export default function JobsPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await supabase()
      .from('bookings')
      .select('id,status,service_name_snapshot,issue_description,scheduled_date,'
        + 'scheduled_time,address_snapshot,estimated_price_egp,final_price_egp,created_at,'
        + 'proposed_scheduled_date,proposed_scheduled_time,provider_reschedule_note,'
        + 'booking_status_history(status,created_at,metadata)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { setFailed(true); return; }
    setBookings(parseBookings(data));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const [active, past] = useMemo(() => {
    const rows = bookings ?? [];
    return [rows.filter((booking) => !isFinished(booking.status)), rows.filter((booking) => isFinished(booking.status))];
  }, [bookings]);
  const opened = bookings?.find((booking) => booking.id === openId) ?? null;

  return (
    <AppShell nav={customerNav(words)} mode={words.modeCustomer}>
      <div className={styles.head}><h1 className={styles.title}>{words.jobsTitle}</h1></div>
      <p className={styles.lead}>{words.jobsLead}</p>

      {failed ? (
        <div className={styles.panel}>
          <p className={styles.error} role="alert">{words.loadFailed}</p>
          <button type="button" className={styles.secondary} onClick={() => void load()}>{words.retry}</button>
        </div>
      ) : null}

      {opened ? (
        <JobDetail booking={opened} words={words} locale={locale}
          onClose={() => setOpenId(null)} onChanged={load} />
      ) : null}

      <JobList title={words.jobsActive} empty={words.jobsNoneActive}
        bookings={bookings === null ? null : active} words={words} locale={locale} onOpen={setOpenId} />
      <JobList title={words.jobsPast} empty={words.jobsNonePast}
        bookings={bookings === null ? null : past} words={words} locale={locale} onOpen={setOpenId} />
    </AppShell>
  );
}

function JobDetail({
  booking,
  words,
  locale,
  onClose,
  onChanged,
}: {
  booking: Booking;
  words: Record<string, string>;
  locale: Locale;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number]>('plans_changed');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const act = async (operation: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    setFailure(false);
    const result = await operation();
    if (result.error) setFailure(true);
    else await onChanged();
    setBusy(false);
  };

  return (
    <section className={styles.panel} aria-label={booking.serviceName}>
      <div className={styles.head}>
        <h2 className={styles.sectionTitle}>{words.jobsDetail}</h2>
        <button type="button" className={styles.secondary} onClick={onClose}>{words.close}</button>
      </div>
      <div className={styles.rowMeta}>
        <span className={styles.badge}>{words[`bookingStatus_${booking.status}`] ?? booking.status}</span>
        <time className={styles.when}>{formatDay(booking.scheduledDate, locale)} · {booking.scheduledTime.slice(0, 5)}</time>
      </div>
      <p className={styles.factValue}>{booking.issueDescription}</p>
      <div className={styles.facts}>
        <Fact label={words.jobsAddress} value={booking.addressSnapshot} />
        <Fact label={booking.finalPrice ? words.jobsFinalPrice : words.jobsEstimate}
          value={`${booking.finalPrice ?? booking.estimatedPrice} ${words.currencyEgp}`} />
      </div>

      {booking.status === 'rescheduling_requested' ? (
        <div className={styles.subpanel}>
          <h3 className={styles.sectionTitle}>{words.jobsProposedTime}</h3>
          <p className={styles.factValue}>
            {booking.proposedDate ? `${formatDay(booking.proposedDate, locale)} · ${(booking.proposedTime ?? '').slice(0, 5)}` : '—'}
          </p>
          {booking.providerRescheduleNote ? <p className={styles.muted}>{booking.providerRescheduleNote}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.action} disabled={busy}
              onClick={() => void act(() => supabase().rpc('accept_provider_reschedule', { p_booking_id: booking.id }))}>
              {words.jobsAcceptTime}
            </button>
            <button type="button" className={styles.secondary} disabled={busy}
              onClick={() => void act(() => supabase().rpc('reject_provider_reschedule', { p_booking_id: booking.id }))}>
              {words.jobsRejectTime}
            </button>
          </div>
        </div>
      ) : null}

      {RESCHEDULABLE.has(booking.status) ? (
        <div className={styles.subpanel}>
          <h3 className={styles.sectionTitle}>{words.jobsReschedule}</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>{words.jobsNewDate}</span>
              <input className={styles.input} type="date" value={date} min={today()}
                onChange={(event) => setDate(event.target.value)} disabled={busy} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{words.jobsNewTime}</span>
              <input className={styles.input} type="time" value={time}
                onChange={(event) => setTime(event.target.value)} disabled={busy} />
            </label>
          </div>
          <button type="button" className={styles.secondary} disabled={busy || !date || !time}
            onClick={() => void act(() => supabase().rpc('reschedule_customer_booking', {
              p_booking_id: booking.id, p_scheduled_date: date, p_scheduled_time: time,
            }))}>{words.jobsSaveTime}</button>
        </div>
      ) : null}

      {CANCELLABLE.has(booking.status) ? (
        <div className={styles.subpanel}>
          <label className={styles.field}>
            <span className={styles.label}>{words.jobsCancelReason}</span>
            <select className={styles.select} value={reason}
              onChange={(event) => setReason(event.target.value as typeof reason)} disabled={busy}>
              {CANCEL_REASONS.map((value) => (
                <option key={value} value={value}>{words[`cancelReason_${value}`]}</option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.danger} disabled={busy}
            onClick={() => void act(() => supabase().rpc('cancel_customer_booking', {
              p_booking_id: booking.id, p_reason: reason,
            }))}>{words.jobsCancel}</button>
        </div>
      ) : null}

      <div className={styles.subpanel}>
        <h3 className={styles.sectionTitle}>{words.jobsTimeline}</h3>
        {booking.history.length === 0 ? <p className={styles.muted}>{words.jobsNoTimeline}</p> : (
          <ol className={styles.timeline}>
            {booking.history.map((event, index) => (
              <li key={`${event.at}-${event.status}-${index}`}>
                <span className={styles.cardName}>{words[`bookingStatus_${event.status}`] ?? event.status}</span>
                {event.note ? <span className={styles.cardMeta}>{event.note}</span> : null}
                <time className={styles.when}>{formatMoment(event.at, locale)}</time>
              </li>
            ))}
          </ol>
        )}
      </div>

      {failure ? <p className={styles.error} role="alert">{words.jobsActionFailed}</p> : null}
    </section>
  );
}

function JobList({
  title, empty, bookings, words, locale, onOpen,
}: {
  title: string;
  empty: string;
  bookings: Booking[] | null;
  words: Record<string, string>;
  locale: Locale;
  onOpen: (id: string) => void;
}) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {bookings === null ? <p className={styles.muted}>{words.loading}</p>
        : bookings.length === 0 ? <p className={styles.muted}>{empty}</p> : (
          <ul className={styles.list}>
            {bookings.map((booking) => (
              <li key={booking.id} className={styles.row}>
                <button type="button" className={styles.rowTitle} onClick={() => onOpen(booking.id)}>
                  {booking.serviceName}
                </button>
                <span className={styles.cardMeta}>{booking.issueDescription.slice(0, 140)}</span>
                <div className={styles.rowMeta}>
                  <span className={styles.badge}>{words[`bookingStatus_${booking.status}`] ?? booking.status}</span>
                  <time className={styles.when}>{formatDay(booking.scheduledDate, locale)} · {booking.scheduledTime.slice(0, 5)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={styles.fact}><span className={styles.factLabel}>{label}</span><span className={styles.factValue}>{value}</span></div>;
}

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDay(value: string, locale: Locale): string {
  if (!value) return '—';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' }).format(at);
}

function formatMoment(value: string, locale: Locale): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(at);
}
