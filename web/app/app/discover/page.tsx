'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { customerNav } from '@/lib/nav';
import { appCopy } from '@/lib/app-copy';
import {
  parseCategories,
  parseDiscoveryHome,
  parseProviderSearch,
  type DiscoveryHome,
  type ProviderCard,
  type ServiceCategory,
} from '@/lib/customer';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { matchServiceCategories } from '@/src/services/service-search-aliases';
import { serviceCategoryDescription, serviceCategoryLabel } from '@/src/i18n/service-labels';

import type { Route } from 'next';
import styles from '@/components/product-surface.module.css';

/**
 * Finding somebody.
 *
 * Two RPCs, both the app's: `get_marketplace_catalog_v2` for the categories a
 * job can belong to, and `get_discovery_home` for the four groupings the
 * server itself computes — who is available, who has a proven record, who this
 * account saved, and who they were looking at.
 *
 * **The ordering is the server's and is not re-sorted here.** "Available
 * nearby" is ordered by rating, "trusted" by completed jobs; those are product
 * decisions expressed in SQL, and a client that re-sorts them is quietly
 * running a different marketplace.
 *
 * **A provider card carries no location.** `discovery_provider_card` returns an
 * area *label* and never a latitude or longitude — the comment in the migration
 * says the coordinates "never leave the database in any WPS-020 path". So there
 * is no map here, and adding one would need the server to start sending
 * something it deliberately withholds.
 *
 * Search filters the categories that were already fetched rather than calling a
 * search RPC on every keystroke: the catalog is small, complete and already in
 * hand, and `get_search_suggestions` is a different surface with its own
 * rate limit.
 */
