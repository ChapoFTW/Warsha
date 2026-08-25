'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { appCopy } from '@/lib/app-copy';
import { parseServices, type Service } from '@/lib/customer';
import { workerNav } from '@/lib/nav';
import { intlLocale, type Locale } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import {
  egpFromMinor,
  newWorkerKey,
  parseInvitations,
  parseWorkerQuote,
  type QuoteInvitation,
  type WorkerQuote,
} from '@/lib/worker';
import { workerCopy, type WorkerWords } from '@/lib/worker-copy';
import { requestWorkLabel } from '@/src/marketplace-intelligence/request-work-label';
import {
  invitationLifecycleSemantic,
  partitionInvitationLifecycle,
  quoteLifecycleSemantic,
} from '@/src/lifecycle/lifecycle-presentation';

import styles from '@/components/product-surface.module.css';

type QuoteDraft = {
  price: string;
  duration: string;
  eta: string;
  message: string;
  materials: 'included' | 'excluded' | 'partial' | 'unknown';
  materialsExplanation: string;
  labour: boolean;
  cash: boolean;
  online: boolean;
  revisionReason: string;
};

const EMPTY: QuoteDraft = {
  price: '', duration: '60', eta: '', message: '', materials: 'unknown',
  materialsExplanation: '', labour: true, cash: true, online: false, revisionReason: '',
};

