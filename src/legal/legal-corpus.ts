/**
 * WPS-024 — the assembled legal corpus.
 *
 * This module is the single source of truth for the text of every Warsha legal
 * document. The database register (`public.legal_document_versions`) stores the
 * metadata and a hash of each language; the pgTAP suite and the client
 * regression suite together assert that the text here hashes to the value
 * recorded there.
 *
 * That chain is the whole point. A person accepts a version; the acceptance
 * records the hash of what they were shown; the register records the hash of
 * the published version; this module holds the text. If any link is edited
 * without the others, a test fails rather than an acceptance quietly starting
 * to refer to text nobody agreed to.
 *
 * Storing the bodies here rather than in the migration is deliberate. Thirty
 * thousand words of legal text inside a SQL file would be unreviewable, would
 * be impossible to diff usefully, and would make correcting a typo a database
 * migration. Text belongs in the repository; the binding is the hash.
 */

import { legalCatalogueFr } from './legal-catalogue-fr.ts';
import { canonicalText, sha256Hex } from './legal-hash.ts';
import {
  customerTerms,
  privacyPolicy,
  workerTerms,
  workerVerificationPolicy,
} from './legal-corpus-agreements.ts';
import {
  acceptableUsePolicy,
  appealsPolicy,
  cancellationPolicy,
  contentPolicy,
  intellectualPropertyPolicy,
  refundPolicy,
  trustSafetyPolicy,
  workerCodeOfConduct,
} from './legal-corpus-conduct.ts';
import {
  aiUsagePolicy,
  cookiePolicy,
  dataProcessingPolicy,
  dataRetentionPolicy,
  locationDataPolicy,
  ocrUsagePolicy,
} from './legal-corpus-data.ts';
import {
  accessibilityStatement,
  dataProcessingRegister,
  dataRetentionRegister,
  incidentResponsePolicy,
  legalContact,
  securityDisclosurePolicy,
  subprocessorRegister,
  versionHistory,
} from './legal-corpus-registers.ts';
import {
  appliesToRole,
  type LegalBody,
  type LegalCatalogue,
  type LegalDisplayLanguage,
  type LegalDocument,
  type LegalDocumentKey,
  type LegalLanguage,
} from './legal-types.ts';

export const legalCorpus: readonly LegalDocument[] = [
  customerTerms,
  workerTerms,
  privacyPolicy,
  workerVerificationPolicy,
  acceptableUsePolicy,
  workerCodeOfConduct,
  contentPolicy,
  intellectualPropertyPolicy,
  trustSafetyPolicy,
  appealsPolicy,
  cancellationPolicy,
  refundPolicy,
  aiUsagePolicy,
  ocrUsagePolicy,
  locationDataPolicy,
  dataProcessingPolicy,
  dataRetentionPolicy,
  cookiePolicy,
  subprocessorRegister,
  dataProcessingRegister,
  dataRetentionRegister,
  incidentResponsePolicy,
  securityDisclosurePolicy,
  accessibilityStatement,
  versionHistory,
  legalContact,
];

/**
 * The exact parts of a document that the hash covers.
 *
 * Title, summary, headings, paragraphs and bullets — everything the reader
 * sees. Metadata is deliberately excluded: the hash answers "is this the same
 * text", and a version number changing is already recorded as a version number
 * changing. Including it would make every hash trivially different and prove
 * nothing about the words.
 */
export function hashableParts(body: LegalBody): string[] {
  const parts: string[] = [body.title, body.summary];
  for (const section of body.sections) {
    parts.push(section.heading);
    parts.push(...section.body);
    if (section.bullets) parts.push(...section.bullets);
  }
  return parts;
}

export function documentHash(body: LegalBody): string {
  return sha256Hex(canonicalText(hashableParts(body)));
}

export function hashesFor(document: LegalDocument): { en: string; ar: string } {
  return { en: documentHash(document.en), ar: documentHash(document.ar) };
}

const byKey = new Map<LegalDocumentKey, LegalDocument>(
  legalCorpus.map((document) => [document.key, document]),
);

export function findDocument(key: string): LegalDocument | null {
  return byKey.get(key as LegalDocumentKey) ?? null;
}

export function bodyFor(document: LegalDocument, language: LegalLanguage): LegalBody {
  return language === 'ar' ? document.ar : document.en;
}

/**
 * How a document is named and described in a display language.
 *
 * French takes its title and summary from the French catalogue; English and
 * Arabic take theirs from the body they already have. This is what the Legal
 * Centre lists, and what any surface naming a policy should call it.
 *
 * The French Legal Centre rendered a correctly localized heading over
 * twenty-six English card titles, because every caller reached for
 * `document[locale === 'ar' ? 'ar' : 'en'].title` — a two-language expression
 * used on a three-language site. Callers ask this instead.
 */
