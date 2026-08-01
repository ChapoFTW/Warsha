import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/auth/auth-context';

import { reviewRepository } from './review-repository';
import type { BookingReview, RatingSummary, ReviewInput, ReviewReportReason, ReviewSort, ReviewVote } from './review-types';

type Value = {
  getSummary: (providerId: string, sort?: ReviewSort) => Promise<RatingSummary>;
  getBookingReview: (bookingId: string) => Promise<BookingReview | undefined>;
  getReviewedBookingIds: (bookingIds: string[]) => Promise<string[]>;
  submit: (input: ReviewInput) => Promise<BookingReview>;
  edit: (reviewId: string, input: ReviewInput) => Promise<BookingReview>;
  reply: (reviewId: string, body: string) => Promise<void>;
  vote: (reviewId: string, vote: ReviewVote) => Promise<void>;
  report: (reviewId: string, reason: ReviewReportReason, details?: string) => Promise<void>;
  busy: boolean;
  revision: number;
};

const Context = createContext<Value | null>(null);

export function ReviewProvider({ children }: PropsWithChildren) {
  const { user, mode } = useAuth();
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = false;
    setBusy(false);
    setRevision((value) => value + 1);
  }, [mode, user?.id]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    if (busyRef.current) throw new Error('Please wait.');
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await operation();
      setRevision((value) => value + 1);
      return result;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const submit = useCallback(
    (input: ReviewInput) => run(() => {
      if (!accountKey) throw new Error('Authentication required');
      return reviewRepository.submit(accountKey, input);
    }),
    [accountKey, run],
  );
  const edit = useCallback((reviewId: string, input: ReviewInput) => run(() => {
    if (!accountKey) throw new Error('Authentication required');
    return reviewRepository.edit(accountKey, reviewId, input);
  }), [accountKey, run]);
  const reply = useCallback(
    (reviewId: string, body: string) => run(async () => {
      if (!accountKey) throw new Error('Authentication required');
      await reviewRepository.reply(accountKey, reviewId, body);
    }),
    [accountKey, run],
  );
  const vote = useCallback((reviewId: string, value: ReviewVote) => run(async () => {
    if (!accountKey) throw new Error('Authentication required');
    await reviewRepository.vote(accountKey, reviewId, value);
  }), [accountKey, run]);
  const report = useCallback((reviewId: string, reason: ReviewReportReason, details = '') => run(async () => {
    if (!accountKey) throw new Error('Authentication required');
    await reviewRepository.report(accountKey, reviewId, reason, details);
  }), [accountKey, run]);

  const value = useMemo<Value>(() => ({
    busy,
    revision,
    getSummary: (providerId, sort = 'newest') => reviewRepository.summary(accountKey ?? 'guest', providerId, sort),
    getBookingReview: (bookingId) => {
      if (!accountKey) return Promise.resolve(undefined);
      return reviewRepository.byBooking(accountKey, bookingId);
    },
    getReviewedBookingIds: (bookingIds) => accountKey ? reviewRepository.reviewedBookingIds(accountKey, bookingIds) : Promise.resolve([]),
    submit,
    edit,
    reply,
    vote,
    report,
  }), [accountKey, busy, edit, reply, report, revision, submit, vote]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useReviews() {
  const value = useContext(Context);
  if (!value) throw new Error('useReviews must be used within ReviewProvider');
  return value;
}
