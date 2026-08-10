import type { Metadata } from 'next';

import { AlphaNote, Card, CardGrid, PageShell, Prose } from '@/components/page-shell';

export const metadata: Metadata = {
  title: "Help",
  description: "Help and answers about using Warsha as a customer or a professional.",
  alternates: { canonical: '/help' },
  openGraph: {
    title: "Help · Warsha",
    description: "Help and answers about using Warsha as a customer or a professional.",
    url: '/help',
  },
};

export default function Page() {
  return (
    <PageShell
      title={"Help"}
      lead={"How Warsha works, what it records, and what to do when something is wrong."}
    >

      <CardGrid>
        <Card title="Creating an account">
          <p>
            Customers register with an email address and password, and confirm the address
            before signing in. Professionals register with a phone number and password.
          </p>
        </Card>
        <Card title="Agreeing a price">
          <p>
            You accept a quote before a job is booked. The accepted price is recorded against
            the job.
          </p>
        </Card>
        <Card title="Verification">
          <p>
            Professionals complete identity and trade verification once. A person reviews it
            and records a decision with a reason.
          </p>
        </Card>
        <Card title="Cancelling">
          <p>
            A job can be cancelled, and the reason is recorded. Cancellation rules are set out
            in the Cancellation Policy.
          </p>
        </Card>
        <Card title="Disputes and appeals">
          <p>
            Raise a dispute from the job. Adverse decisions can be appealed to somebody other
            than the original decision-maker.
          </p>
        </Card>
        <Card title="Your data">
          <p>
            Access, export, correction, and deletion are available from Privacy inside your
            account.
          </p>
        </Card>
      </CardGrid>
    </PageShell>
  );
}
