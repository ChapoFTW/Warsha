import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/auth/auth-context';

import { reviewRepository } from './review-repository';
import type { BookingReview, RatingSummary, ReviewInput } from './review-types';

type Value = {
  getSummary: (providerId: string) => Promise<RatingSummary>;
  getBookingReview: (bookingId: string) => Promise<BookingReview | undefined>;
  getReviewedBookingIds: (bookingIds: string[]) => Promise<string[]>;
  submit: (input: ReviewInput) => Promise<BookingReview>;
  reply: (reviewId: string, body: string) => Promise<void>;
  busy: boolean;
  revision: number;
};

const Context = createContext<Value | null>(null);

export function ReviewProvider({ children }: PropsWithChildren) {
  const { user, mode } = useAuth();
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
    (input: ReviewInput) => run(() => reviewRepository.submit(input)),
    [run],
  );
  const reply = useCallback(
    (reviewId: string, body: string) => run(async () => {
      await reviewRepository.reply(reviewId, body);
    }),
    [run],
  );

  const value = useMemo<Value>(() => ({
    busy,
    revision,
    getSummary: reviewRepository.summary,
    getBookingReview: reviewRepository.byBooking,
    getReviewedBookingIds: reviewRepository.reviewedBookingIds,
    submit,
    reply,
  }), [busy, reply, revision, submit]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useReviews() {
  const value = useContext(Context);
  if (!value) throw new Error('useReviews must be used within ReviewProvider');
  return value;
}
