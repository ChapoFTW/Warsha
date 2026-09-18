import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { reviewText } from '../src/reviews/review-copy.ts';
import {
  editReviewArgs,
  mapReview,
  reviewAttachmentPath,
  submitReviewArgs,
} from '../src/reviews/review-mapping.ts';

/**
 * Reviews on the web and on the phone are one system.
 *
 * The owner's rule, 2026-09-17: finish the review lifecycle, then give the web
 * parity with the phone against the same authority — no second review system.
 * The web could not leave, read or answer a review; the phone's edit had never
 * reached the server, because it asked for `edit_booking_review` with a
 * `p_booking_id` the function does not take; and French said different things
 * from English and Arabic.
 */

let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks += 1; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks += 1; };
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8');

const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()
  .map((name) => read('supabase', 'migrations', name)).join('\n');

/** The parameter names of the last definition of a function, in order. */
function parameters(name: string): string[] {
  const at = migrations.lastIndexOf(`create or replace function public.${name}(`);
  assert.ok(at >= 0, `${name} is defined`);
  const open = migrations.indexOf('(', at);
  let depth = 0; let close = open;
  for (; close < migrations.length; close += 1) {
    if (migrations[close] === '(') depth += 1;
    if (migrations[close] === ')') { depth -= 1; if (depth === 0) break; }
  }
  return migrations.slice(open + 1, close).split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
}

// --- The arguments are the function's own -----------------------------------
const input = {
  bookingId: 'b1', providerId: 'p1', rating: 4,
  dimensions: { professionalism: 4, quality: 5, punctuality: 3, communication: 4, value: 5 },
  comment: '  Tidy work.  ', isAnonymous: true, attachments: [],
};
equal(Object.keys(submitReviewArgs(input, ['x'])), parameters('submit_booking_review_v2'),
  'THE SUBMIT ARGUMENTS ARE EXACTLY submit_booking_review_v2’S PARAMETERS, IN ORDER');
equal(Object.keys(editReviewArgs('r1', input, ['x'])), parameters('edit_booking_review'),
  'THE EDIT ARGUMENTS ARE EXACTLY edit_booking_review’S — NO BOOKING ID, WHICH MADE EVERY PHONE EDIT FAIL');
check(!('p_booking_id' in editReviewArgs('r1', input, [])), 'and the edit carries no booking id at all');
equal(submitReviewArgs(input, []).p_comment, 'Tidy work.', 'the words are trimmed before they are sent');
equal(parameters('reply_to_booking_review'), ['p_review_id', 'p_body'], 'the reply takes a review and a body');

const repository = read('src', 'reviews', 'review-repository.ts');
check(/rpc\('edit_booking_review', editReviewArgs\(reviewId, input, staged\.paths\)\)/.test(repository)
  && /rpc\('submit_booking_review_v2', submitReviewArgs\(input, staged\.paths\)\)/.test(repository)
  && !/ratingArgs/.test(repository),
  'THE PHONE SENDS THE SHARED ARGUMENTS FOR BOTH WRITES');

