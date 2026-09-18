'use client';

import { useCallback, useEffect, useState } from 'react';

import { Photos } from '@/components/booking-review';
import type { Locale } from '@/lib/preferences';
import { loadBookingReview, replyToReview } from '@/lib/reviews';
import { translations } from '@/lib/warsha';
import { workerCopy } from '@/lib/worker-copy';
import { isAccountRestrictedError } from '@/src/account-standing/account-restriction';
import { REVIEW_REPLY_MAX } from '@/src/reviews/review-mapping';
import { reviewText } from '@/src/reviews/review-copy';
import type { BookingReview } from '@/src/reviews/review-types';
import { formatWarshaTimestamp } from '@/src/utils/warsha-time';

import styles from './product-surface.module.css';

/**
 * The Customer's review of a Professional's completed job, and the one reply
 * the Professional may publish to it — the phone's `ProviderReviewReply`, on
 * the web, through `get_booking_review_v2` and `reply_to_booking_review`.
 *
 * The words come from where the phone already keeps them: the review copy, and
 * the app translations for the reply's own labels.
 */
export function ReviewReply({ bookingId, locale }: { bookingId: string; locale: Locale }) {
  const t = translations[locale];
  const rt = (key: Parameters<typeof reviewText>[1]) => reviewText(locale, key);
  const [review, setReview] = useState<BookingReview | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try { setReview(await loadBookingReview(bookingId)); } catch { setLoadFailed(true); }
  }, [bookingId]);
  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy || !review) return;
    setBusy(true);
    setProblem(null);
    try {
      await replyToReview(review.id, body);
      setText('');
      await load();
    } catch (failure) {
      setProblem(isAccountRestrictedError(failure) ? workerCopy[locale].workerAccountRestricted : t.reviewReplyError);
    }
    setBusy(false);
  };

  return (
    <section className={styles.subpanel} aria-labelledby={`reply-${bookingId}`}>
      <h3 id={`reply-${bookingId}`} className={styles.sectionTitle}>{t.customerReview}</h3>
      {loadFailed ? (
        <>
          <p className={styles.error} role="alert">{rt('loadError')}</p>
          <button type="button" className={styles.secondary} onClick={() => void load()}>{rt('tryAgain')}</button>
        </>
      ) : review === undefined ? (
        <p className={styles.muted}>{rt('loading')}</p>
      ) : review === null ? (
        <p className={styles.muted}>{t.noReviewYet}</p>
      ) : (
        <>
          <div className={styles.rowMeta}>
            <span className={styles.cardName}>{review.reviewerName === 'Customer' ? t.reviewCustomer : review.reviewerName}</span>
            <time className={styles.when}>{formatWarshaTimestamp(review.createdAt, locale)}</time>
          </div>
          <p className={styles.factValue} aria-label={`${rt('overall')}: ${review.rating} / 5`}>★ {review.rating} / 5</p>
          <p className={styles.muted}>{rt('verifiedBooking')}</p>
          {review.comment ? <p dir="auto">{review.comment}</p> : null}
          <Photos review={review} locale={locale} />
          {review.reply ? (
            <div className={styles.reviewReply}>
              <p className={styles.label}>{rt('providerReply')}</p>
              <p dir="auto">{review.reply.body}</p>
              <time className={styles.when}>{formatWarshaTimestamp(review.reply.createdAt, locale)}</time>
            </div>
          ) : (
            <form className={styles.reviewForm} onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <label className={styles.field}>
                <span className={styles.label}>{t.writeReply}</span>
                <textarea className={styles.textarea} dir="auto" value={text} maxLength={REVIEW_REPLY_MAX}
                  onChange={(event) => setText(event.target.value)} disabled={busy} />
                <span className={styles.hint}>{rt('immutableReply')}</span>
              </label>
              {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
              <div className={styles.actions}>
                <button type="submit" className={styles.action} disabled={busy || !text.trim()}>{t.sendReply}</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
