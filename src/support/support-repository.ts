import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import {
  mockAccount,
  mockArticleDetail,
  mockArticleSummary,
  mockCategorySummaries,
  mockHelpArticles,
  mockHelpCategories,
  mockResolutionReasons,
  mockSlaPolicy,
  mockSupportMacros,
} from './mock-support-state';
import {
  supportAttachmentBucket,
  supportAttachmentExtension,
  supportAttachmentMaxBytes,
  supportAttachmentMaxPerCase,
  supportAttachmentPath,
  supportMaxReopens,
  supportReopenWindowDays,
} from './support-types';
import type {
  HelpArticle,
  HelpCategoryDetail,
  HelpCenter,
  HelpSearchResult,
  HelpSearchSuggestions,
  OpenSupportCaseInput,
  StaffSupportQueue,
  StaffSupportToolkit,
  SupportCaseDetail,
  SupportCaseSummary,
  SupportLocale,
  SupportSurface,
} from './support-types';

/**
 * WPS-019 support repository.
 *
 * Mock and Supabase are fully isolated: Mock makes no network call and never
 * falls back to Supabase, and every Mock read and write is scoped to the
 * account key so one account can never observe another.
 *
 * There is no AI anywhere in this file. Search is Postgres full-text with a
 * bounded trigram fallback in Supabase mode, and deterministic token matching
 * in Mock mode.
 */

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100);
}

/**
 * Mock search mirrors the server contract: an exact pass, then a bounded
 * approximate pass, then an explicit empty state. It is not the same algorithm
 * and does not pretend to be — it is the same set of outcomes so the UI is
 * exercised identically in both modes.
 */
function mockSearch(query: string, locale: SupportLocale, surface?: SupportSurface): HelpSearchResult {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) {
    return { query: normalized, locale, mode: 'too_short', results: [], resultCount: 0 };
  }
  const terms = normalized.split(' ').filter(Boolean);
  const haystack = (slug: string) => {
    const article = mockHelpArticles.find(a => a.slug === slug)!;
    return `${article.title[locale]} ${article.summary[locale]} ${article.tags.join(' ')}`.toLowerCase();
  };

  const exact = mockHelpArticles
    .filter(article => terms.every(term => haystack(article.slug).includes(term)))
    .sort((a, b) => {
      const surfaceRank = (x: typeof a) => (surface && x.surfaces.includes(surface) ? 0 : 1);
      return surfaceRank(a) - surfaceRank(b) || a.sortOrder - b.sortOrder;
    });
  if (exact.length > 0) {
    return {
      query: normalized, locale, mode: 'exact',
      results: exact.map(a => ({ ...mockArticleSummary(a, locale), match: 'exact' as const })),
      resultCount: exact.length,
    };
  }

  // Bounded tolerance: a query that shares a long prefix with a word in the
  // article. Deliberately conservative, like the server's threshold.
  const approximate = mockHelpArticles.filter(article =>
    haystack(article.slug).split(/\s+/).some(word =>
      word.length >= 4 && normalized.length >= 4
      && (word.startsWith(normalized.slice(0, 4)) || normalized.startsWith(word.slice(0, 4)))));
  if (approximate.length > 0) {
    return {
      query: normalized, locale, mode: 'approximate',
      results: approximate.map(a => ({ ...mockArticleSummary(a, locale), match: 'approximate' as const })),
      resultCount: approximate.length,
    };
  }
  return { query: normalized, locale, mode: 'empty', results: [], resultCount: 0 };
}

