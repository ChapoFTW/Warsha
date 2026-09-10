/**
 * Whether a recorded review still counts.
 *
 * `help-docs.mjs` asks for a documentation review when behaviour-bearing files
 * change, and its ordinary evidence is an edited article — which is the right
 * default, because most behaviour changes need a word changing somewhere.
 *
 * A sustained presentation pass breaks that assumption. Commit after commit
 * moves a label above its control or gives a card the elevation every other
 * card already has: real changes to files that carry behaviour, and nothing a
 * reader would ever look up. And `lastReviewedDate` has a day's precision, so a
 * second review on the same day was not expressible at all — the edit was a
 * no-op, the file was unchanged, and the gate reported no review when three had
 * happened. That leaves exactly one way through, and it is writing filler,
 * which `help-docs.mjs` warns against three separate times.
 *
 * So a review may be recorded instead. The danger of that is the opposite
 * failure, and it is worse: a record with no tie to what was read is a
 * permanent rubber stamp — review one article once and every future change to
 * that area is waved through forever.
 *
 * Two things stop it, and both are necessary:
 *
 *   1. **The content is pinned.** Each record carries a digest of the title,
 *      summary and body of one locale. A review of an article that has since
 *      changed reviewed something that is not there any more.
 *
 *   2. **The date must not precede the change.** An article can sit untouched
 *      for months while the behaviour it describes moves underneath it, and a
 *      review from before that change would still match the digest perfectly.
 *
 * This lives in its own file so both conditions can be exercised directly,
 * rather than only through a gate whose first branch — "you edited an article,
 * that is evidence enough" — makes them unreachable from the outside.
 */
import { createHash } from 'node:crypto';

/**
 * What a review is a review OF.
 *
 * Title, summary and body: the three fields a reader actually reads. Not
 * `version` and not `lastReviewedDate`, because those change when a review is
 * recorded, which would make every entry stale the moment it was written.
 */
export function articleDigest(article) {
  return createHash('sha256')
    .update(JSON.stringify({ t: article.title, s: article.summary, b: article.body }))
    .digest('hex')
    .slice(0, 16);
}

/** A reason short enough to have been typed without thinking is not a review. */
const MINIMUM_REASON = 60;

/**
 * The article ids whose recorded review is still good.
 *
 * @param {object} input
 * @param {{reviews?: Array}} input.log       the parsed review log
 * @param {Array} input.articles              every article, every locale
 * @param {string} input.changedOn            ISO date of the change being answered
 * @returns {Set<string>}
 */
export function reviewedArticles({ log, articles, changedOn }) {
  const current = new Map(
    articles.map((article) => [`${article.id}/${article.locale}`, articleDigest(article)]),
  );

  const good = new Set();
  for (const entry of log?.reviews ?? []) {
    if (typeof entry.reason !== 'string' || entry.reason.length <= MINIMUM_REASON) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '')) continue;
    // A review recorded before the change cannot be evidence about it.
    if (entry.date < changedOn) continue;

    // Grouped by article, so one stale locale invalidates the whole article
    // rather than half of it. A person who read the English and not the Arabic
    // has not reviewed the article.
    const byArticle = new Map();
    for (const record of entry.articles ?? []) {
      if (!record?.id || !record?.locale) continue;
      if (!byArticle.has(record.id)) byArticle.set(record.id, []);
      byArticle.get(record.id).push(record);
    }

    for (const [id, records] of byArticle) {
      const locales = articles.filter((article) => article.id === id).map((a) => a.locale);
      if (locales.length === 0) continue;
      const covered = locales.every((locale) => records.some((record) => record.locale === locale
        && record.digest === current.get(`${id}/${locale}`)));
      if (covered) good.add(id);
    }
  }
  return good;
}
