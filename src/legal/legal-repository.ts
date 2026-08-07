import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import { hashesFor, legalCorpus, findDocument } from './legal-corpus';
import {
  mockAcceptDocument,
  mockDeclineDocument,
  mockLegalAcceptances,
  mockLegalObligations,
} from './mock-legal-state';
import {
  emptyObligations,
  type LegalAcceptanceRecord,
  type LegalDocumentKey,
  type LegalLanguage,
  type LegalObligations,
} from './legal-types';

/**
 * WPS-024 legal repository.
 *
 * Mock and Supabase are fully isolated: Mock performs no network call, never
 * falls back to Supabase, and a Supabase failure never writes into Mock.
 *
 * Nothing here decides whether an acceptance is valid. The client's job is to
 * say honestly which text it put on screen — it computes the hash of what it
 * rendered and sends that — and the server's job is to decide whether that is
 * the current published version. A client that could answer its own question
 * could record an acceptance of anything.
 *
 * There is no method that publishes a version, edits one, or deletes an
 * acceptance. Those verbs do not exist in this file because they do not exist
 * for any client.
 */

function requireAccount(accountKey: string | null): string {
  if (!accountKey) throw new Error('An account is required');
  return accountKey;
}

/** The hash of the text this build would render for a document and language. */
export function renderedHashFor(key: LegalDocumentKey, language: LegalLanguage): string | null {
  const document = findDocument(key);
  if (!document) return null;
  return hashesFor(document)[language];
}

/** What Mock needs to know about the corpus to answer an obligations call. */
function mockRequirements() {
  return legalCorpus
    .filter((document) => document.requiresAcceptance)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((document) => ({
      key: document.key,
      version: document.version,
      audience: document.audience,
      changeClass: document.changeClass,
      changeSummary: document.changeSummary.en,
      effectiveAt: document.effectiveAt,
    }));
}

export const legalRepository = {
  async obligations(accountKey: string | null): Promise<LegalObligations> {
    if (environment.dataMode === 'mock') {
      return mockLegalObligations(requireAccount(accountKey), mockRequirements());
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_legal_obligations');
    if (error) throw error;
    return (data ?? emptyObligations) as LegalObligations;
  },

  async register(accountKey: string | null): Promise<unknown[]> {
    if (environment.dataMode === 'mock') {
      requireAccount(accountKey);
      return mockRequirements();
    }
    const { data, error } = await getSupabaseClient().rpc('get_legal_document_register');
    if (error) throw error;
    return (data ?? []) as unknown[];
  },

  /**
   * Accept a document.
   *
   * The hash sent is computed from the bundled corpus this build actually
   * renders, not read from the server's register. Reading it from the server
   * and sending it straight back would make the check a formality: the point
   * is that a stale bundle produces a stale hash and is refused.
   */
  async accept(
    accountKey: string | null,
    key: LegalDocumentKey,
    version: string,
    language: LegalLanguage,
    sourceSurface: string,
  ): Promise<{ documentKey: string; version: string; decision: string } | null> {
    const rendered = renderedHashFor(key, language);
    if (!rendered) throw new Error('Unknown legal document');

    if (environment.dataMode === 'mock') {
      const record = mockAcceptDocument(
        requireAccount(accountKey), key, version, language, rendered, rendered, sourceSurface,
      );
      return { documentKey: record.documentKey, version: record.version, decision: record.decision };
    }
    const { data, error } = await getSupabaseClient().rpc('accept_legal_document', {
      p_document_key: key,
      p_version: version,
      p_language: language,
      p_rendered_hash: rendered,
      p_source_surface: sourceSurface,
    });
    if (error) throw error;
    return (data ?? null) as { documentKey: string; version: string; decision: string } | null;
  },

  async decline(
    accountKey: string | null,
    key: LegalDocumentKey,
    version: string,
    language: LegalLanguage,
    reason: string | null,
  ): Promise<{ restricts: string[]; alwaysAvailable: string[] } | null> {
    if (environment.dataMode === 'mock') {
      mockDeclineDocument(requireAccount(accountKey), key, version, language);
      return { restricts: [], alwaysAvailable: [] };
    }
    const { data, error } = await getSupabaseClient().rpc('decline_legal_document', {
      p_document_key: key,
      p_version: version,
      p_language: language,
      p_reason: reason,
    });
    if (error) throw error;
    return (data ?? null) as { restricts: string[]; alwaysAvailable: string[] } | null;
  },

  async acceptances(accountKey: string | null): Promise<LegalAcceptanceRecord[]> {
    if (environment.dataMode === 'mock') {
      return mockLegalAcceptances(requireAccount(accountKey));
    }
    const { data, error } = await getSupabaseClient().rpc('get_my_legal_acceptances', {
      p_limit: 50,
    });
    if (error) throw error;
    return (data ?? []) as LegalAcceptanceRecord[];
  },
};
