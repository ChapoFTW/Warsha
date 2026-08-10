import type { Metadata } from 'next';

import { AlphaNote, Card, CardGrid, PageShell, Prose } from '@/components/page-shell';

export const metadata: Metadata = {
  title: "How Warsha works",
  description: "How a job works on Warsha: describe it, receive quotes, agree a price, and track it to completion.",
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    title: "How Warsha works · Warsha",
    description: "How a job works on Warsha: describe it, receive quotes, agree a price, and track it to completion.",
    url: '/how-it-works',
  },
};

export default function Page() {
  return (
    <PageShell
      title={"How Warsha works"}
      lead={"A job on Warsha moves through four states, and you agree the price before the third."}
    >

      <Prose>
        <h2>1. You describe the job</h2>
        <p>
          You choose the trade, describe what needs doing, and say where. Photographs are
          optional and usually make quotes more accurate.
        </p>
        <h2>2. Professionals quote</h2>
        <p>
          Warsha shows the request to workers whose registered trade and work area match it.
          Each decides whether to quote, and sets their own price.
        </p>
        <h2>3. You accept a quote</h2>
        <p>
          Nothing is booked until you accept. The accepted price is recorded against the job,
          so there is a written record of what was agreed and by whom.
        </p>
        <h2>4. The job runs to completion</h2>
        <p>
          The job moves through its states until it is complete, with messages kept against
          the job rather than scattered across personal phone numbers.
        </p>
        <h2>If something goes wrong</h2>
        <p>
          A job can be cancelled, and a dispute can be raised. Disputes are reviewed by a
          person, and an adverse decision can be appealed to somebody other than the person
          who made it.
        </p>
      </Prose>
      <AlphaNote>
        Warsha is in closed testing. Coverage depends on which professionals have completed
        verification, so a request may not always find a match yet.
      </AlphaNote>
    </PageShell>
  );
}
