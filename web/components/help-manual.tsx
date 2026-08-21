'use client';

import { useMemo, useState } from 'react';

import type { Locale } from '@/lib/preferences';

import styles from './help-manual.module.css';

export type HelpArticle = {
  id: string; audience: 'customer' | 'worker' | 'admin' | 'all'; locale: Locale;
  title: string; summary: string; version: number; lastReviewedDate: string;
  features: string[]; routes: string[]; capabilities: string[]; keywords: string[]; body: string;
};

const ui = {
  en: { title: 'How to use Warsha', intro: 'Practical guides based on the current product.', search: 'Search Help', placeholder: 'Try “reset password”, “address”, or “quote”', none: 'No topics match that search.', customer: 'Customer guide', worker: 'Worker guide', admin: 'Operator manual', all: 'Glossary', back: 'Back to all topics', reviewed: 'Reviewed', capability: 'Required capability' },
  ar: { title: 'استخدام ورشة', intro: 'دليل عملي مبني على طريقة عمل المنتج الحالية.', search: 'دور في المساعدة', placeholder: 'جرّب «كلمة السر» أو «العنوان» أو «عرض السعر»', none: 'مالقيناش موضوع مطابق للبحث.', customer: 'دليل العميل', worker: 'دليل الفني', admin: 'دليل موظف الإدارة', all: 'القاموس', back: 'الرجوع لكل المواضيع', reviewed: 'آخر مراجعة', capability: 'الصلاحية المطلوبة' },
  fr: { title: 'Comment utiliser Warsha', intro: 'Des guides pratiques basés sur le produit actuel.', search: 'Rechercher dans l’aide', placeholder: 'Essayez « mot de passe », « adresse » ou « devis »', none: 'Aucun sujet ne correspond à cette recherche.', customer: 'Guide client', worker: 'Guide professionnel', admin: 'Manuel opérateur', all: 'Glossaire', back: 'Retour à tous les sujets', reviewed: 'Révisé', capability: 'Capacité requise' },
} as const;

const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function HelpManual({ locale, articles, heading }: { locale: Locale; articles: HelpArticle[]; heading?: string }) {
  const words = ui[locale];
  const localized = useMemo(() => articles.filter(article => article.locale === locale), [articles, locale]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = localized.find(article => article.id === selectedId);
  const matches = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return localized;
    return localized.map(article => {
      const corpus = normalize([article.title, article.summary, ...article.keywords, article.body].join(' '));
      return { article, score: terms.reduce((score, term) => score + (corpus.includes(term) ? 1 : 0), 0) };
    }).filter(value => value.score > 0).sort((a, b) => b.score - a.score).map(value => value.article);
  }, [localized, query]);

  if (selected) return <article className={styles.reader}>
    <button type="button" className={styles.back} onClick={() => setSelectedId(null)}>← {words.back}</button>
    <h2>{selected.title}</h2><p className={styles.lead}>{selected.summary}</p>
    {selected.capabilities.length ? <p className={styles.meta}><strong>{words.capability}:</strong> {selected.capabilities.join(', ')}</p> : null}
    <HelpBody body={selected.body} />
    <p className={styles.meta}>{words.reviewed}: {selected.lastReviewedDate} · v{selected.version}</p>
  </article>;

  const groups = (['customer', 'worker', 'admin', 'all'] as const).map(audience => ({ audience, articles: matches.filter(article => article.audience === audience) })).filter(group => group.articles.length);
  return <section className={styles.help}>
    <div><h1>{heading ?? words.title}</h1><p className={styles.lead}>{words.intro}</p></div>
    <label className={styles.search}><span>{words.search}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={words.placeholder}/></label>
    {!matches.length ? <p role="status" className={styles.empty}>{words.none}</p> : groups.map(group => <section key={group.audience} className={styles.group}>
      <h2>{words[group.audience]}</h2>
      <div className={styles.grid}>{group.articles.map(article => <button type="button" key={article.id} className={styles.card} onClick={() => setSelectedId(article.id)}><strong>{article.title}</strong><span>{article.summary}</span></button>)}</div>
    </section>)}
  </section>;
}

function HelpBody({ body }: { body: string }) {
  return <div className={styles.body}>{body.split('\n').map((line, index) => {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) return <h3 key={index}>{heading[1]}</h3>;
    if (!line.trim()) return <div className={styles.space} key={index}/>;
    const item = line.match(/^(\d+\.|-)\s+(.+)/);
    return item ? <p key={index} className={styles.item}><span>{item[1]}</span>{item[2].replaceAll('**', '')}</p> : <p key={index}>{line.replaceAll('**', '')}</p>;
  })}</div>;
}
