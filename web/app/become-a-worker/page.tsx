import type { Metadata } from 'next';

import { AlphaNote, PageShell, Prose } from '@/components/page-shell';

export const metadata: Metadata = {
  title: "Work with Warsha",
  description: "Join Warsha as a professional: register your trades, complete verification, and quote work in your area.",
  alternates: { canonical: '/become-a-worker' },
  openGraph: {
    title: "Work with Warsha · Warsha",
    description: "Join Warsha as a professional: register your trades, complete verification, and quote work in your area.",
    url: '/become-a-worker',
  },
};

export default function Page() {
  return (
    <PageShell
      title={"Work with Warsha"}
      lead={"Quote the jobs you want, at the price you set. Verification is completed once and reviewed by a person."}
    >

      <Prose>
        <h2>How you join</h2>
        <ul>
          <li>Register with your phone number and a password. No email is required.</li>
          <li>Tell Warsha which trades you practise and which areas you cover.</li>
          <li>Complete verification, including identity and any trade documents required.</li>
          <li>A person reviews your application. You are told the outcome and the reason.</li>
        </ul>
        <h2>How work reaches you</h2>
        <p>
          You see requests that match your registered trades and areas. You choose which to
          quote, and you set the price. Nothing is assigned to you at a price you did not set.
        </p>
        <h2>What Warsha does not do</h2>
        <ul>
          <li>It does not guarantee a volume of work.</li>
          <li>It does not set your prices.</li>
          <li>It does not take a decision about your application without a stated reason.</li>
        </ul>
      </Prose>
      <AlphaNote>
        Applying starts a verification process. It does not make you a worker on Warsha, and
        approval is not automatic.
      </AlphaNote>
    </PageShell>
  );
}
