import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

import heroImage from '@/assets/hero/warsha-hero-electrician.png';

import { Reveal } from '@/components/reveal';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { localeHref } from '@/lib/routes';
import { catalogueFor, documentsForRole } from '@/lib/warsha';

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
        {/* The hero is one composition, not two columns.

            The copy and the photograph are siblings rather than nested, because
            above 900px they occupy the same grid cell: the picture runs the
            full width and height of the section and the type sits in the empty
            half of the room the photograph already contains. Below 900px the
            same two elements are two stacked rows — copy on the canvas, picture
            as a full-bleed band — because a phone-width crop tall enough to
            carry the copy would cut the work out of the frame.

            The copy comes first in the document in both cases. It is the
            heading of the page and it is what a screen reader should meet
            first; the stack order on desktop is a paint decision, not a reading
            one, and is made in the stylesheet.

            The photograph is never mirrored for Arabic. Flipping a record of a
            real moment would put the screwdriver in the man's left hand and the
            socket on the wrong wall — so the picture is direction-neutral by
            construction and the copy stays over the room in both directions.
            The stylesheet explains that choice in full. */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            {/* Four steps of the shared entry gesture. The markup says which
                line it is; globals.css decides what a step is worth, so the
                hero cannot drift away from every other Warsha entry. */}
            <div className={styles.heroText}>
              <p className={styles.eyebrow} data-warsha-enter="1">{words.heroEyebrow}</p>
              <h1 className={styles.heroTitle} data-warsha-enter="2">{words.heroTitle}</h1>
              <p className={styles.heroBody} data-warsha-enter="3">{words.heroBody}</p>
              <div className={styles.heroActions} data-warsha-enter="4">
                <Link href={localeHref(typed, '/create-account')} className={styles.primaryCta}>
                  {words.heroPostJob}
                </Link>
                <Link href={localeHref(typed, '/become-a-worker')} className={styles.secondaryCta}>
                  {words.heroWork}
                </Link>
              </div>
            </div>
          </div>

          <div className={styles.heroVisual} data-warsha-enter="">
            <Image
              src={heroImage}
              alt={words.heroImageAlt}
              className={styles.heroPhoto}
              /* Full-bleed at every breakpoint now, so the browser is told so
                 rather than being handed the old column fractions and asked to
                 pick a file half the width it actually needs. */
              sizes="100vw"
              priority
              placeholder="blur"
            />
          </div>
        </section>

        {/* The three sections below the hero arrive as they are reached —
            each as one object, not as a cascade of individually animating
            cards. A staggered grid of four steps would be an animation to
            watch; a section that has simply finished arriving by the time you
            look at it is not noticed at all, which is the point. */}
        <section className={styles.section} aria-labelledby="how">
          <Reveal>
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
          </Reveal>
        </section>

        <section className={`${styles.section} ${styles.workerBand}`} aria-labelledby="workers">
          <Reveal>
          <div className={styles.workerGrid}>
            <div>
              <p className={styles.eyebrow}>{words.workerEyebrow}</p>
              <h2 id="workers" className={styles.sectionTitle}>{words.workerTitle}</h2>
              <p className={styles.sectionLead}>{words.workerLead}</p>
              <div className={styles.ctaGroup}>
                <Link href={localeHref(typed, '/become-a-worker')} className={styles.primaryCta}>
                  {words.workerCta}
                </Link>
              </div>
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
          </Reveal>
        </section>

        <section className={styles.section} aria-labelledby="legal">
          <Reveal>
          <h2 id="legal" className={styles.sectionTitle}>{words.legalHomeTitle}</h2>
          <p className={styles.sectionLead}>{words.legalHomeLead}</p>
          <div className={styles.legalGrid}>
            {publicLegal.map((document) => (
              <Link
                key={document.key}
                href={localeHref(typed, `/legal/${document.key.replace(/_/g, '-')}`)}
                className={styles.legalCard}
              >
                <span className={styles.legalTitle}>{catalogueFor(document, typed).title}</span>
                <span className={styles.legalMeta}>
                  {words.legalVersion} {document.version}
                </span>
              </Link>
            ))}
          </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter locale={typed} />
    </>
  );
}