export default function DiscoverPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const [categories, setCategories] = useState<ServiceCategory[] | null>(null);
  const [home, setHome] = useState<DiscoveryHome | null>(null);
  const [query, setQuery] = useState('');
  const [failed, setFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchResult, setSearchResult] = useState<ProviderCard[] | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const client = supabase();
    const [catalog, discovery] = await Promise.all([
      client.rpc('get_marketplace_catalog_v2'),
      client.rpc('get_discovery_home', { p_governorate: null }),
    ]);
    if (catalog.error && discovery.error) { setFailed(true); return; }
    if (!catalog.error) setCategories(parseCategories(catalog.data));
    if (!discovery.error) setHome(parseDiscoveryHome(discovery.data));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length === 0 || searching) return;
    setSearching(true);
    setSearchFailed(false);
    const { data, error } = await supabase().rpc('search_providers', {
      p_query: query.trim(),
      p_filters: {},
      p_sort: 'recommended',
      p_limit: 20,
      p_offset: 0,
    });
    if (error) {
      setSearchFailed(true);
      setSearchResult(null);
    } else {
      setSearchResult(parseProviderSearch(data).providers);
    }
    setSearching(false);
  };

  const shown = useMemo(() => {
    if (!categories) return null;
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    // The label is localized and the id is English, so matching only those two
    // meant a category was reachable in one language and invisible in the
    // others: `قفل` and `serrurier` both found nothing in an English session,
    // and nobody types "locksmithing".
    //
    // The alias matcher searches every language's vocabulary at once, so a
    // category is reachable from any of the three regardless of the interface.
    const byAlias = new Set<string>(matchServiceCategories(query));
    return categories.filter((category) => {
      const label = serviceCategoryLabel(category.translationKey, locale, category.id);
      return label.toLowerCase().includes(needle)
        || category.id.includes(needle)
        || byAlias.has(category.id);
    });
  }, [categories, query, words]);

  return (
    <AppShell nav={customerNav(words)} mode={words.modeCustomer}>
      <div className={styles.head}>
        <h1 className={styles.title}>{words.discoverTitle}</h1>
      </div>
      <p className={styles.lead}>{words.discoverLead}</p>

      {failed ? (
        <div className={styles.panel}>
          <p className={styles.error} role="alert">{words.loadFailed}</p>
          <button type="button" className={styles.secondary} onClick={() => void load()}>
            {words.retry}
          </button>
        </div>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{words.discoverCategories}</h2>

        <form className={styles.searchRow} onSubmit={search}>
          <div className={styles.field}>
          <label className={styles.label} htmlFor="category-search">{words.discoverSearch}</label>
          <input
            id="category-search"
            className={styles.input}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={words.discoverSearchHint}
          />
          </div>
          <button type="submit" className={styles.action} disabled={!query.trim() || searching}>
            {searching ? words.loading : words.discoverSearchAction}
          </button>
        </form>

        {searchFailed ? (
          <p className={styles.error} role="alert">{words.loadFailed}</p>
        ) : searchResult ? (
          <ProviderCards
            providers={searchResult}
            empty={words.discoverNoWorkersMatch}
            words={words}
          />
        ) : null}

        {shown === null ? (
          <p className={styles.muted}>{words.loading}</p>
        ) : shown.length === 0 ? (
          <p className={styles.muted}>{words.discoverNoCategories}</p>
        ) : (
          <div className={styles.grid}>
            {shown.map((category) => (
              <a
                key={category.id}
                className={styles.card}
                href={`/requests/new?category=${encodeURIComponent(category.id)}`}
              >
                <span className={styles.cardName}>
                  {serviceCategoryLabel(category.translationKey, locale, category.id)}
                </span>
                {category.descriptionKey ? (
                  <span className={styles.cardMeta}>
                    {serviceCategoryDescription(category.descriptionKey, locale) ?? ''}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        )}
      </section>

      {home ? (
        <>
          <ProviderGroup
            title={words.discoverAvailable}
            empty={words.discoverNoneAvailable}
            providers={home.availableNearby}
            words={words}
          />
          <ProviderGroup
            title={words.discoverTrusted}
            empty={words.discoverNoneTrusted}
            providers={home.trustedWorkers}
            words={words}
          />
          {/* Only shown to a signed-in account, because the server only fills
              them for one — `personalized` says which. */}
          {home.personalized ? (
            <>
              <ProviderGroup
                title={words.discoverSaved}
                empty={words.discoverNoneSaved}
                providers={home.favourites}
                words={words}
              />
              <ProviderGroup
                title={words.discoverRecent}
                empty={words.discoverNoneRecent}
                providers={home.recentlyViewed}
                words={words}
              />
            </>
          ) : null}
        </>
      ) : null}

      <p className={styles.note}>{words.discoverNoMapNote}</p>
    </AppShell>
  );
}

function ProviderGroup({
  title,
  empty,
  providers,
  words,
}: {
  title: string;
  empty: string;
  providers: ProviderCard[];
  words: Record<string, string>;
}) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {providers.length === 0 ? (
        <p className={styles.muted}>{empty}</p>
      ) : (
        <ProviderCards providers={providers} empty={empty} words={words} />
      )}
    </section>
  );
}

function ProviderCards({
  providers,
  empty,
  words,
}: {
  providers: ProviderCard[];
  empty: string;
  words: Record<string, string>;
}) {
  if (providers.length === 0) return <p className={styles.muted}>{empty}</p>;
  return (
    <div className={styles.grid}>
      {providers.map((provider) => (
        <div key={provider.id} className={styles.card}>
              <span className={styles.cardName}>{provider.displayName}</span>
              <span className={styles.cardMeta}>
                {provider.ratingAverage !== null
                  ? `${provider.ratingAverage} · ${provider.reviewCount} ${words.discoverReviews}`
                  : words.discoverNoRating}
              </span>
              <span className={styles.cardMeta}>
                {provider.completedJobs} {words.discoverJobsDone}
                {provider.responseTimeLabel ? ` · ${provider.responseTimeLabel}` : ''}
              </span>
              {/* Declared, verifiable facts only. Each of these is a column the
                  server set after a check, not an impression. */}
              <ul className={styles.chips}>
                {provider.identityVerified ? (
                  <li className={styles.chip}>{words.discoverIdentityVerified}</li>
                ) : null}
                {provider.skillCertificateVerified ? (
                  <li className={styles.chip}>{words.discoverSkillVerified}</li>
                ) : null}
                {provider.professionalCertificateVerified ? (
                  <li className={styles.chip}>{words.discoverCertificateVerified}</li>
                ) : null}
                {provider.emergencyAvailable ? (
                  <li className={styles.chip}>{words.discoverEmergency}</li>
                ) : null}
                {provider.isAvailable ? (
                  <li className={`${styles.chip} ${styles.chipStrong}`}>{words.discoverAvailableNow}</li>
                ) : null}
              </ul>
          {provider.primaryCategoryId ? (
            <a
              className={styles.secondary}
              href={`/requests/new?provider=${encodeURIComponent(provider.id)}&category=${encodeURIComponent(provider.primaryCategoryId)}` as Route}
            >
              {words.discoverAskWorker}
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}
