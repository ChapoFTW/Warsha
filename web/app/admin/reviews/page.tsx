'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge, Empty, Waiting } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import {
  ReauthDialog, usePendingReauth, type ReauthRefusalReason,
} from '@/components/reauth-dialog';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import { parseReportedReviews, type ReportedReview } from '@/lib/console-payloads';
import { runGovernedAction } from '@/lib/governed-action';
import { isReauthRefusal } from '@/lib/reauth';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/governed-actions.module.css';
import table from '@/components/console-table.module.css';
import page from './page.module.css';

/**
 * Reported reviews.
 *
 * A Customer or a Professional can report a review from the app, and the
 * server has always had the rest: the report workflow
 * (`review_report_transition`), hiding and restoring a review
 * (`moderate_review`), both audited and both under `moderate_reviews`. No page
 * called any of it, so a report waited for ever and an abusive review stayed
 * on a Professional's profile with nobody able to take it down.
 *
 * The two authorities stay separate here because they are separate on the
 * server. A report is a request for a look; hiding a review is a decision
 * about the review. Closing a report does not hide anything, and hiding a
 * review does not close its reports — an operator does each, deliberately, and
 * each is recorded with its own reason.
 *
 * Oldest first, and not re-sortable, for the reason the vetting queue gives:
 * the order is the triage.
 */

type Show = 'open' | 'closed';
const OPEN = ['submitted', 'in_review'];
const CLOSED = ['resolved', 'dismissed'];

