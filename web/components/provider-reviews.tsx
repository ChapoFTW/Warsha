'use client';

import { useCallback, useEffect, useState } from 'react';

import { Photos } from '@/components/booking-review';
import { intlLocale, type Locale } from '@/lib/preferences';
import { loadReputation, reportReview, voteOnReview } from '@/lib/reviews';
import { reviewText, type ReviewCopyKey } from '@/src/reviews/review-copy';
import type {
  BookingReview, RatingSummary, ReviewReportReason, ReviewSort, ReviewVote,
} from '@/src/reviews/review-types';
import { translations } from '@/lib/warsha';
import { formatWarshaTimestamp } from '@/src/utils/warsha-time';

import styles from './product-surface.module.css';

const SORTS: [ReviewSort, ReviewCopyKey][] = [
  ['newest', 'newest'], ['highest_rated', 'highestRated'], ['lowest_rated', 'lowestRated'], ['most_helpful', 'mostHelpful'],
];
const REASONS: [ReviewReportReason, ReviewCopyKey][] = [
  ['spam', 'spam'], ['abuse', 'abuse'], ['fake_review', 'fakeReview'], ['offensive_content', 'offensiveContent'],
];
const DIMENSIONS = ['professionalism', 'quality', 'punctuality', 'communication', 'value'] as const;

/**
 * A Professional's reputation and reviews, on the web — the phone's
 * `ProviderReviewSummary`, through `get_provider_reputation_summary`,
 * `vote_review_helpfulness` and `report_review`.
 *
 * Every figure is the server's. Nothing here averages, counts or ranks; the
 * sort is a question asked of the server, not a re-ordering of what came back.
 */
export function ProviderReviews({ providerId, locale }: { providerId: string; locale: Locale }) {
  const rt = (key: ReviewCopyKey) => reviewText(locale, key);
  const number = new Intl.NumberFormat(intlLocale(locale));
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try { setSummary(await loadReputation(providerId, sort)); } catch { setFailed(true); }
  }, [providerId, sort]);
  useEffect(() => { void load(); }, [load]);

  if (failed && !summary) {
    return (
      <div className={styles.subpanel}>
        <p className={styles.error} role="alert">{rt('loadError')}</p>
        <button type="button" className={styles.secondary} onClick={() => void load()}>{rt('tryAgain')}</button>
      </div>
    );
  }
  if (!summary) return <p className={styles.muted}>{rt('loading')}</p>;

  const percent = (value?: number) => value === undefined ? rt('unavailable') : `${number.format(value)}%`;
  const badges = ([
    [summary.badges.identityVerified, 'identityVerified'], [summary.badges.skillCertificateVerified, 'skillVerified'],
    [summary.badges.professionalCertificateVerified, 'professionalVerified'], [summary.badges.topRated, 'topRated'],
    [summary.badges.fastResponder, 'fastResponder'], [summary.badges.experienced, 'experienced'],
  ] as [boolean, ReviewCopyKey][]).filter(([on]) => on).map(([, key]) => rt(key));

  return (
    <div className={styles.reviewForm}>
      <div className={styles.facts}>
        <Fact label={rt('averageRating')} value={`★ ${number.format(summary.average)} (${number.format(summary.count)})`} />
        <Fact label={rt('completedJobs')} value={number.format(summary.completedJobs)} />
        <Fact label={rt('responseRate')} value={percent(summary.responseRate)} />
        <Fact label={rt('completionRate')} value={percent(summary.completionRate)} />
        <Fact label={rt('repeatCustomers')} value={percent(summary.repeatCustomerPercentage)} />
        <Fact label={rt('yearsOnPlatform')} value={number.format(summary.yearsOnPlatform)} />
      </div>
      {badges.length ? <ul className={styles.chips}>{badges.map((label) => <li key={label} className={styles.chip}>{label}</li>)}</ul> : null}

      <h4 className={styles.label}>{rt('ratingBreakdown')}</h4>
      <ul className={styles.chips}>
        {DIMENSIONS.map((key) => (
          <li key={key} className={styles.chip}>{rt(key)}: ★ {number.format(summary.dimensions[key])}</li>
        ))}
      </ul>

      <h4 className={styles.label}>{rt('ratingDistribution')}</h4>
      <ul className={styles.distribution}>
        {([5, 4, 3, 2, 1] as const).map((star) => (
          <li key={star} className={styles.distributionRow}
            aria-label={`${number.format(star)} ★: ${number.format(summary.distribution[star])}`}>
            <span aria-hidden="true">{number.format(star)} ★</span>
            <span aria-hidden="true" className={styles.distributionTrack}>
              <span className={styles.distributionFill}
                style={{ inlineSize: `${summary.count ? summary.distribution[star] / summary.count * 100 : 0}%` }} />
            </span>
            <span aria-hidden="true">{number.format(summary.distribution[star])}</span>
          </li>
        ))}
      </ul>
      <p><strong>{rt('confidence')}: {number.format(summary.confidence.score)}/100</strong></p>
      <p className={styles.hint}>{rt('confidenceHelp')}</p>

      <h4 className={styles.label}>{rt('reviews')}</h4>
      <fieldset className={styles.scoreSet}>
        <legend className={styles.label}>{rt('sortReviews')}</legend>
        <div className={styles.scoreRow}>
          {SORTS.map(([value, key]) => (
            <button key={value} type="button" aria-pressed={sort === value}
              className={sort === value ? `${styles.compact} ${styles.chipStrong}` : styles.compact}
              onClick={() => setSort(value)}>{rt(key)}</button>
          ))}
        </div>
      </fieldset>

      {summary.reviews.length === 0 ? <p className={styles.muted}>{rt('noReviews')}</p> : (
        <ul className={styles.list}>
          {summary.reviews.map((review) => (
            <ReviewItem key={review.id} review={review} locale={locale}
              onVote={async (vote) => {
                setProblem(null);
                try { await voteOnReview(review.id, vote); await load(); } catch { setProblem(rt('voteError')); }
              }}
              onReport={async (reason, details) => {
                setProblem(null);
                try { await reportReview(review.id, reason, details); return true; } catch { setProblem(rt('reportError')); return false; }
              }} />
          ))}
        </ul>
      )}
      {problem ? <p className={styles.error} role="alert">{problem}</p> : null}
    </div>
  );
}

