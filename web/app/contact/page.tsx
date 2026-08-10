import type { Metadata } from 'next';

import { AlphaNote, Card, CardGrid, PageShell, Prose } from '@/components/page-shell';

export const metadata: Metadata = {
  title: "Contact Warsha",
  description: "How to reach Warsha support.",
  alternates: { canonical: '/contact' },
  openGraph: {
    title: "Contact Warsha · Warsha",
    description: "How to reach Warsha support.",
    url: '/contact',
  },
};

export default function Page() {
  return (
    <PageShell
      title={"Contact Warsha"}
      lead={"Support runs inside the application, where it can see the job you are asking about."}
    >

      <Prose>
        <h2>If you have an account</h2>
        <p>
          Open Support from your account. A case raised there is attached to your account and
          the relevant job, which means it can be answered without asking you to re-explain
          anything, and it leaves a record you can refer back to.
        </p>
        <h2>If you do not have an account</h2>
        <p>
          The Help section answers most questions about how Warsha works, what verification
          involves, and how agreements are recorded.
        </p>
        <h2>Privacy requests</h2>
        <p>
          Requests about your personal data — access, correction, export, or deletion — are
          handled through Privacy in your account, so that the request is bound to a verified
          identity rather than an email address anybody could send from.
        </p>
      </Prose>
    </PageShell>
  );
}