export default function ReviewsPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'moderate_reviews');

  const [show, setShow] = useState<Show>('open');
  const [reports, setReports] = useState<ReportedReview[] | null>(null);
  const [refused, setRefused] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // One governed call at a time, latched synchronously. See `runGovernedAction`.
  const inFlight = useRef(false);
  const onReauthRefused = useCallback((refusal: ReauthRefusalReason) => {
    setError(refusal === 'another-action-pending' ? words.reauthAnotherPending
      : refusal === 'already-retried' ? words.reauthAlreadyRetried
        : words.reauthPendingExpired);
  }, [words.reauthAnotherPending, words.reauthAlreadyRetried, words.reauthPendingExpired]);
  const reauth = usePendingReauth(onReauthRefused);

  const load = useCallback(async () => {
    if (!allowed) return;
    setRefused(false);
    // Who reported it, who wrote it and whose profile it is are deliberately
    // not selected; see `ReportedReview`.
    const { data, error: readError } = await supabase()
      .from('review_reports')
      .select('id,reason,details,status,created_at,resolution_note,'
        + 'review:reviews(id,rating,comment,moderation_status)')
      .in('status', show === 'open' ? OPEN : CLOSED)
      .order('created_at', { ascending: show === 'open' })
      .limit(100);
    if (readError) {
      setRefused(true);
      setReports(null);
      return;
    }
    setReports(parseReportedReviews(data));
  }, [allowed, show]);

  useEffect(() => { void load(); }, [load]);

  const run = (key: string, action: () => Promise<{ error: unknown } | void>) =>
    runGovernedAction(inFlight, key, action, {
      setBusy, setError, setDone,
      refresh: load,
      isReauthRefusal,
      rememberReauth: (pending) =>
        reauth.remember(pending, 'moderate_reviews', () => { void run(pending, action); }),
      failedMessage: words.reviewsActionFailed,
      doneMessage: words.reviewsActionDone,
    });

  const noteFor = (reportId: string) => (notes[reportId] ?? '').trim();

  const transition = (report: ReportedReview, status: 'in_review' | 'resolved' | 'dismissed') =>
    run(`${report.reportId}:${status}`, async () =>
      supabase().rpc('review_report_transition', {
        p_report_id: report.reportId, p_status: status, p_note: noteFor(report.reportId),
      }));

  const moderate = (report: ReportedReview, action: 'hide' | 'restore') => {
    if (!report.review) return;
    // The server refuses an empty reason too; saying so here saves a round trip
    // and says it in the operator's language.
    if (!noteFor(report.reportId)) {
      setDone(null);
      setError(words.reviewsNoteRequired);
      return;
    }
    const reviewId = report.review.id;
    void run(`${report.reportId}:${action}`, async () =>
      supabase().rpc('moderate_review', {
        p_review_id: reviewId, p_action: action, p_reason: noteFor(report.reportId),
      }));
  };

  const say = (key: string) => (words as Record<string, string>)[key] ?? key;

  return (
    <ConsoleShell title={words.reviewsTitle}>
      <p className={table.lead}>{words.reviewsLead}</p>

      {reauth.capability ? (
        <ReauthDialog capability={reauth.capability} onClose={reauth.discard} onSuccess={reauth.resume} />
      ) : null}

      <div className={table.panel}>
        <div className={table.filters}>
          <label className={table.field} style={{ flex: '0 1 220px' }}>
            <span className={table.label}>{words.reviewsShow}</span>
            <select
              className={table.select}
              value={show}
              onChange={(event) => { setReports(null); setShow(event.target.value as Show); }}
              disabled={!allowed || busy !== null}
            >
              <option value="open">{words.reviewsShowOpen}</option>
              <option value="closed">{words.reviewsShowClosed}</option>
            </select>
          </label>
        </div>

        {error ? <p className={table.error} role="alert">{error}</p> : null}
        {done ? <p className={styles.done} role="status">{done}</p> : null}

        {!allowed ? (
          <p className={table.error}>{words.reviewsRefused}</p>
        ) : refused ? (
          <p className={table.error} role="alert">{words.reviewsLoadFailed}</p>
        ) : reports === null ? (
          <Empty>{words.loading}</Empty>
        ) : reports.length === 0 ? (
          <Empty>{show === 'open' ? words.reviewsEmpty : words.reviewsEmptyClosed}</Empty>
        ) : (
          reports.map((report) => {
            const headingId = `report-${report.reportId}`;
            const noteId = `note-${report.reportId}`;
            const open = report.status === 'submitted' || report.status === 'in_review';
            const review = report.review;
            return (
              <section key={report.reportId} className={styles.block} aria-labelledby={headingId}>
                <h2 id={headingId} className={styles.title}>
                  {say(`reviewsReason_${report.reason}`)}
                </h2>
                <p className={page.status}>
                  <Badge tone={report.status === 'submitted' ? 'strong' : 'plain'}>
                    {say(`reviewsStatus_${report.status}`)}
                  </Badge>
                  <Waiting since={report.reportedAt || null} locale={locale} />
                </p>

                {review ? (
                  <dl className={page.facts}>
                    <div>
                      <dt className={styles.label}>{words.reviewsRating}</dt>
                      <dd>{words.reviewsRatingOf.replace('{n}', String(review.rating))}</dd>
                    </div>
                    <div>
                      <dt className={styles.label}>{words.reviewsVisibility}</dt>
                      <dd>
                        <Badge tone={review.visibility === 'visible' ? 'plain' : 'quiet'}>
                          {say(`reviewsVisibility_${review.visibility}`)}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className={styles.label}>{words.reviewsComment}</dt>
                      <dd>{review.comment ? <q dir="auto">{review.comment}</q> : words.reviewsNoComment}</dd>
                    </div>
                    <div>
                      <dt className={styles.label}>{words.reviewsDetails}</dt>
                      <dd dir="auto">{report.details || words.reviewsNoDetails}</dd>
                    </div>
                    {!open && report.resolutionNote ? (
                      <div>
                        <dt className={styles.label}>{words.reviewsResolution}</dt>
                        <dd dir="auto">{report.resolutionNote}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className={table.error}>{words.reviewsMissing}</p>
                )}

                <div className={styles.form}>
                  <label className={styles.field} htmlFor={noteId}>
                    <span className={styles.label}>{words.reviewsNote}</span>
                    <textarea
                      id={noteId}
                      className={styles.textarea}
                      value={notes[report.reportId] ?? ''}
                      maxLength={1000}
                      aria-describedby={`${noteId}-help`}
                      onChange={(event) => setNotes({ ...notes, [report.reportId]: event.target.value })}
                    />
                    <span id={`${noteId}-help`} className={styles.hint}>{words.reviewsNoteHelp}</span>
                  </label>
                  <div className={styles.choices}>
                    {report.status === 'submitted' ? (
                      <button type="button" className={styles.choice} disabled={busy !== null}
                        onClick={() => void transition(report, 'in_review')}>{words.reviewsStart}</button>
                    ) : null}
                    {review && review.visibility !== 'hidden' ? (
                      <button type="button" className={`${styles.choice} ${styles.choiceAdverse}`} disabled={busy !== null}
                        onClick={() => moderate(report, 'hide')}>{words.reviewsHide}</button>
                    ) : null}
                    {review && review.visibility === 'hidden' ? (
                      <button type="button" className={styles.choice} disabled={busy !== null}
                        onClick={() => moderate(report, 'restore')}>{words.reviewsRestore}</button>
                    ) : null}
                    {open ? (
                      <>
                        <button type="button" className={styles.choice} disabled={busy !== null}
                          onClick={() => void transition(report, 'resolved')}>{words.reviewsResolve}</button>
                        <button type="button" className={styles.choice} disabled={busy !== null}
                          onClick={() => void transition(report, 'dismissed')}>{words.reviewsDismiss}</button>
                      </>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>
    </ConsoleShell>
  );
}

