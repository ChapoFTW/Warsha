import type { Metadata } from 'next';

import { AlphaNote, PageShell, Prose } from '@/components/page-shell';

export const metadata: Metadata = {
  title: "Service categories",
  description: "Warsha service categories for home repair and maintenance work in Egypt.",
  alternates: { canonical: '/categories' },
  openGraph: {
    title: "Service categories · Warsha",
    description: "Warsha service categories for home repair and maintenance work in Egypt.",
    url: '/categories',
  },
};

export default function Page() {
  return (
    <PageShell
      title={"Service categories"}
      lead={"The trades a worker can register for, and the categories a request can be filed under."}
    >

      <Prose>
        <p>
          A worker registers the trades they practise, and Warsha matches requests to those
          trades and to the areas they cover. A worker may register more than one trade, and
          each is verified on its own terms.
        </p>
        <h2>Where categories matter</h2>
        <ul>
          <li>They decide which workers see a request.</li>
          <li>They decide which verification a worker must complete.</li>
          <li>They are recorded against the job, so history stays searchable.</li>
        </ul>
      </Prose>
      <AlphaNote>
        Categories are governed centrally rather than typed freely, so that a request and a
        worker&apos;s registration can be matched reliably.
      </AlphaNote>
    </PageShell>
  );
}