// --- A photo path the server accepts -----------------------------------------
const account = '11111111-1111-4111-8111-111111111111';
const booking = '22222222-2222-4222-8222-222222222222';
const serverRule = new RegExp(`^${account}/${booking}/review/[A-Za-z0-9_-]{8,100}\\.(jpg|png|webp)$`);
for (const [mime, extension] of [['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]) {
  const path = reviewAttachmentPath(account, booking, 'AB'.repeat(32), mime);
  check(serverRule.test(path) && path.endsWith(`.${extension}`), `a ${mime} photo is stored where the server's path rule accepts it`);
}
check(/review\/\[A-Za-z0-9_-\]\{8,100\}\\\.\(jpg\|png\|webp\)\$/.test(migrations),
  'and that rule is still the server’s');

// --- One reading of a review row ---------------------------------------------
const mapped = mapReview({
  id: 'r1', booking_id: 'b1', provider_id: 'p1', reviewer_name: 'Customer', rating: 4,
  professionalism_rating: 4, quality_rating: 5, punctuality_rating: 3, communication_rating: 4, value_rating: 5,
  comment: 'Tidy work.', is_anonymous: true, created_at: '2026-09-18T10:00:00Z', can_edit: true,
  edit_deadline_at: '2026-09-21T10:00:00Z', image_refs: ['a/b/review/x.jpg'],
  review_responses: [{ id: 'q1', body: 'Thanks', created_at: '2026-09-18T11:00:00Z' }],
}, new Map([['a/b/review/x.jpg', 'https://signed']]), true);
equal([mapped.dimensions.quality, mapped.canEdit, mapped.attachments[0]?.url, mapped.attachments[0]?.storagePath, mapped.reply?.body],
  [5, true, 'https://signed', 'a/b/review/x.jpg', 'Thanks'], 'a server row reads into the same review on both surfaces');

// --- The same words, and French says what the others say ---------------------
for (const key of ['immutableReply', 'confidenceHelp', 'chooseRating', 'photoRules', 'unavailable', 'comment'] as const) {
  check(reviewText('fr', key) !== reviewText('en', key), `French has its own words for ${key}`);
}
check(/modifiée/.test(reviewText('fr', 'immutableReply')), 'FRENCH SAYS A REPLY CANNOT BE CHANGED, AS ENGLISH AND ARABIC DO');
check(/classement/.test(reviewText('fr', 'confidenceHelp')), 'and that the reputation summary does not change ranking');
check(/chaque critère/.test(reviewText('fr', 'chooseRating')), 'and that every score is required');
check(/5 Mo/.test(reviewText('fr', 'photoRules')) && /4 photos/.test(reviewText('fr', 'photoRules')), 'and states the photo limits');
check(/facultatif/.test(reviewText('fr', 'comment')), 'and that the words are optional');
check(/reviewText\(language, key\)/.test(read('src', 'reviews', 'review-translations.ts')),
  'the phone reads the shared copy');

// --- The web leaves, reads and answers reviews through the same functions ----
const webReviews = read('web', 'lib', 'reviews.ts');
for (const rpc of ['get_booking_review_v2', 'submit_booking_review_v2', 'edit_booking_review', 'reply_to_booking_review']) {
  check(webReviews.includes(`rpc('${rpc}'`), `the web calls ${rpc}`);
}
check(/editReviewArgs\(existing\.id, input, paths\)/.test(webReviews) && /submitReviewArgs\(input, paths\)/.test(webReviews),
  'with the shared arguments');
check(/signedUrlSeconds\('review-attachments'\)/.test(webReviews), 'photos are signed for the declared lifetime');
check(/if \(uploaded\.length\) await client\.storage\.from\(BUCKET\)\.remove\(uploaded\)/.test(webReviews),
  'photos uploaded for a refused write are removed');
check(/crypto\.subtle\.digest\('SHA-256'/.test(webReviews), 'a photo is named by its content');
check(!/\.from\('reviews'\)\.(insert|update|delete|upsert)/.test(webReviews), 'and the web writes no review row directly');

const customerCard = read('web', 'components', 'booking-review.tsx');
const replyCard = read('web', 'components', 'review-reply.tsx');
check(/reviewText\(locale, key\)/.test(customerCard) && /reviewText\(locale, key\)/.test(replyCard),
  'THE WEB SPEAKS THE SAME REVIEW WORDS AS THE PHONE');
check(!/trust-translations|i18n\/localization/.test(customerCard + replyCard + webReviews),
  'and imports nothing that pulls the phone’s runtime into the web');
check((customerCard.match(/<Score /g) ?? []).length === 2 && /DIMENSIONS\.map/.test(customerCard),
  'the web asks for the overall score and each of the five the server requires');
check(/aria-pressed=\{value === option\}/.test(customerCard) && /<legend/.test(customerCard),
  'each score is a labelled group of pressed buttons');
check(/requestAccountRestricted/.test(customerCard) && /workerAccountRestricted/.test(replyCard),
  'a restricted account is told why, in the words the web already uses');
check(/review\.canEdit/.test(customerCard) && /editUntil/.test(customerCard),
  'the Customer can edit while the window is open, and is told until when');
check(/review\.reply \?/.test(replyCard) && /immutableReply/.test(replyCard),
  'the Professional replies once, told first that it cannot be changed');

const jobs = read('web', 'app', 'app', 'jobs', 'page.tsx');
const workerJobs = read('web', 'app', 'app', 'worker', 'jobs', 'page.tsx');
check(/booking\.status === 'completed' \? <BookingReview /.test(jobs), 'a completed job offers its review on the web');
check(/booking\.status === 'completed' \? <ReviewReply /.test(workerJobs), 'and the Professional sees it and can answer');

console.log(`Review parity: ${checks} checks passed.`);
