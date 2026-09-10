/**
 * The review log expires, and this proves it by expiring one.
 *
 * The log exists because the gate could not express a legitimate outcome: a
 * review that concluded the articles needed no change. `lastReviewedDate` has a
 * day's precision, so a second review on the same day was not recordable at
 * all, and the only way through was writing filler — which `help-docs.mjs`
 * warns against three separate times in its own comments.
 *
 * The danger of fixing that is the opposite failure, and it is worse. A record
 * with no tie to what was read is a permanent rubber stamp: review one article
 * once, and every future change to that area is waved through forever.
 *
 * So the predicate is exercised directly rather than through the gate. Through
 * the gate it is unreachable: the first branch is "you edited an article, that
 * is evidence enough", so any test that mutates an article to see the pin hold
 * proves only that editing an article satisfies the gate — which was never in
 * doubt. That mistake was made here first, and it passed for the wrong reason.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { articleDigest, reviewedArticles } from './help-review-log.mjs';

let checks = 0;
const ok = (value: unknown, message: string) => { checks += 1; assert.ok(value, message); };
const equal = (actual: unknown, expected: unknown, message: string) => {
  checks += 1; assert.deepEqual(actual, expected, message);
};

type Article = { id: string; locale: string; title: string; summary: string; body: string };
type Record = { id: string; locale: string; digest: string };
type Log = { note?: string; reviews: { date: string; reason: string; articles: Record[] }[] };

const load = (path: string) => {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return (Array.isArray(parsed) ? parsed : parsed.articles) as Article[];
};

const articles: Article[] = [
  ...load('docs/help/articles.json'),
  ...load('docs/help/articles.fr.json'),
];
const log = JSON.parse(readFileSync('docs/help/review-log.json', 'utf8')) as Log;

/** A copy, so nothing here can leave the repository altered. */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// --- The recorded reviews are currently good --------------------------------
ok(log.reviews.length > 0, 'the log has entries to check');

const EARLY = '2000-01-01';
const live = reviewedArticles({ log, articles, changedOn: EARLY });
const claimed = new Set(log.reviews.flatMap((entry) => entry.articles.map((r) => r.id)));

for (const id of claimed) {
  ok(live.has(id), `${id}: the recorded review still matches the article as it stands`);
}

// --- It goes stale when the content moves -----------------------------------
{
  const pinned = log.reviews.at(-1)!.articles[0];
  const mutated = clone(articles);
  const victim = mutated.find((a) => a.id === pinned.id && a.locale === pinned.locale)!;
  ok(victim, `the pinned article ${pinned.id}/${pinned.locale} exists`);
  victim.body = `${victim.body}\n\nA sentence that was not there when this was reviewed.`;

  const after = reviewedArticles({ log, articles: mutated, changedOn: EARLY });
  ok(!after.has(pinned.id),
    'A REVIEW GOES STALE WHEN ITS ARTICLE CHANGES — the pin no longer matches');
  // And only that article. A stale review must not invalidate unrelated ones.
  for (const id of claimed) {
    if (id === pinned.id) continue;
    ok(after.has(id), `${id}: unaffected by a change to a different article`);
  }
}

// --- One stale LOCALE invalidates the whole article -------------------------
{
  const pinned = log.reviews.at(-1)!.articles[0];
  const mutated = clone(articles);
  // Deliberately a locale the entry pinned but a reader might skip.
  const other = mutated.find((a) => a.id === pinned.id && a.locale !== pinned.locale);
  ok(other, `${pinned.id} has more than one locale, or this check means nothing`);
  other!.summary = `${other!.summary} Changed.`;

  const after = reviewedArticles({ log, articles: mutated, changedOn: EARLY });
  ok(!after.has(pinned.id),
    'a review does not survive a change to a locale it also claimed to have read');
}

// --- It goes stale when the behaviour moves after the review ----------------
{
  const later = '2099-01-01';
  const after = reviewedArticles({ log, articles, changedOn: later });
  equal([...after], [],
    'A REVIEW RECORDED BEFORE THE CHANGE IS NOT EVIDENCE ABOUT IT — digests match and it still fails');
}

// --- A thin reason is not a review ------------------------------------------
{
  const thin = clone(log);
  thin.reviews.forEach((entry) => { entry.reason = 'fine'; });
  const after = reviewedArticles({ log: thin, articles, changedOn: EARLY });
  equal([...after], [], 'a one-word reason counts for nothing');
}

// --- A forged digest is not a review ----------------------------------------
{
  const forged = clone(log);
  forged.reviews.forEach((entry) => {
    entry.articles.forEach((record) => { record.digest = '0'.repeat(16); });
  });
  const after = reviewedArticles({ log: forged, articles, changedOn: EARLY });
  equal([...after], [], 'a digest that matches nothing matches nothing');
}

// --- A half-read article is not a reviewed article --------------------------
{
  const partial = clone(log);
  const id = partial.reviews.at(-1)!.articles[0].id;
  // Keep one locale of that article, drop the rest.
  const first = partial.reviews.at(-1)!.articles.find((r) => r.id === id)!;
  partial.reviews.at(-1)!.articles = partial.reviews.at(-1)!.articles
    .filter((r) => r.id !== id).concat(first);

  const after = reviewedArticles({ log: partial, articles, changedOn: EARLY });
  ok(!after.has(id), 'reading one locale does not review the article');
}

// --- The digest is of what a reader reads -----------------------------------
{
  const article = articles[0];
  const withNewDate = { ...article, lastReviewedDate: '1999-12-31', version: 999 };
  equal(articleDigest(withNewDate as Article), articleDigest(article),
    'recording a review does not invalidate the review that recorded it');

  const withNewBody = { ...article, body: `${article.body} ` };
  ok(articleDigest(withNewBody) !== articleDigest(article),
    'and even a trailing space in the body is a different article');
}

console.log(`Help review log: ${checks} checks passed.`);
