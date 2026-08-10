import type { Metadata } from 'next';

import { PageShell, Prose } from '@/components/page-shell';

export const metadata: Metadata = {
  title: "About Warsha",
  description: "About Warsha, a home services marketplace operating in Egypt.",
  alternates: { canonical: '/about' },
  openGraph: {
    title: "About Warsha · Warsha",
    description: "About Warsha, a home services marketplace operating in Egypt.",
    url: '/about',
  },
};

export default function Page() {
  return (
    <PageShell
      title={"About Warsha"}
      lead={"Warsha is a marketplace for home repair and maintenance work in Egypt."}
    >

      <Prose>
        <p>
          Warsha exists because arranging home repairs usually means asking around, taking a
          price on trust, and having no record of what was agreed. The result is that both
          sides carry risk they did not choose: the customer cannot tell who is competent,
          and the worker cannot prove they were.
        </p>
        <h2>What Warsha does about that</h2>
        <ul>
          <li>Professionals are verified by a person before they take work.</li>
          <li>The price is agreed in writing before the job starts.</li>
          <li>The job, the messages, and the agreement stay in one place.</li>
          <li>Decisions that affect somebody carry a reason and can be appealed.</li>
        </ul>
        <h2>Where Warsha operates</h2>
        <p>
          Egypt. Warsha is in closed testing, and coverage follows the professionals who have
          completed verification rather than a map drawn in advance.
        </p>
      </Prose>
    </PageShell>
  );
}
