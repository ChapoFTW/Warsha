import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { APP_CREATE_ACCOUNT, localeHref } from '@/lib/routes';
import { catalogueFor, signupLegalDocuments } from '@/lib/warsha';

import surface from '@/components/product-surface.module.css';

import styles from './page.module.css';

/**
 * The two marks, and why they are not Warsha trade icons.
 *
 * The application draws a house on "I need work done" and a person with a work
 * cue on "I do the work", deliberately: the Warsha icon family names trades and
 * categories, and a customer is neither, while a tool would name one trade
 * rather than the role. They are different SHAPES before they are different
 * pictures, which is what lets them be told apart at a glance and without
 * reading — the thing a reader who is not confident with text relies on.
 *
 * Drawn here in the mark's own stroke language rather than imported from an
 * icon set, so the two surfaces agree. `aria-hidden`, always: the choice is
 * named by the heading beside it, and a mark that is announced as well is read
 * to somebody twice.
 */
function ChoiceMark({ kind }: { kind: 'customer' | 'professional' }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      {kind === 'customer' ? (
        <>
          <path d="M3.5 10.5 12 4l8.5 6.5" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.5 10.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8.5" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="12" cy="7" r="3.25" stroke="currentColor" strokeWidth="2.5" />
          <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" />
          <path d="M15.5 13.5l3.75 3.75" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: copy[locale].createTitle,
    description: copy[locale].createLead,
    alternates: {
      canonical: localeHref(locale, '/create-account'),
      languages: { en: '/en/create-account', ar: '/ar/create-account', fr: '/fr/create-account' },
    },
  };
}

/**
 * Role selection, and the required reading that goes with it.
 *
 * The two audiences accept different documents, and the difference is shown
 * before anybody starts typing rather than discovered at the end of a form.
 * The lists come from `acceptanceRequiredFor` — the same function the mobile
 * signup screen uses to build the manifest it sends — so this page cannot
 * drift from what is actually required.
 */
export default async function CreateAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;
  const words = copy[typed];

  /*
   * The documents this audience accepts, as controls rather than as a reading
   * list.
   *
   * They were five underlined lines stacked down two cards, and the page read
   * as a legal notice with a button at the bottom instead of a choice between
   * two things a person can do. Opening a document before accepting it is one of
   * the reader's available actions, so it looks like one — the shared compact
   * tier from `product-surface.module.css`, not a fifth private button.
   *
   * Still `<Link>` underneath. These are navigations: they must open in a new
   * tab when somebody asks for that, be copyable, be crawlable and prefetch like
   * any other route. Presentation changed; the element did not.
   *
   * Each document keeps its own control and its own canonical title from the
   * legal corpus. Nothing is merged and nothing is abbreviated — a person has to
   * be able to tell which agreement they are opening, and the titles ARE the
   * identity.
   */
  const required = (documents: ReturnType<typeof signupLegalDocuments>) => (
    <ul className={`${styles.required} ${surface.compactRow}`}>
      {documents.map((document) => (
        <li key={document.key} className={styles.requiredItem}>
          <Link
            href={localeHref(typed, `/legal/${document.key.replace(/_/g, '-')}`)}
            className={surface.compact}
          >
            {catalogueFor(document, typed).title}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <SiteHeader locale={typed} />
      <main id="main" className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{words.createEyebrow}</p>
          <h1 className={styles.title}>{words.createTitle}</h1>
          <p className={styles.lead}>{words.createLead}</p>
          {/* The closed-testing disclosure lives here rather than in the homepage
              hero. It is a real disclosure — accounts created now are real
              accounts on the live service — and it belongs at the point where
              somebody is about to create one, not in the marketing headline. */}
          <p className={styles.notice}>{words.heroNote}</p>
        </header>

        <div className={styles.choices}>
          <div className={styles.choice}>
            <div className={styles.choiceHead}>
              <span className={styles.choiceMark}><ChoiceMark kind="customer" /></span>
              <h2 className={styles.choiceTitle}>{words.signInCustomer}</h2>
            </div>
            <p className={styles.choiceBody}>{words.createCustomerBody}</p>
            <div className={styles.requiredBlock}>
              <h3 className={styles.requiredHeading}>{words.createRequiredHeading}</h3>
              {required(signupLegalDocuments('customer'))}
            </div>
            {/* Customer signup is on the web and has been for some time; this
                card said it was coming. */}
            <a href={APP_CREATE_ACCOUNT} className={styles.action}>
              {words.createAccount}
            </a>
          </div>

          <div className={styles.choice}>
            <div className={styles.choiceHead}>
              <span className={styles.choiceMark}><ChoiceMark kind="professional" /></span>
              <h2 className={styles.choiceTitle}>{words.signInWorker}</h2>
            </div>
            <p className={styles.choiceBody}>{words.createWorkerBody}</p>
            <div className={styles.requiredBlock}>
              <h3 className={styles.requiredHeading}>{words.createRequiredHeading}</h3>
              {required(signupLegalDocuments('worker'))}
            </div>
            {/* Where the other card has its button, this one says where the
                button is.

                Not a control: there is nothing on this origin or any other for
                it to open. A professional registers through the broker, which
                mints a session against a synthetic identity — a server-side
                trust boundary that is not moving into a browser bundle — and
                Warsha is in closed testing, so there is no public store listing
                to point at either. A button that goes nowhere would be worse
                than a sentence. It sits in the action slot so it answers the
                question the slot asks, and it says where, not why. */}
            <p className={styles.inApp}>{words.createWorkerInApp}</p>
          </div>
        </div>

        {/* Applying starts a verification process and does not end in one. That
            is a consequence somebody needs before they apply, so it stays —
            this audit removes implementation, not expectations. */}
        <p className={styles.footNote}>{words.createFootNote}</p>

        {/* Signing in was the sixth underlined line on the page, at the end of
            a sentence, indistinguishable from the five legal documents above it.
            It is the one thing here a returning person came to do. */}
        <div className={styles.haveAccount}>
          <span>{words.createHaveAccount}</span>
          <Link href={localeHref(typed, '/sign-in')} className={surface.compact}>
            {words.signIn}
          </Link>
        </div>
      </main>
      <SiteFooter locale={typed} />
    </>
  );
}
