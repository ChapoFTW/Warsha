import type { Metadata } from 'next';

import { AlphaNote, Card, CardGrid, PageShell, Prose } from '@/components/page-shell';

export const metadata: Metadata = {
  title: "Trust & safety",
  description: "How Warsha verifies professionals, records agreements, and handles disputes and appeals.",
  alternates: { canonical: '/trust-and-safety' },
  openGraph: {
    title: "Trust & safety · Warsha",
    description: "How Warsha verifies professionals, records agreements, and handles disputes and appeals.",
    url: '/trust-and-safety',
  },
};

export default function Page() {
  return (
    <PageShell
      title={"Trust & safety"}
      lead={"What Warsha checks, what it records, and what it will not claim."}
    >

      <Prose>
        <h2>Professionals are verified before they work</h2>
        <p>
          A worker completes identity verification and any documents their trade requires.
          A person reviews the evidence and records a decision with a reason.
        </p>
        <h2>Agreements are recorded, not remembered</h2>
        <p>
          The accepted price, the agreed job, and the exact version of every legal document a
          person accepted are all recorded. Acceptance records are append-only: they can be
          added to and never edited, so a past agreement cannot be quietly rewritten.
        </p>
        <h2>Disputes are decided by people</h2>
        <p>
          A dispute is reviewed by a member of staff. An adverse decision may be appealed, and
          the appeal is decided by somebody other than the person who made the original
          decision. That separation is enforced by the system rather than by convention.
        </p>
        <h2>What Warsha does not claim</h2>
        <ul>
          <li>It does not publish ratings or reviews it has not received.</li>
          <li>It does not guarantee response times.</li>
          <li>It does not claim coverage in areas where no verified worker operates.</li>
        </ul>
      </Prose>
    </PageShell>
  );
}
