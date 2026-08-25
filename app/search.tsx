import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiscoveryResultCard } from '@/components/warsha/DiscoveryResultCard';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useDiscovery } from '@/src/discovery/discovery-context';
import { discoveryRepository } from '@/src/discovery/discovery-repository';
import { useDiscoveryText } from '@/src/discovery/discovery-translations';
import type { DiscoveryTextKey } from '@/src/discovery/discovery-copy';
import {
  activeFilterCount,
  activeFilterKeys,
  availableSorts,
  discoveryPageSize,
  emptyDiscoveryFilters,
  normalizeDiscoveryQuery,
  removeFilter,
  type DiscoveryFilters,
  type DiscoveryProviderCard,
  type DiscoverySearchMode,
  type DiscoverySort,
} from '@/src/discovery/discovery-types';
import { useLocalization } from '@/src/i18n/localization';
import type { TranslationKey } from '@/src/i18n/translations';
import { catalogueServiceLabel } from '@/src/services/specific-services';

const filterLabels: Record<keyof DiscoveryFilters, DiscoveryTextKey> = {
  categoryId: 'filterCategory',
  serviceId: 'filterCategory',
  governorate: 'filterArea',
  minimumRating: 'filterRating',
  minimumCompletedJobs: 'filterCompletedJobs',
  maximumDistanceKm: 'filterDistance',
  availableNow: 'filterAvailableNow',
  skillCertificateVerified: 'filterSkillVerified',
  professionalCertificateVerified: 'filterCertificateVerified',
  emergencyAvailable: 'filterEmergency',
  pricingType: 'filterPricing',
  language: 'filterLanguage',
  latitude: 'filterArea',
  longitude: 'filterArea',
};

/**
 * WPS-020 search.
 *
 * Every result, count, filter, and order on this screen was decided by the
 * server. The client holds the query and the filter selection as a *request*
 * and renders what comes back — including which sorts it is allowed to offer.
 * Nothing here filters an already-fetched list, because a client that filters a
 * page is filtering a page and calling it a result set.
 */