export function catalogueFor(
  document: LegalDocument,
  language: LegalDisplayLanguage,
): LegalCatalogue {
  if (language === 'fr') return legalCatalogueFr[document.key];
  const body = bodyFor(document, language);
  return { title: body.title, summary: body.summary };
}

/**
 * Which language's operative text a reader actually gets, and whether that is
 * the language they asked for.
 *
 * The English body on a French route is a deliberate product decision — French
 * operative text requires separately reviewed, versioned and fingerprinted
 * documents, and inventing one would be worse than showing the English. What
 * was wrong is that it happened *silently*. A reader could not tell a
 * translated document from an untranslated one.
 *
 * So the substitution is returned as data rather than performed quietly, and
 * the surfaces render it. `substituted` is the flag a page must not ignore.
 */
export function bodyLanguageFor(language: LegalDisplayLanguage): {
  language: LegalLanguage;
  substituted: boolean;
} {
  if (language === 'ar') return { language: 'ar', substituted: false };
  if (language === 'fr') return { language: 'en', substituted: true };
  return { language: 'en', substituted: false };
}

/** Documents an account with this role is addressed by, in display order. */
export function documentsForRole(role: 'customer' | 'worker' | null): readonly LegalDocument[] {
  return legalCorpus
    .filter((document) => appliesToRole(document.audience, role))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Documents this role must actually accept.
 *
 * Kept separate from `documentsForRole` because most of the corpus is
 * incorporated by reference into the agreements rather than accepted
 * individually. Asking someone to tap through twelve acceptance screens
 * produces twelve unread documents, not twelve informed decisions.
 */
export function acceptanceRequiredFor(role: 'customer' | 'worker' | null): readonly LegalDocument[] {
  return documentsForRole(role).filter((document) => document.requiresAcceptance);
}

/**
 * Structural checks over the corpus.
 *
 * Run by the regression suite rather than at import time: a module that throws
 * while loading takes the whole application down over a missing full stop,
 * which is a worse failure than the one it was guarding against.
 */
export function corpusProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const seenOrder = new Set<number>();

  for (const document of legalCorpus) {
    if (seen.has(document.key)) problems.push(`duplicate document key: ${document.key}`);
    seen.add(document.key);
    if (seenOrder.has(document.sortOrder)) {
      problems.push(`duplicate sort order ${document.sortOrder} at ${document.key}`);
    }
    seenOrder.add(document.sortOrder);

    if (!/^\d+\.\d+$/.test(document.version)) {
      problems.push(`${document.key}: version is not major.minor`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(document.publishedAt)) {
      problems.push(`${document.key}: publishedAt is not an ISO date`);
    }
    if (document.effectiveAt < document.publishedAt) {
      problems.push(`${document.key}: effective before published`);
    }
    if (document.changeClass === 'initial' && document.supersedesVersion !== null) {
      problems.push(`${document.key}: an initial version cannot supersede anything`);
    }
    if (document.changeClass !== 'initial' && document.supersedesVersion === null) {
      problems.push(`${document.key}: a non-initial version must say what it supersedes`);
    }

    for (const language of ['en', 'ar'] as const) {
      const body = bodyFor(document, language);
      if (body.sections.length === 0) problems.push(`${document.key}.${language}: no sections`);
      if (body.title.trim().length === 0) problems.push(`${document.key}.${language}: no title`);
      if (body.summary.trim().length === 0) problems.push(`${document.key}.${language}: no summary`);
      for (const section of body.sections) {
        if (section.heading.trim().length === 0) {
          problems.push(`${document.key}.${language}: a section has no heading`);
        }
        if (section.body.length === 0 && (section.bullets ?? []).length === 0) {
          problems.push(`${document.key}.${language}: "${section.heading}" is empty`);
        }
      }
    }

    // A full Arabic text is expected to carry the same section structure as the
    // English. A summary is not — that is what makes it a summary — so the
    // check follows the flag rather than applying to everything.
    if (!document.arabicIsSummary && document.ar.sections.length !== document.en.sections.length) {
      problems.push(
        `${document.key}: declared a full Arabic text but has ${document.ar.sections.length} Arabic sections to ${document.en.sections.length} English`,
      );
    }
  }

  return problems;
}

/** Every document key, ordered. Exported so tests can enumerate without importing each module. */
export const legalDocumentKeys: readonly LegalDocumentKey[] = legalCorpus
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((document) => document.key);
