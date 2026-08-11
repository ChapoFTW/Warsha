import { notFound } from 'next/navigation';
import Link from 'next/link';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { localeHref } from '@/lib/routes';
import { documentsForRole } from '@/lib/warsha';

import styles from './page.module.css';

/**
 * The homepage answers one question for two people who arrived for opposite
 * reasons, without making either read the other's half first.
 *
 * Every claim is one the platform can currently support. There is no worker
 * count, no average response time, no rating and no coverage map, because
 * Warsha is in closed alpha and inventing those would make everything else on
 * the page untrustworthy too.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;
  const words = copy[typed];
  const publicLegal = documentsForRole(null);

  const steps = [
    { title: words.step1Title, body: words.step1Body },
    { title: words.step2Title, body: words.step2Body },
    { title: words.step3Title, body: words.step3Body },
    { title: words.step4Title, body: words.step4Body },
  ];

  const workerPoints = [
    { title: words.worker1Title, body: words.worker1Body },
    { title: words.worker2Title, body: words.worker2Body },
    { title: words.worker3Title, body: words.worker3Body },
  ];

  return (
    <>
      <SiteHeader locale={typed} />

      <main id="main">
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>{words.heroEyebrow}</p>
            <h1 className={styles.heroTitle}>{words.heroTitle}</h1>
            <p className={styles.heroBody}>{words.heroBody}</p>
            <div className={styles.heroActions}>
              <Link href={localeHref(typed, '/create-account')} className={styles.primaryCta}>
                {words.heroPostJob}
              </Link>
              <Link href={localeHref(typed, '/become-a-worker')} className={styles.secondaryCta}>
                {words.heroWork}
              </Link>
            </div>
            <p className={styles.heroNote}>{words.heroNote}</p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="how">
          <h2 id="how" className={styles.sectionTitle}>{words.howTitle}</h2>
          <p className={styles.sectionLead}>{words.howLead}</p>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
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
              <p className={styles.eyebrow}>{words.workerEyebrow}</p>
              <h2 id="workers" className={styles.sectionTitle}>{words.workerTitle}</h2>
              <p className={styles.sectionLead}>{words.workerLead}</p>
              <Link href={localeHref(typed, '/become-a-worker')} className={styles.primaryCta}>
                {words.workerCta}
              </Link>
            </div>
            <ul className={styles.workerList}>
              {workerPoints.map((point) => (
                <li key={point.title} className={styles.workerItem}>
                  <h3 className={styles.stepTitle}>{point.title}</h3>
                  <p className={styles.stepBody}>{point.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="legal">
          <h2 id="legal" className={styles.sectionTitle}>{words.legalHomeTitle}</h2>
          <p className={styles.sectionLead}>{words.legalHomeLead}</p>
          <div className={styles.legalGrid}>
            {publicLegal.map((document) => (
              <Link
                key={document.key}
                href={localeHref(typed, `/legal/${document.key.replace(/_/g, '-')}`)}
                className={styles.legalCard}
              >
                <span className={styles.legalTitle}>{document[typed].title}</span>
                <span className={styles.legalMeta}>
                  {words.legalVersion} {document.version}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter locale={typed} />
    </>
  );
}