export default function SearchScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ q?: string; categoryId?: string; filters?: string }>();
  const dt = useDiscoveryText();
  const { suggestions, filterMetadata, recordSearch, clearSearches } = useDiscovery();

  const [query, setQuery] = useState(params.q ?? '');
  const [submitted, setSubmitted] = useState(params.q ?? '');
  const [filters, setFilters] = useState<DiscoveryFilters>(
    params.categoryId ? { categoryId: params.categoryId } : emptyDiscoveryFilters);
  const [sort, setSort] = useState<DiscoverySort>('recommended');
  const [showFilters, setShowFilters] = useState(params.filters === '1');
  const [results, setResults] = useState<DiscoveryProviderCard[]>([]);
  const [mode, setMode] = useState<DiscoverySearchMode>('browse');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const { isRTL } = useLocalization();
  const generation = useRef(0);
  const offerableSorts = useMemo(() => availableSorts(filters), [filters]);
  const filterCount = activeFilterCount(filters);

  // A sort that stops being offerable (a location that is withdrawn) must not
  // stay selected, or the next request would be refused by the server.
  useEffect(() => {
    if (!offerableSorts.includes(sort)) setSort('recommended');
  }, [offerableSorts, sort]);

  const run = useCallback((offset: number) => {
    generation.current += 1;
    const current = generation.current;
    if (offset === 0) { setLoading(true); setFailed(false); } else { setLoadingMore(true); }
    void discoveryRepository.search(submitted, filters, sort, discoveryPageSize, offset)
      .then(result => {
        if (generation.current !== current) return;
        setResults(previous => offset === 0 ? result.results : [...previous, ...result.results]);
        setMode(result.mode);
        setTotal(result.totalCount);
        setHasMore(result.hasMore);
      })
      .catch(() => { if (generation.current === current) setFailed(true); })
      .finally(() => {
        if (generation.current !== current) return;
        setLoading(false);
        setLoadingMore(false);
      });
  }, [filters, sort, submitted]);

  useEffect(() => { run(0); }, [run, attempt]);

  const submit = (value: string) => {
    const next = normalizeDiscoveryQuery(value);
    setQuery(next);
    setSubmitted(next);
    if (next) recordSearch(next);
    // The query lives in the URL as well as in state, so a web deep link and the
    // browser back button both work.
    router.setParams({ q: next || undefined });
  };

  const showLanding = !submitted && filterCount === 0 && !loading && results.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={results}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <DiscoveryResultCard provider={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title={submitted ? dt.text('searchTitle') : dt.text('searchBrowseTitle')}
              subtitle={loading ? dt.text('searchLoading')
                : `${total} ${total === 1 ? dt.text('searchOneResult') : dt.text('searchResults')}`} />

            <View style={[styles.search, isRTL && styles.reverse]}>
              <MaterialIcons name="search" size={22} color={colors.textPrimary} />
              <TextInput
                accessibilityLabel={dt.text('searchTitle')}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={event => submit(event.nativeEvent.text)}
                returnKeyType="search"
                placeholder={dt.text('searchPlaceholder')}
                placeholderTextColor={colors.inputPlaceholder}
                selectionColor={colors.inputFocus}
                style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} />
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel={dt.text('searchClear')}
                  onPress={() => submit('')} style={styles.iconButton}>
                  <MaterialIcons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button"
                accessibilityState={{ expanded: showFilters }}
                accessibilityLabel={showFilters ? dt.text('closeFilters') : dt.text('openFilters')}
                onPress={() => setShowFilters(value => !value)} style={styles.iconButton}>
                <MaterialIcons name="tune" size={21} color={colors.textPrimary} />
              </Pressable>
            </View>

            {filterCount > 0 ? (
              <View style={[styles.chips, isRTL && styles.reverse]}>
                <AppText style={styles.chipLabel}>{filterCount} {dt.text('activeFilters')}</AppText>
                {activeFilterKeys(filters).map(key => (
                  <Pressable key={key} accessibilityRole="button"
                    accessibilityLabel={`${dt.text('removeFilter')}: ${dt.text(filterLabels[key])}`}
                    onPress={() => setFilters(current => removeFilter(current, key))}
                    style={[styles.chip, isRTL && styles.reverse]}>
                    <AppText style={styles.chipText}>{dt.text(filterLabels[key])}</AppText>
                    <MaterialIcons name="close" size={13} color={colors.textSecondary} />
                  </Pressable>
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel={dt.text('resetFilters')}
                  onPress={() => setFilters(emptyDiscoveryFilters)}>
                  <AppText style={styles.reset}>{dt.text('resetFilters')}</AppText>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.sortRow}>
              <AppText style={styles.sectionLabel}>{dt.text('sortBy')}</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {offerableSorts.map(option => (
                  <Pressable key={option} accessibilityRole="radio"
                    accessibilityState={{ selected: sort === option, checked: sort === option }}
                    accessibilityLabel={dt.sort(option)}
                    accessibilityHint={option === 'recommended' ? dt.text('sortRecommendedHint')
                      : option === 'rating' ? dt.text('sortRatingHint') : undefined}
                    onPress={() => setSort(option)}
                    style={[styles.chip, sort === option && styles.chipSelected]}>
                    <AppText style={[styles.chipText, sort === option && styles.chipTextSelected]}>
                      {dt.sort(option)}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {showFilters && filterMetadata ? (
              <SearchFilters metadata={filterMetadata} filters={filters} onChange={setFilters} />
            ) : null}

            {mode === 'approximate' ? (
              <View style={[styles.notice, isRTL && styles.reverse]} accessibilityLiveRegion="polite">
                <MaterialIcons name="info-outline" size={16} color={colors.informationText} />
                <AppText style={styles.noticeText}>{dt.text('searchApproximate')}</AppText>
              </View>
            ) : null}

            {failed ? (
              <View style={[styles.notice, isRTL && styles.reverse]} accessibilityLiveRegion="polite">
                <MaterialIcons name="cloud-off" size={16} color={colors.errorText} />
                <View style={styles.grow}>
                  <AppText style={styles.noticeText}>{dt.text('searchFailed')}</AppText>
                  <AppText style={styles.noticeHint}>{dt.text('searchOffline')}</AppText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={dt.text('searchRetry')}
                  onPress={() => setAttempt(value => value + 1)} style={styles.retry}>
                  <AppText style={styles.retryText}>{dt.text('searchRetry')}</AppText>
                </Pressable>
              </View>
            ) : null}

            {showLanding ? <SearchLanding
              onPick={submit}
              onPickService={(serviceId) => {
                setQuery('');
                setSubmitted('');
                setFilters(current => ({ ...current, serviceId }));
                router.setParams({ q: undefined });
              }}
              onClear={clearSearches}
              suggestions={suggestions} /> : null}
          </View>
        }
        ListEmptyComponent={loading ? (
          <View style={styles.state}><ActivityIndicator color={colors.loadingMark} />
            <AppText style={styles.stateBody}>{dt.text('searchLoading')}</AppText></View>
        ) : mode === 'empty' ? (
          <View style={styles.state}>
            <MaterialIcons name="person-search" size={38} color={colors.textMuted} />
            <AppText style={styles.stateTitle}>{dt.text('searchEmptyTitle')}</AppText>
            <AppText style={styles.stateBody}>{dt.text('searchEmptyBody')}</AppText>
          </View>
        ) : null}
        ListFooterComponent={
          results.length && hasMore ? (
            <Pressable accessibilityRole="button" accessibilityLabel={dt.text('loadMore')}
              disabled={loadingMore} onPress={() => run(results.length)} style={styles.more}>
              {loadingMore ? <ActivityIndicator color={colors.actionPrimaryText} />
                : <AppText style={styles.moreText}>{dt.text('loadMore')}</AppText>}
            </Pressable>
          ) : results.length ? (
            <AppText style={styles.end}>{dt.text('endOfResults')}</AppText>
          ) : null
        } />
    </SafeAreaView>
  );
}

function SearchLanding({ suggestions, onPick, onPickService, onClear }: {
  suggestions: ReturnType<typeof useDiscovery>['suggestions'];
  onPick: (value: string) => void;
  onPickService: (serviceId: string) => void;
  onClear: () => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL, language } = useLocalization();
  const dt = useDiscoveryText();
  return (
    <View style={styles.landing}>
      {suggestions.recentSearches.length ? (
        <View style={styles.block}>
          <View style={[styles.blockHead, isRTL && styles.reverse]}>
            <AppText style={styles.sectionLabel}>{dt.text('recentSearches')}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={dt.text('clearRecentSearches')} onPress={onClear}>
              <AppText style={styles.reset}>{dt.text('clearRecentSearches')}</AppText>
            </Pressable>
          </View>
          <View style={[styles.chips, isRTL && styles.reverse]}>
            {suggestions.recentSearches.map(item => (
              <Pressable key={item} accessibilityRole="button" accessibilityLabel={item} onPress={() => onPick(item)}
                style={[styles.chip, isRTL && styles.reverse]}>
                <MaterialIcons name="history" size={14} color={colors.textMuted} />
                <AppText style={styles.chipText}>{item}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {suggestions.suggestedCategories.length ? (
        <View style={styles.block}>
          <AppText style={styles.sectionLabel}>{dt.text('suggestedCategories')}</AppText>
          <View style={[styles.chips, isRTL && styles.reverse]}>
            {suggestions.suggestedCategories.map(category => (
              <Pressable key={category.id} accessibilityRole="button"
                accessibilityLabel={t(category.translationKey as TranslationKey)}
                onPress={() => router.push({ pathname: '/categories/[id]', params: { id: category.id } })}
                style={[styles.chip, isRTL && styles.reverse]}>
                <MaterialIcons name={category.iconName as never} size={14} color={colors.textSecondary} />
                <AppText style={styles.chipText}>{t(category.translationKey as TranslationKey)}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {suggestions.commonServices.length ? (
        <View style={styles.block}>
          <AppText style={styles.sectionLabel}>{dt.text('commonServices')}</AppText>
          {/* Labelled "common", never "popular": it is ranked by how many workers
              offer the service, which is a fact Warsha actually has. There is no
              traffic data, so there is no popularity claim. */}
          <AppText style={styles.blockHint}>{dt.text('commonServicesHint')}</AppText>
          <View style={[styles.chips, isRTL && styles.reverse]}>
            {suggestions.commonServices.map(service => (
              <Pressable key={service.id} accessibilityRole="button"
                accessibilityLabel={`${catalogueServiceLabel(service, language)}. ${service.providerCount} ${dt.text('providersOffering')}`}
                onPress={() => onPickService(service.id)} style={[styles.chip, isRTL && styles.reverse]}>
                <AppText style={styles.chipText}>{catalogueServiceLabel(service, language)}</AppText>
                <AppText style={styles.chipCount}>{service.providerCount}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SearchFilters({ metadata, filters, onChange }: {
  metadata: NonNullable<ReturnType<typeof useDiscovery>['filterMetadata']>;
  filters: DiscoveryFilters;
  onChange: (next: DiscoveryFilters) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  const dt = useDiscoveryText();
  const toggle = (key: keyof DiscoveryFilters) => onChange({ ...filters, [key]: !filters[key] });
  const pick = <K extends keyof DiscoveryFilters>(key: K, value: DiscoveryFilters[K]) =>
    onChange(filters[key] === value ? removeFilter(filters, key) : { ...filters, [key]: value });

  return (
    <View style={styles.panel}>
      <Row title={dt.text('filterCategory')}>
        {metadata.categories.map(category => (
          <Chip key={category.id} label={t(category.translationKey as TranslationKey)}
            selected={filters.categoryId === category.id} onPress={() => pick('categoryId', category.id)} />
        ))}
      </Row>

      {metadata.governorates.length ? (
        <Row title={dt.text('filterArea')}>
          {metadata.governorates.map(area => (
            <Chip key={area} label={area} selected={filters.governorate === area}
              onPress={() => pick('governorate', area)} />
          ))}
        </Row>
      ) : null}

      <Row title={dt.text('filterRating')}>
        {[4, 4.5].map(value => (
          <Chip key={value} label={`${value}+`} selected={filters.minimumRating === value}
            onPress={() => pick('minimumRating', value)} />
        ))}
      </Row>

      <Row title={dt.text('filterCompletedJobs')}>
        {[5, 20, 50].map(value => (
          <Chip key={value} label={`${value}+`} selected={filters.minimumCompletedJobs === value}
            onPress={() => pick('minimumCompletedJobs', value)} />
        ))}
      </Row>

      {metadata.pricingTypes.length ? (
        <Row title={dt.text('filterPricing')}>
          {metadata.pricingTypes.map(type => (
            <Chip key={type} label={type} selected={filters.pricingType === type}
              onPress={() => pick('pricingType', type)} />
          ))}
        </Row>
      ) : null}

      {metadata.languages.length ? (
        <Row title={dt.text('filterLanguage')}>
          {metadata.languages.map(language => (
            <Chip key={language} label={language} selected={filters.language === language}
              onPress={() => pick('language', language)} />
          ))}
        </Row>
      ) : null}

      <View style={[styles.toggles, isRTL && styles.reverse]}>
        <Chip label={dt.text('filterAvailableNow')} selected={Boolean(filters.availableNow)}
          onPress={() => toggle('availableNow')} />
        <Chip label={dt.text('filterSkillVerified')} selected={Boolean(filters.skillCertificateVerified)}
          onPress={() => toggle('skillCertificateVerified')} />
        <Chip label={dt.text('filterCertificateVerified')} selected={Boolean(filters.professionalCertificateVerified)}
          onPress={() => toggle('professionalCertificateVerified')} />
        {/* Emergency is offered only when the server says a worker actually
            provides it, so the filter can never return a guaranteed empty set. */}
        {metadata.emergencyAvailable ? (
          <Chip label={dt.text('filterEmergency')} selected={Boolean(filters.emergencyAvailable)}
            onPress={() => toggle('emergencyAvailable')} />
        ) : null}
      </View>

      <AppText style={styles.blockHint}>{dt.text('areaHint')}</AppText>
    </View>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return (
    <View style={styles.row}>
      <AppText style={[styles.sectionLabel, isRTL && styles.right]}>{title}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{children}</ScrollView>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label}
      onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <AppText style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</AppText>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, maxWidth: 720, width: '100%', alignSelf: 'center', flexGrow: 1 },
  header: { gap: spacing.lg, marginBottom: spacing.xl },
  reverse: { flexDirection: 'row-reverse' },
  grow: { flex: 1, gap: 2 },
  search: { minHeight: 56, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBackground, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  input: { flex: 1, color: colors.inputText, fontFamily: typography.family, fontSize: 15, paddingVertical: 0, minHeight: 44 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sortRow: { gap: spacing.sm },
  sectionLabel: { fontSize: 13, fontWeight: typography.semibold },
  right: { textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  chipLabel: { fontSize: 12, color: colors.textSecondary },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.pill },
  chipSelected: { backgroundColor: colors.actionPrimaryBackground, borderColor: colors.actionPrimaryBackground },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextSelected: { color: colors.actionPrimaryText, fontWeight: typography.semibold },
  chipCount: { fontSize: 10, color: colors.textMuted },
  reset: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
  panel: { gap: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.lg, backgroundColor: colors.surface },
  row: { gap: spacing.sm },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.informationBackground },
  noticeText: { fontSize: 12, color: colors.textPrimary },
  noticeHint: { fontSize: 11, color: colors.textSecondary },
  retry: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault },
  retryText: { fontSize: 12, fontWeight: typography.semibold },
  landing: { gap: spacing.xl },
  block: { gap: spacing.sm },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockHint: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
  state: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  stateTitle: { fontSize: 18, fontWeight: typography.semibold, textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
  more: { minHeight: 50, marginTop: spacing.lg, borderRadius: radii.md, backgroundColor: colors.actionPrimaryBackground, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 13, color: colors.actionPrimaryText, fontWeight: typography.bold },
  end: { marginTop: spacing.lg, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
