'use client';

import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import type { Locale } from '@/lib/preferences';
import { loadBookingReview, photoProblem, saveBookingReview } from '@/lib/reviews';
import { isAccountRestrictedError } from '@/src/account-standing/account-restriction';
import { REVIEW_COMMENT_MAX, REVIEW_MAX_IMAGES } from '@/src/reviews/review-mapping';
import { reviewText, type ReviewCopyKey } from '@/src/reviews/review-copy';
import { emptyDimensions, type BookingReview, type ReviewDimensions } from '@/src/reviews/review-types';
import { formatWarshaTimestamp } from '@/src/utils/warsha-time';

import styles from './product-surface.module.css';

const DIMENSIONS: (keyof ReviewDimensions)[] = ['professionalism', 'quality', 'punctuality', 'communication', 'value'];

/**
 * The Customer's review of a completed job, on the web.
 *
 * The phone's `BookingReviewCard`, through the same functions: publish once,
 * edit while the window is open, an overall score and the five the server
 * requires, words, whether to be shown only as "Customer", and up to four
 * photos. The web could not leave a review at all before this.
 */
export function BookingReview({ bookingId, locale }: { bookingId: string; locale: Locale }) {
  const rt = (key: ReviewCopyKey) => reviewText(locale, key);
  const accountId = useSession().session?.user.id ?? null;
  const [review, setReview] = useState<BookingReview | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [dimensions, setDimensions] = useState<ReviewDimensions>(emptyDimensions);
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [keptPaths, setKeptPaths] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try { setReview(await loadBookingReview(bookingId)); } catch { setLoadFailed(true); }
  }, [bookingId]);
  useEffect(() => { void load(); }, [load]);

  const start = () => {
    setRating(review?.rating ?? 0);
    setDimensions(review?.dimensions ?? emptyDimensions());
    setComment(review?.comment ?? '');
    setAnonymous(review?.isAnonymous ?? false);
    setKeptPaths(review?.attachments.flatMap((item) => item.storagePath ? [item.storagePath] : []) ?? []);
    setFiles([]);
    setProblem(null);
    setEditing(true);
  };

  const choose = (chosen: FileList | null) => {
    if (!chosen) return;
    const next = [...files];
    for (const file of [...chosen]) {
      if (photoProblem(file, keptPaths.length + next.length)) { setProblem(rt('photoRules')); continue; }
      next.push(file);
    }
    setFiles(next);
  };

  const save = async () => {
    if (!accountId || busy) return;
    if (!rating || Object.values(dimensions).some((value) => !value)) { setProblem(rt('chooseRating')); return; }
    setBusy(true);
    setProblem(null);
    try {
      const saved = await saveBookingReview(accountId, bookingId, review ?? null,
        { rating, dimensions, comment, isAnonymous: anonymous, keptPaths, files });
      setReview(saved);
      setEditing(false);
    } catch (failure) {
      // A review-restricted, suspended or removed account is refused
      // (202609170006) and told so, in the words the web already uses for it.
      setProblem(isAccountRestrictedError(failure) ? appCopy[locale].requestAccountRestricted : rt('reviewError'));
    }
    setBusy(false);
  };

  const heading = review ? rt('submitted') : rt('rateService');
  return (
    <section className={styles.subpanel} aria-labelledby={`review-${bookingId}`}>
      <h3 id={`review-${bookingId}`} className={styles.sectionTitle}>{heading}</h3>
      {loadFailed ? (
        <>
          <p className={styles.error} role="alert">{rt('loadError')}</p>
          <button type="button" className={styles.secondary} onClick={() => void load()}>{rt('tryAgain')}</button>
        </>
      ) : review === undefined ? (
        <p className={styles.muted}>{rt('loading')}</p>
      ) : editing ? (
        <form className={styles.reviewForm} onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <Score label={rt('overall')} value={rating} onChange={setRating} busy={busy} />
          {DIMENSIONS.map((key) => (
            <Score key={key} label={rt(key)} value={dimensions[key]} busy={busy}
              onChange={(value) => setDimensions({ ...dimensions, [key]: value })} />
          ))}
          <label className={styles.field}>
            <span className={styles.label}>{rt('comment')}</span>
            <textarea className={styles.textarea} dir="auto" value={comment} maxLength={REVIEW_COMMENT_MAX}
              onChange={(event) => setComment(event.target.value)} disabled={busy} />
            <span className={styles.hint}>{comment.length}/{REVIEW_COMMENT_MAX}</span>
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} disabled={busy} />
            <span>{rt('anonymous')}</span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{rt('photos')} ({keptPaths.length + files.length}/{REVIEW_MAX_IMAGES})</span>
            <input className={styles.input} type="file" accept="image/jpeg,image/png,image/webp" multiple
              disabled={busy || keptPaths.length + files.length >= REVIEW_MAX_IMAGES}
              onChange={(event) => { choose(event.target.files); event.target.value = ''; }} />
            <span className={styles.hint}>{rt('photoRules')}</span>
          </label>
          {keptPaths.length + files.length > 0 ? (
            <ul className={styles.chips}>
              {review?.attachments.filter((item) => item.storagePath && keptPaths.includes(item.storagePath)).map((item) => (
                <li key={item.id}>
                  <button type="button" className={styles.compact} disabled={busy} aria-label={rt('removePhoto')}
                    onClick={() => setKeptPaths(keptPaths.filter((path) => path !== item.storagePath))}>
                    {item.url ? <img src={item.url} alt={rt('image')} className={styles.reviewThumb} width={88} height={88} /> : rt('imageUnavailable')}
                    <span aria-hidden="true" className={styles.chipCross}>×</span>
                  </button>
                </li>
              ))}
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  <button type="button" className={styles.compact} disabled={busy} aria-label={`${rt('removePhoto')} ${file.name}`}
                    onClick={() => setFiles(files.filter((_, at) => at !== index))}>
                    <span dir="auto">{file.name}</span>
                    <span aria-hidden="true" className={styles.chipCross}>×</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
          <div className={styles.actions}>
            <button type="submit" className={styles.action} disabled={busy}>
              {review ? rt('saveChanges') : rt('submit')}
            </button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => setEditing(false)}>
              {appCopy[locale].cancel}
            </button>
          </div>
        </form>
      ) : review ? (
        <>
          <p className={styles.muted}>{rt('verifiedBooking')}</p>
          <p className={styles.factValue} aria-label={`${rt('overall')}: ${review.rating} / 5`}>★ {review.rating} / 5</p>
          {review.comment ? <p dir="auto">{review.comment}</p> : null}
          <Photos review={review} locale={locale} />
          {review.reply ? (
            <div className={styles.reviewReply}>
              <p className={styles.label}>{rt('providerReply')}</p>
              <p dir="auto">{review.reply.body}</p>
            </div>
          ) : null}
          {review.canEdit ? (
            <>
              {review.editDeadlineAt ? (
                <p className={styles.muted}>{rt('editUntil')} {formatWarshaTimestamp(review.editDeadlineAt, locale)}</p>
              ) : null}
              <button type="button" className={styles.secondary} onClick={start}>{rt('editReview')}</button>
            </>
          ) : <p className={styles.muted}>{rt('editClosed')}</p>}
          {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
        </>
      ) : (
        <button type="button" className={styles.action} onClick={start}>{rt('rateService')}</button>
      )}
    </section>
  );
}

function Score({ label, value, onChange, busy }: {
  label: string; value: number; onChange: (value: number) => void; busy: boolean;
}) {
  return (
    <fieldset className={styles.scoreSet}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.scoreRow}>
        {[1, 2, 3, 4, 5].map((option) => (
          <button key={option} type="button" disabled={busy}
            className={value === option ? `${styles.score} ${styles.scoreOn}` : styles.score}
            aria-pressed={value === option} aria-label={`${label}: ${option} / 5`}
            onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Photos({ review, locale }: { review: BookingReview; locale: Locale }) {
  if (!review.attachments.length) return null;
  return (
    <ul className={styles.chips}>
      {review.attachments.map((item) => (
        <li key={item.id}>
          {item.url
            ? <img src={item.url} alt={reviewText(locale, 'image')} className={styles.reviewThumb} width={88} height={88} />
            : <span className={styles.muted}>{reviewText(locale, 'imageUnavailable')}</span>}
        </li>
      ))}
    </ul>
  );
}