/** Worker quote inbox through the marketplace invitation and quote RPCs. */
export default function WorkerOpportunitiesPage() {
  const locale = useAppLocale();
  const appWords = appCopy[locale] as Record<string, string>;
  const words = workerCopy[locale];
  const [invitations, setInvitations] = useState<QuoteInvitation[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const client = supabase();
    const [{ data, error }, { data: catalogData, error: catalogError }] = await Promise.all([
      client.rpc('get_worker_quote_invitations', { p_cursor: null, p_limit: 50 }),
      client.rpc('get_marketplace_catalog_v2'),
    ]);
    if (error || catalogError) setFailed(true);
    else {
      setInvitations(parseInvitations(data));
      setServices(parseServices(catalogData));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selected = invitations?.find((item) => item.id === openId) ?? null;
  const { active: activeInvitations, history: historicalInvitations } = partitionInvitationLifecycle(invitations ?? []);

  return (
    <AppShell nav={workerNav(appWords)} mode={appWords.modeWorker}>
      <div className={styles.head}><h1 className={styles.title}>{words.opportunitiesTitle}</h1></div>
      <p className={styles.lead}>{words.opportunitiesLead}</p>

      {selected ? <OpportunityDetail invitation={selected} services={services} locale={locale} appWords={appWords} words={words}
        onClose={() => setOpenId(null)} onChanged={load} /> : null}

      <section className={styles.panel}>
        {failed ? (
          <><p className={styles.error} role="alert">{appWords.loadFailed}</p>
            <button type="button" className={styles.secondary} onClick={() => void load()}>{appWords.retry}</button></>
        ) : invitations === null ? <p className={styles.muted}>{appWords.loading}</p>
          : invitations.length === 0 ? <p className={styles.muted}>{words.opportunitiesNone}</p>
            : <>
              <InvitationList title={words.opportunitiesActive} invitations={activeInvitations} services={services}
                locale={locale} words={words} onOpen={setOpenId} empty={words.opportunitiesNone} />
              {historicalInvitations.length > 0 ? (
                <InvitationList title={words.opportunitiesHistory} invitations={historicalInvitations} services={services}
                  locale={locale} words={words} onOpen={setOpenId} />
              ) : null}
            </>}
      </section>
    </AppShell>
  );
}

function InvitationList({ title, invitations, services, locale, words, onOpen, empty }: {
  title: string;
  invitations: QuoteInvitation[];
  services: Service[];
  locale: Locale;
  words: WorkerWords;
  onOpen: (id: string) => void;
  empty?: string;
}) {
  return <section aria-label={title}>
    <h2 className={styles.sectionTitle}>{title}</h2>
    {invitations.length === 0 ? <p className={styles.muted}>{empty}</p> : (
      <ul className={styles.list}>
        {invitations.map((item) => (
          <li key={item.id} className={styles.row}>
            <button type="button" className={styles.rowTitle} onClick={() => onOpen(item.id)}>
              {item.issueDescription.slice(0, 140)}
            </button>
            <div className={styles.rowMeta}>
              <LifecycleBadge label={words[`invitationStatus_${item.status}` as keyof typeof words] ?? item.status}
                semantic={invitationLifecycleSemantic(item.status)} />
              <span className={`${styles.badge} ${styles.workLabel}`}>{requestWorkLabel(item, services, locale)}</span>
              <span className={styles.cardMeta}>{[item.area.governorate, item.area.district].filter(Boolean).join(' · ')}</span>
              <time className={styles.when}>{formatMoment(item.expiresAt, locale)}</time>
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>;
}

function OpportunityDetail({
  invitation, services, locale, appWords, words, onClose, onChanged,
}: {
  invitation: QuoteInvitation;
  services: Service[];
  locale: Locale;
  appWords: Record<string, string>;
  words: WorkerWords;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [quote, setQuote] = useState<WorkerQuote | null>(null);
  const [draft, setDraft] = useState<QuoteDraft>(() => ({
    ...EMPTY,
    cash: invitation.paymentCompatibility !== 'online',
    online: invitation.paymentCompatibility === 'online',
  }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const workLabel = requestWorkLabel(invitation, services, locale);

  const loadQuote = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const client = supabase();
    if (invitation.status === 'invited') {
      await client.rpc('view_quote_invitation', { p_invitation_id: invitation.id });
    }
    if (invitation.quoteId) {
      const { data, error } = await client.rpc('get_worker_quote', { p_quote_id: invitation.quoteId });
      const parsed = parseWorkerQuote(data);
      if (error || !parsed) setFailed(true);
      else {
        setQuote(parsed);
        setDraft({
          price: minorToInput(parsed.priceMinor),
          duration: String(parsed.estimatedDurationMinutes),
          eta: parsed.etaMinutes === null ? '' : String(parsed.etaMinutes),
          message: parsed.message,
          materials: parsed.materialsInclusion as QuoteDraft['materials'],
          materialsExplanation: parsed.materialsExplanation,
          labour: parsed.laborIncluded,
          cash: parsed.supportedPaymentMethods.includes('cash'),
          online: parsed.supportedPaymentMethods.includes('online'),
          revisionReason: '',
        });
      }
    }
    setLoading(false);
  }, [invitation.id, invitation.quoteId, invitation.status]);
  useEffect(() => { void loadQuote(); }, [loadQuote]);

  const terms = useMemo(() => {
    const priceMinor = majorToMinor(draft.price);
    const duration = Number(draft.duration);
    const eta = draft.eta === '' ? null : Number(draft.eta);
    const methods = [draft.cash ? 'cash' : null, draft.online ? 'online' : null].filter(Boolean);
    return {
      valid: priceMinor !== null && duration >= 15 && duration <= 1440
        && (eta === null || (eta >= 0 && eta <= 1440)) && methods.length > 0,
      payload: {
        priceMinor,
        proposedStartAt: null,
        etaMinutes: eta,
        estimatedDurationMinutes: duration,
        message: draft.message.trim(),
        laborIncluded: draft.labour,
        materialsInclusion: draft.materials,
        materialsExplanation: draft.materialsExplanation.trim(),
        warrantyDays: null,
        supportedPaymentMethods: methods,
        revisionReason: draft.revisionReason.trim(),
      },
    };
  }, [draft]);

  const mutate = async (operation: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setDone(false);
    const result = await operation();
    if (result.error) setFailed(true);
    else {
      setDone(true);
      await onChanged();
      await loadQuote();
    }
    setBusy(false);
  };

  const actionable = ['invited', 'viewed'].includes(invitation.status)
    && Date.now() < Date.parse(invitation.expiresAt);

  return (
    <section className={styles.panel} aria-label={workLabel}>
      <div className={styles.head}>
        <h2 className={styles.sectionTitle}>{words.opportunityDetail}</h2>
        <button type="button" className={styles.secondary} onClick={onClose}>{appWords.close}</button>
      </div>
      <p className={styles.factValue}>{invitation.issueDescription}</p>
      <div className={styles.facts}>
        <Fact label={appWords.service} value={workLabel} />
        <Fact label={words.opportunityArea} value={[invitation.area.governorate, invitation.area.district].filter(Boolean).join(' · ')} />
        <Fact label={words.opportunityExpires} value={formatMoment(invitation.expiresAt, locale)} />
        <Fact label={words.opportunityPayment} value={invitation.paymentCompatibility === 'either'
          ? words.opportunityPaymentEither
          : appWords[`payment_${invitation.paymentCompatibility}`] ?? invitation.paymentCompatibility} />
      </div>

      {loading ? <p className={styles.muted}>{appWords.loading}</p> : null}
      {quote ? (
        <div className={styles.subpanel}>
          <div className={styles.quoteHead}>
            <LifecycleBadge label={words[`quoteStatus_${quote.status}` as keyof typeof words] ?? quote.status}
              semantic={quoteLifecycleSemantic(quote.status)} />
            <span className={styles.price}>{egpFromMinor(quote.priceMinor, locale)}</span>
          </div>
          {quote.revisions.length > 0 ? (
            <details><summary>{words.opportunityQuoteHistory}</summary>
              <ol className={styles.timeline}>{quote.revisions.map((revision) => (
                <li key={revision.revision}>#{revision.revision} · {formatMoment(revision.createdAt, locale)}</li>
              ))}</ol>
            </details>
          ) : null}
        </div>
      ) : null}

      {invitation.flowKind === 'emergency' && actionable ? (
        <button type="button" className={styles.action} disabled={busy}
          onClick={() => void mutate(() => supabase().rpc('accept_emergency_request', {
            p_invitation_id: invitation.id, p_idempotency_key: newWorkerKey('web-emergency'),
          }))}>{words.opportunityEmergencyAccept}</button>
      ) : null}

      {invitation.flowKind !== 'emergency' && (!quote ? actionable : ['submitted', 'revised'].includes(quote.status)) ? (
        <QuoteForm draft={draft} setDraft={setDraft} words={words} disabled={busy}
          action={quote ? words.opportunityRevise : words.opportunityQuote}
          requiresRevisionReason={Boolean(quote)}
          actionDisabled={!terms.valid || (Boolean(quote) && draft.revisionReason.trim().length < 3)}
          onSubmit={() => void mutate(() => quote
            ? supabase().rpc('revise_worker_quote', {
              p_quote_id: quote.id, p_quote: terms.payload, p_idempotency_key: newWorkerKey('web-quote-revise'),
            })
            : supabase().rpc('submit_worker_quote', {
              p_invitation_id: invitation.id, p_quote: terms.payload, p_idempotency_key: newWorkerKey('web-quote'),
            }))} />
      ) : null}

      {quote?.status === 'selected' ? (
        <button type="button" className={styles.action} disabled={busy}
          onClick={() => void mutate(() => supabase().rpc('confirm_selected_quote', {
            p_request_id: invitation.requestId,
            p_quote_id: quote.id,
            p_idempotency_key: newWorkerKey('web-quote-confirm'),
          }))}>{words.opportunityConfirm}</button>
      ) : null}

      {quote && ['submitted', 'revised'].includes(quote.status) ? (
        <button type="button" className={styles.danger} disabled={busy || draft.revisionReason.trim().length < 3}
          onClick={() => void mutate(() => supabase().rpc('withdraw_worker_quote', {
            p_quote_id: quote.id,
            p_reason: draft.revisionReason.trim(),
            p_idempotency_key: newWorkerKey('web-quote-withdraw'),
          }))}>{words.opportunityWithdraw}</button>
      ) : null}

      {!quote && invitation.flowKind !== 'emergency' && actionable ? (
        <div className={styles.subpanel}>
          <label className={styles.field}><span className={styles.label}>{words.opportunityReason}</span>
            <input className={styles.input} value={draft.revisionReason} maxLength={120}
              onChange={(event) => setDraft({ ...draft, revisionReason: event.target.value })} disabled={busy} /></label>
          <button type="button" className={styles.danger} disabled={busy || draft.revisionReason.trim().length < 3}
            onClick={() => void mutate(() => supabase().rpc('decline_quote_invitation', {
              p_invitation_id: invitation.id,
              p_reason: draft.revisionReason.trim(),
              p_idempotency_key: newWorkerKey('web-invitation-decline'),
            }))}>{words.opportunityDecline}</button>
        </div>
      ) : null}

      {failed ? <p className={styles.error} role="alert">{words.opportunityActionFailed}</p> : null}
      {done ? <p className={styles.ok} role="status">{words.opportunityActionDone}</p> : null}
    </section>
  );
}

function QuoteForm({ draft, setDraft, words, disabled, action, actionDisabled, requiresRevisionReason, onSubmit }: {
  draft: QuoteDraft;
  setDraft: (value: QuoteDraft) => void;
  words: WorkerWords;
  disabled: boolean;
  action: string;
  actionDisabled: boolean;
  requiresRevisionReason: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className={styles.subpanel}>
      <div className={styles.formGrid}>
        <Field label={words.opportunityPrice}><input className={styles.input} inputMode="decimal" value={draft.price}
          onChange={(event) => setDraft({ ...draft, price: event.target.value })} disabled={disabled} /></Field>
        <Field label={words.opportunityDuration}><input className={styles.input} type="number" min={15} max={1440} value={draft.duration}
          onChange={(event) => setDraft({ ...draft, duration: event.target.value })} disabled={disabled} /></Field>
        <Field label={words.opportunityEta}><input className={styles.input} type="number" min={0} max={1440} value={draft.eta}
          onChange={(event) => setDraft({ ...draft, eta: event.target.value })} disabled={disabled} /></Field>
        <Field label={words.opportunityMaterials}><select className={styles.select} value={draft.materials}
          onChange={(event) => setDraft({ ...draft, materials: event.target.value as QuoteDraft['materials'] })} disabled={disabled}>
          <option value="included">{words.opportunityMaterialsIncluded}</option>
          <option value="excluded">{words.opportunityMaterialsExcluded}</option>
          <option value="partial">{words.opportunityMaterialsPartial}</option>
          <option value="unknown">{words.opportunityMaterialsUnknown}</option>
        </select></Field>
      </div>
      <Field label={words.opportunityMessage}><textarea className={styles.textarea} maxLength={1000} value={draft.message}
        onChange={(event) => setDraft({ ...draft, message: event.target.value })} disabled={disabled} /></Field>
      <Field label={words.opportunityMaterialsExplanation}><textarea className={styles.textarea} maxLength={500} value={draft.materialsExplanation}
        onChange={(event) => setDraft({ ...draft, materialsExplanation: event.target.value })} disabled={disabled} /></Field>
      <div className={styles.actions}>
        <label className={styles.card}><input type="checkbox" checked={draft.labour}
          onChange={(event) => setDraft({ ...draft, labour: event.target.checked })} disabled={disabled} /> {words.opportunityLabour}</label>
        <label className={styles.card}><input type="checkbox" checked={draft.cash}
          onChange={(event) => setDraft({ ...draft, cash: event.target.checked })} disabled={disabled} /> {words.opportunityCash}</label>
        <label className={styles.card}><input type="checkbox" checked={draft.online}
          onChange={(event) => setDraft({ ...draft, online: event.target.checked })} disabled={disabled} /> {words.opportunityOnline}</label>
      </div>
      {requiresRevisionReason ? <Field label={words.opportunityRevisionReason}><input className={styles.input} maxLength={200} value={draft.revisionReason}
        onChange={(event) => setDraft({ ...draft, revisionReason: event.target.value })} disabled={disabled} /></Field> : null}
      <button type="button" className={styles.action} disabled={disabled || actionDisabled} onClick={onSubmit}>{action}</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span className={styles.label}>{label}</span>{children}</label>;
}
function Fact({ label, value }: { label: string; value: string }) {
  return <div className={styles.fact}><span className={styles.factLabel}>{label}</span><span className={styles.factValue}>{value || '—'}</span></div>;
}
function formatMoment(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function minorToInput(value: string): string {
  try { const minor = BigInt(value); return `${minor / 100n}.${String(minor % 100n).padStart(2, '0')}`; } catch { return ''; }
}
function majorToMinor(value: string): string | null {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [major, fraction = ''] = value.trim().split('.');
  return (BigInt(major) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
}
