import { SiteFooter, SiteHeader } from '@/components/site-chrome';

import styles from './page-shell.module.css';

/**
 * The frame every ordinary public page uses.
 *
 * Content pages differ in what they say, not in how they are built, so the
 * layout lives here once. The homepage does not use it — a landing page that
 * looks like a content page is a landing page nobody reads.
 */
export function PageShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="main" className={styles.page}>
        <header className={styles.header}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 className={styles.title}>{title}</h1>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
        </header>
        {children ? <div className={styles.content}>{children}</div> : null}
      </main>
      <SiteFooter />
    </>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className={styles.prose}>{children}</div>;
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className={styles.cardGrid}>{children}</div>;
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <div className={styles.cardBody}>{children}</div>
    </div>
  );
}

/**
 * Warsha is in closed testing. Saying so on pages that describe capability is
 * the difference between a description and a promise.
 */
export function AlphaNote({ children }: { children: React.ReactNode }) {
  return <p className={styles.alphaNote}>{children}</p>;
}