export const supportRepository = {
  // -------------------------------------------------------------------------
  // Knowledge base
  // -------------------------------------------------------------------------
  async getHelpCenter(
    accountKey: string, locale: SupportLocale, surface?: SupportSurface,
  ): Promise<HelpCenter> {
    if (environment.dataMode === 'mock') {
      const account = mockAccount(accountKey);
      const ordered = [...mockHelpArticles].sort((a, b) => {
        const rank = (x: typeof a) => (surface && x.surfaces.includes(surface) ? 0 : 1);
        return rank(a) - rank(b) || a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug);
      });
      const scoped = surface ? ordered.filter(a => a.surfaces.includes(surface)) : ordered;
      return {
        locale,
        surface: surface ?? null,
        categories: mockCategorySummaries(locale),
        suggested: (scoped.length > 0 ? scoped : ordered).slice(0, 8).map(a => mockArticleSummary(a, locale)),
        popular: [...mockHelpArticles]
          .filter(a => (account.articleViews[a.slug] ?? 0) > 0)
          .sort((a, b) => (account.articleViews[b.slug] ?? 0) - (account.articleViews[a.slug] ?? 0))
          .slice(0, 5)
          .map(a => ({ ...mockArticleSummary(a, locale), viewCount: account.articleViews[a.slug] ?? 0 })),
        generatedAt: new Date().toISOString(),
      };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_help_center', {
      p_locale: locale, p_surface: surface ?? null,
    });
    if (error) throw error;
    return data as HelpCenter;
  },

  async getHelpCategory(
    accountKey: string, categoryKey: string, locale: SupportLocale,
  ): Promise<HelpCategoryDetail> {
    if (environment.dataMode === 'mock') {
      const category = mockHelpCategories.find(c => c.categoryKey === categoryKey);
      if (!category) throw new Error('Help category not found');
      return {
        categoryKey: category.categoryKey,
        title: category.title[locale],
        summary: category.summary[locale],
        icon: category.icon,
        audience: category.audience,
        articles: mockHelpArticles
          .filter(a => a.categoryKey === categoryKey)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(a => mockArticleSummary(a, locale)),
      };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_help_category', {
      p_category_key: categoryKey, p_locale: locale,
    });
    if (error) throw error;
    return data as HelpCategoryDetail;
  },

  async getHelpArticle(accountKey: string, slug: string, locale: SupportLocale): Promise<HelpArticle> {
    if (environment.dataMode === 'mock') {
      const article = mockHelpArticles.find(a => a.slug === slug);
      if (!article) throw new Error('Help article not found');
      const account = mockAccount(accountKey);
      account.articleViews[slug] = (account.articleViews[slug] ?? 0) + 1;
      return mockArticleDetail(article, locale, account);
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_help_article', { p_slug: slug, p_locale: locale });
    if (error) throw error;
    return data as HelpArticle;
  },

  async searchHelpArticles(
    accountKey: string, query: string, locale: SupportLocale, surface?: SupportSurface,
  ): Promise<HelpSearchResult> {
    if (environment.dataMode === 'mock') {
      const result = mockSearch(query, locale, surface);
      if (result.mode !== 'too_short') {
        const account = mockAccount(accountKey);
        account.searches = [
          { query: result.query, at: Date.now() },
          ...account.searches.filter(s => s.query !== result.query),
        ].slice(0, 8);
      }
      return result;
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('search_help_articles', {
      p_query: query, p_locale: locale, p_surface: surface ?? null, p_limit: 10,
    });
    if (error) throw error;
    return data as HelpSearchResult;
  },

  async getSearchSuggestions(accountKey: string, locale: SupportLocale): Promise<HelpSearchSuggestions> {
    if (environment.dataMode === 'mock') {
      // Popular searches are suppressed below five distinct accounts on the
      // server. Mock has one account per key, so it is always empty — the same
      // outcome, for the same privacy reason.
      return { locale, recent: mockAccount(accountKey).searches.map(s => s.query), popular: [] };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_help_search_suggestions', { p_locale: locale });
    if (error) throw error;
    return data as HelpSearchSuggestions;
  },

  async submitArticleFeedback(
    accountKey: string, slug: string, helpful: boolean, locale: SupportLocale,
  ): Promise<{ slug: string; helpful: boolean; duplicate: boolean }> {
    if (environment.dataMode === 'mock') {
      const account = mockAccount(accountKey);
      const duplicate = account.feedback[slug] === helpful;
      account.feedback[slug] = helpful;
      return { slug, helpful, duplicate };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('submit_help_article_feedback', {
      p_slug: slug, p_helpful: helpful, p_locale: locale,
    });
    if (error) throw error;
    return data as { slug: string; helpful: boolean; duplicate: boolean };
  },

  // -------------------------------------------------------------------------
  // Support cases
  // -------------------------------------------------------------------------
  async openCase(
    accountKey: string, input: OpenSupportCaseInput,
  ): Promise<{ caseId: string; duplicate: boolean }> {
    if (environment.dataMode === 'mock') {
      const account = mockAccount(accountKey);
      const existing = account.cases.find(c => c.caseId === input.idempotencyKey);
      if (existing) return { caseId: existing.caseId, duplicate: true };
      const now = new Date().toISOString();
      account.cases.unshift({
        caseId: input.idempotencyKey,
        subject: input.subject.trim(),
        category: input.category,
        status: 'open',
        priority: 'normal',
        locale: input.locale,
        originSurface: input.originSurface,
        linkedType: input.linkedType ?? null,
        linkedId: input.linkedId ?? null,
        requesterMode: ['portfolio', 'earnings', 'verification', 'onboarding'].includes(input.originSurface)
          || ['worker_onboarding', 'verification_help', 'withdrawal_question'].includes(input.category)
          ? 'worker' : 'customer',
        createdAt: now,
        lastReplyAt: now,
        resolvedAt: null,
        closedAt: null,
        reopenedCount: 0,
        canReply: true,
        canReopen: false,
        canAttach: true,
        surveyAvailable: false,
        satisfactionScore: null,
        messages: [{ id: `${input.idempotencyKey}-m1`, body: input.body.trim(), fromMe: true, createdAt: now }],
        attachments: [],
        events: [{ id: `${input.idempotencyKey}-e1`, action: 'opened', toStatus: 'open', actorRole: 'participant', createdAt: now }],
      });
      return { caseId: input.idempotencyKey, duplicate: false };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('open_support_case', {
      p_category: input.category,
      p_subject: input.subject,
      p_body: input.body,
      p_idempotency_key: input.idempotencyKey,
      p_linked_type: input.linkedType ?? null,
      p_linked_id: input.linkedId ?? null,
      p_origin_surface: input.originSurface,
      p_locale: input.locale,
    });
    if (error) throw error;
    return data as { caseId: string; duplicate: boolean };
  },

  async listMyCases(accountKey: string): Promise<SupportCaseSummary[]> {
    if (environment.dataMode === 'mock') {
      return mockAccount(accountKey).cases.map(c => ({
        caseId: c.caseId, subject: c.subject, category: c.category, status: c.status,
        priority: c.priority, createdAt: c.createdAt, lastReplyAt: c.lastReplyAt, messages: c.messages,
      }));
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_my_support_cases');
    if (error) throw error;
    return (data ?? []) as SupportCaseSummary[];
  },

  async getCase(accountKey: string, caseId: string): Promise<SupportCaseDetail> {
    if (environment.dataMode === 'mock') {
      const found = mockAccount(accountKey).cases.find(c => c.caseId === caseId);
      // Account isolation: a case belonging to another key is simply not found.
      if (!found) throw new Error('Support case not found');
      return {
        ...found,
        canReply: found.status !== 'closed',
        canReopen: found.status === 'resolved'
          && found.reopenedCount < supportMaxReopens
          && Boolean(found.resolvedAt)
          && Date.parse(found.resolvedAt!) > Date.now() - supportReopenWindowDays * 86_400_000,
        canAttach: found.status !== 'closed' && found.attachments.length < supportAttachmentMaxPerCase,
        surveyAvailable: ['resolved', 'closed'].includes(found.status) && found.satisfactionScore == null,
      };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_my_support_case', { p_case_id: caseId });
    if (error) throw error;
    return data as SupportCaseDetail;
  },

  async reply(
    accountKey: string, caseId: string, body: string, idempotencyKey: string,
  ): Promise<{ duplicate: boolean }> {
    if (environment.dataMode === 'mock') {
      const found = mockAccount(accountKey).cases.find(c => c.caseId === caseId);
      if (!found) throw new Error('Support case not found');
      if (found.status === 'closed') throw new Error('This support case is closed');
      if (found.messages.some(m => m.id === idempotencyKey)) return { duplicate: true };
      const now = new Date().toISOString();
      found.messages.push({ id: idempotencyKey, body: body.trim(), fromMe: true, createdAt: now });
      found.lastReplyAt = now;
      return { duplicate: false };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('reply_support_case', {
      p_case_id: caseId, p_body: body, p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data as { duplicate: boolean };
  },

  async reopen(
    accountKey: string, caseId: string, reason: string, idempotencyKey: string,
  ): Promise<{ status: string; duplicate: boolean }> {
    if (environment.dataMode === 'mock') {
      const found = mockAccount(accountKey).cases.find(c => c.caseId === caseId);
      if (!found) throw new Error('Support case not found');
      if (found.status !== 'resolved') throw new Error('Only a resolved support case can be reopened');
      if (found.reopenedCount >= supportMaxReopens) throw new Error('This support case cannot be reopened again');
      if (!found.resolvedAt || Date.parse(found.resolvedAt) <= Date.now() - supportReopenWindowDays * 86_400_000) {
        throw new Error('The reopen window for this support case has passed');
      }
      found.status = 'open';
      found.reopenedCount += 1;
      found.resolvedAt = null;
      const now = new Date().toISOString();
      found.messages.push({ id: idempotencyKey, body: reason.trim(), fromMe: true, createdAt: now });
      found.lastReplyAt = now;
      return { status: 'open', duplicate: false };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('reopen_support_case', {
      p_case_id: caseId, p_reason: reason, p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data as { status: string; duplicate: boolean };
  },

  async submitSatisfaction(
    accountKey: string, caseId: string, score: number, comment?: string,
  ): Promise<{ score: number; duplicate: boolean }> {
    if (environment.dataMode === 'mock') {
      const found = mockAccount(accountKey).cases.find(c => c.caseId === caseId);
      if (!found) throw new Error('Support case not found');
      if (!['resolved', 'closed'].includes(found.status)) {
        throw new Error('The survey opens when the case is resolved');
      }
      if (found.satisfactionScore != null) return { score: found.satisfactionScore, duplicate: true };
      found.satisfactionScore = score;
      return { score, duplicate: false };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('submit_support_satisfaction', {
      p_case_id: caseId, p_score: score, p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as { score: number; duplicate: boolean };
  },

  /**
   * Upload, then register. The registration RPC re-reads the object from
   * storage and refuses a mismatch, so the client's claim about its own upload
   * is never what authorizes it.
   */
  async attach(
    accountKey: string,
    input: {
      userId: string; caseId: string; fileId: string; fileName: string;
      mimeType: string; byteSize: number; contentHash: string; clientId: string;
      body: Blob | ArrayBuffer;
    },
  ): Promise<{ id: string; storagePath: string }> {
    const extension = supportAttachmentExtension(input.mimeType);
    if (!extension) throw new Error('This file type is not supported');
    if (input.byteSize < 1 || input.byteSize > supportAttachmentMaxBytes) {
      throw new Error('This file is too large');
    }
    const storagePath = supportAttachmentPath(input.userId, input.caseId, input.fileId, extension);

    if (environment.dataMode === 'mock') {
      const found = mockAccount(accountKey).cases.find(c => c.caseId === input.caseId);
      if (!found) throw new Error('Support case not found');
      if (found.status === 'closed') throw new Error('This support case is closed');
      if (found.attachments.length >= supportAttachmentMaxPerCase) {
        throw new Error('Support attachment limit reached');
      }
      const existing = found.attachments.find(a => a.id === input.clientId);
      if (existing) return { id: existing.id, storagePath: existing.storagePath };
      if (found.attachments.some(a => a.fileName === input.fileName && a.byteSize === input.byteSize)) {
        throw new Error('This file is already attached to the case');
      }
      found.attachments.push({
        id: input.clientId, storagePath, fileName: input.fileName,
        mimeType: input.mimeType, byteSize: input.byteSize, createdAt: new Date().toISOString(),
      });
      return { id: input.clientId, storagePath };
    }

    const client = getSupabaseClient();
    const { error: uploadError } = await client.storage
      .from(supportAttachmentBucket)
      .upload(storagePath, input.body, { contentType: input.mimeType, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await client.rpc('register_support_attachment', {
      p_case_id: input.caseId,
      p_storage_path: storagePath,
      p_file_name: input.fileName,
      p_content_hash: input.contentHash,
      p_client_id: input.clientId,
    });
    if (error) {
      // Registration failed, so the object is an orphan. The delete policy
      // permits removing an UNREGISTERED object, and only that.
      await client.storage.from(supportAttachmentBucket).remove([storagePath]);
      throw error;
    }
    return { id: data as string, storagePath };
  },

  /**
   * A signed URL is minted by Storage, authorized by the read policy, which
   * grants only a registered object on a case the caller can see.
   */
  async attachmentUrl(accountKey: string, storagePath: string): Promise<string | null> {
    if (environment.dataMode === 'mock') return null;
    const client = getSupabaseClient();
    const { data, error } = await client.storage
      .from(supportAttachmentBucket)
      .createSignedUrl(storagePath, 300);
    if (error) throw error;
    return data?.signedUrl ?? null;
  },

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------
  async getStaffQueue(status?: string): Promise<StaffSupportQueue> {
    if (environment.dataMode === 'mock') {
      return {
        generatedAt: new Date().toISOString(),
        counts: { open: 0, inProgress: 0, waitingParticipant: 0, escalated: 0, mine: 0, breachedFirstResponse: 0 },
        cases: [],
      };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_staff_support_queue', {
      p_status: status ?? null, p_limit: 50,
    });
    if (error) throw error;
    return data as StaffSupportQueue;
  },

  async getStaffToolkit(locale: SupportLocale): Promise<StaffSupportToolkit> {
    if (environment.dataMode === 'mock') {
      return {
        macros: mockSupportMacros.filter(m => m.locale === locale),
        resolutionReasons: mockResolutionReasons[locale],
        slaPolicy: mockSlaPolicy,
      };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_staff_support_toolkit', { p_locale: locale });
    if (error) throw error;
    return data as StaffSupportToolkit;
  },

};

export { resetMockSupportState } from './mock-support-state';
