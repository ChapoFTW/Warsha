import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { documentsForRole } from '@/lib/warsha';

import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Warsha — home services in Egypt',
  description:
    'Describe the job, receive quotes from skilled professionals, and agree the price '
    + 'before the work starts. Warsha covers home repairs and maintenance in Egypt.',
  // No `languages` alternate. Warsha's public pages are bilingual on one URL —
  // the legal reader renders English and Arabic together — so there is no
  // separate Arabic address to advertise. Declaring `/ar` pointed crawlers at
  // a 404 and offered an Arabic edition that does not exist.
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Warsha — home services in Egypt',
    description:
      'Describe the job, receive quotes from skilled professionals, and agree the '
      + 'price before the work starts.',
    url: '/',
    type: 'website',
  },
};

/**
 * The homepage answers one question for two people who arrived for opposite
 * reasons, without making either read the other's half first.
 *
 * Every claim below is one the platform can currently support. There is no
 * worker count, no average response time, no rating average and no service-area
 * map, because Warsha is in closed alpha and inventing those numbers would be
 * the fastest way to make everything else on the page untrustworthy too.
 */

const CUSTOMER_STEPS = [
  {
    title: 'Describe the job',
    body: 'Say what needs doing and where. Photographs help, and are optional.',
  },
  {
    title: 'Receive quotes',
    body: 'Professionals who cover your area and trade respond with a price for the work.',
  },
  {
    title: 'Agree before work starts',
    body: 'You accept a quote before anybody is booked. The agreed price is recorded.',
  },
  {
    title: 'Track it to completion',
    body: 'Follow the job through to completion, with the conversation kept in one place.',
  },
] as const;

const WORKER_POINTS = [
  {
    title: 'Work that matches your trade',
    body: 'You see requests for the trades you registered and the areas you cover.',
  },
  {
    title: 'You set the price',
    body: 'You quote each job yourself. Nothing is assigned to you at a price you did not set.',
  },
  {
    title: 'Verification you complete once',
    body: 'Identity and trade checks are completed once, then reviewed by a person.',
  },
] as const;

export default function HomePage() {
  const publicLegal = documentsForRole(null);

  return (
    <>
      <SiteHeader />

      <main id="main">
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Home services in Egypt</p>
            <h1 className={styles.heroTitle}>
              Get it fixed, at a price you agreed first.
            </h1>
            <p className={styles.heroBody}>
              Warsha connects people who need home repairs and maintenance with skilled
              professionals. You describe the job, they quote, and you decide before any
              work begins.
            </p>
            <div className={styles.heroActions}>
              <Link href="/create-account" className={styles.primaryCta}>
                Post a job
              </Link>
              <Link href="/become-a-worker" className={styles.secondaryCta}>
                Work with Warsha
              </Link>
            </div>
            <p className={styles.heroNote}>
              Warsha is in closed testing. Accounts created now are real accounts on the
              live service.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="how">
          <h2 id="how" className={styles.sectionTitle}>How it works</h2>
          <p className={styles.sectionLead}>
            Four steps, and the third one is the one that matters.
          </p>
          <ol className={styles.steps}>
            {CUSTOMER_STEPS.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.section} ${styles.workerBand}`} aria-labelledby="workers">
          <div className={styles.workerGrid}>
            <div>
              <p className={styles.eyebrow}>For professionals</p>
              <h2 id="workers" className={styles.sectionTitle}>
                Quote the work you want, at your price.
              </h2>
              <p className={styles.sectionLead}>
                Warsha sends you requests that match your trade and the areas you cover.
                You choose which to quote.
              </p>
              <Link href="/become-a-worker" className={styles.primaryCta}>
                Start your application
              </Link>
            </div>
            <ul className={styles.workerList}>
              {WORKER_POINTS.map((point) => (
                <li key={point.title} className={styles.workerItem}>
                  <h3 className={styles.stepTitle}>{point.title}</h3>
                  <p className={styles.stepBody}>{point.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="legal">
          <h2 id="legal" className={styles.sectionTitle}>Read before you sign up</h2>
          <p className={styles.sectionLead}>
            Every agreement Warsha asks you to accept is readable in full, in English and
            Arabic, before you create an account.
          </p>
          <div className={styles.legalGrid}>
            {publicLegal.map((document) => (
              <Link
                key={document.key}
                href={`/legal/${document.key.replace(/_/g, '-')}`}
                className={styles.legalCard}
              >
                <span className={styles.legalTitle}>{document.en.title}</span>
                <span className={styles.legalMeta}>Version {document.version}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