function ReviewItem({ review, locale, onVote, onReport }: {
  review: BookingReview;
  locale: Locale;
  onVote: (vote: ReviewVote) => Promise<void>;
  onReport: (reason: ReviewReportReason, details: string) => Promise<boolean>;
}) {
  const rt = (key: ReviewCopyKey) => reviewText(locale, key);
  const number = new Intl.NumberFormat(intlLocale(locale));
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReviewReportReason>('spam');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const act = async (operation: () => Promise<unknown>) => { setBusy(true); await operation(); setBusy(false); };
  const name = review.reviewerName === 'Customer' ? translations[locale].reviewCustomer : review.reviewerName;

  return (
    <li className={styles.row}>
      <div className={styles.rowMeta}>
        <span className={styles.cardName}>{name}</span>
        <time className={styles.when}>{formatWarshaTimestamp(review.createdAt, locale)}</time>
      </div>
      <p className={styles.factValue} aria-label={`${rt('overall')}: ${review.rating} / 5`}>★ {number.format(review.rating)} / {number.format(5)}</p>
      <ul className={styles.chips}>
        {DIMENSIONS.map((key) => (
          <li key={key} className={styles.chip}>{rt(key)} {number.format(review.dimensions[key])}/{number.format(5)}</li>
        ))}
      </ul>
      <p className={styles.muted}>{rt('verifiedBooking')}</p>
      {review.comment ? <p dir="auto">{review.comment}</p> : null}
      <Photos review={review} locale={locale} />
      {review.reply ? (
        <div className={styles.reviewReply}>
          <p className={styles.label}>{rt('providerReply')}</p>
          <p dir="auto">{review.reply.body}</p>
        </div>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.compact} disabled={busy} aria-pressed={review.myVote === 'helpful'}
          onClick={() => void act(() => onVote('helpful'))}>{rt('helpful')} ({number.format(review.helpfulCount)})</button>
        <button type="button" className={styles.compact} disabled={busy} aria-pressed={review.myVote === 'not_helpful'}
          onClick={() => void act(() => onVote('not_helpful'))}>{rt('notHelpful')} ({number.format(review.notHelpfulCount)})</button>
        <button type="button" className={styles.compact} disabled={busy} aria-expanded={reporting}
          onClick={() => setReporting(!reporting)}>{rt('report')}</button>
      </div>
      {reporting ? (
        <form className={styles.reviewForm} onSubmit={(event) => {
          event.preventDefault();
          void act(async () => { if (await onReport(reason, details)) { setSent(true); setReporting(false); setDetails(''); } });
        }}>
          <fieldset className={styles.scoreSet}>
            <legend className={styles.label}>{rt('reportReason')}</legend>
            <div className={styles.scoreRow}>
              {REASONS.map(([value, key]) => (
                <button key={value} type="button" aria-pressed={reason === value}
                  className={reason === value ? `${styles.compact} ${styles.chipStrong}` : styles.compact}
                  onClick={() => setReason(value)}>{rt(key)}</button>
              ))}
            </div>
          </fieldset>
          <label className={styles.field}>
            <span className={styles.label}>{rt('reportDetails')}</span>
            <textarea className={styles.textarea} dir="auto" maxLength={1000} value={details}
              onChange={(event) => setDetails(event.target.value)} disabled={busy} />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={styles.secondary} disabled={busy}>{rt('sendReport')}</button>
          </div>
        </form>
      ) : null}
      {sent ? <p className={styles.ok} role="status">{rt('reportSent')}</p> : null}
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={styles.fact}><span className={styles.factLabel}>{label}</span><span className={styles.factValue}>{value}</span></div>;
}
