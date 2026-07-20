import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { applyProviderFilters, ProviderFilters } from '@/components/warsha/ProviderFilters';
import { ProviderListItem } from '@/components/warsha/ProviderListItem';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useLocalPreferences } from '@/src/data/local-preferences';
import { defaultProviderFilters, type ProviderFilters as FilterState, type ProviderSort } from '@/src/data/marketplace-types';
import { useLocalization } from '@/src/i18n/localization';
import type { TranslationKey } from '@/src/i18n/translations';

type ProviderPreset = 'recommended' | 'topRated' | 'availableNow' | 'emergency' | 'mostBooked' | 'recentlyViewed';
const presetTitles: Record<ProviderPreset, TranslationKey> = {
  recommended: 'recommendedProviders',
  topRated: 'topRated',
  availableNow: 'availableNowProviders',
  emergency: 'emergencyProviders',
  mostBooked: 'mostBookedProviders',
  recentlyViewed: 'recentlyViewedProviders',
};
function readPreset(value?: string): ProviderPreset | null {
  return value && value in presetTitles ? value as ProviderPreset : null;
}
function initialFilters(preset: ProviderPreset | null): FilterState {
  return preset === 'availableNow' ? { ...defaultProviderFilters, availableNow: true } : defaultProviderFilters;
}
function initialSort(preset: ProviderPreset | null): ProviderSort {
  return preset === 'topRated' ? 'topRated' : 'recommended';
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; filters?: string; preset?: string; categoryId?: string }>();
  const { t, isRTL } = useLocalization();
  const { providers, getCategory } = useMarketplaceData();
  const { recentSearches, addRecentSearch, clearRecentSearches } = useLocalPreferences();
  const initialPreset = readPreset(params.preset);
  const [activePreset, setActivePreset] = useState<ProviderPreset | null>(initialPreset);
  const [query, setQuery] = useState(params.q ?? '');
  const [showFilters, setShowFilters] = useState(params.filters === '1');
  const [filters, setFilters] = useState<FilterState>(() => initialFilters(initialPreset));
  const [sort, setSort] = useState<ProviderSort>(() => initialSort(initialPreset));
  const category = params.categoryId ? getCategory(params.categoryId) : undefined;

  useEffect(() => {
    if (params.q) addRecentSearch(params.q);
  }, [addRecentSearch, params.q]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let matching = providers.filter((provider) => {
      if (params.categoryId && provider.categoryId !== params.categoryId) return false;
      if (activePreset === 'emergency' && !provider.emergencyAvailable && !provider.skills.some((skill) => skill.toLowerCase().includes('emergency'))) return false;
      if (activePreset === 'recentlyViewed') return false;
      return !needle || [provider.name, provider.location, provider.about, ...provider.skills, ...provider.services.map((service) => service.name), t(provider.profession)].join(' ').toLowerCase().includes(needle);
    });
    matching = applyProviderFilters(matching, filters, sort);
    if (activePreset === 'mostBooked') matching.sort((a, b) => b.completedJobs - a.completedJobs);
    return matching;
  }, [activePreset, filters, params.categoryId, providers, query, sort, t]);

  const title = category ? t(category.label) : activePreset ? t(presetTitles[activePreset]) : t('searchProviders');
  const submit = () => addRecentSearch(query);
  const clearPreset = () => {
    if (activePreset === 'availableNow') setFilters(defaultProviderFilters);
    if (activePreset === 'topRated') setSort('recommended');
    setActivePreset(null);
  };
  const clearAll = () => {
    setQuery('');
    setActivePreset(null);
    setFilters(defaultProviderFilters);
    setSort('recommended');
  };

  return <SafeAreaView style={styles.safe}><FlatList
    data={results}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => <ProviderListItem provider={item} />}
    ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
    contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={styles.header}>
      <ScreenHeader title={title} subtitle={`${results.length} ${t('providersFound')}`} />
      {activePreset ? <Pressable accessibilityRole="button" accessibilityLabel={`${t('clear')} ${title}`} onPress={clearPreset} style={[styles.preset, isRTL && styles.reverse]}><AppText style={styles.presetText}>{title}</AppText><MaterialIcons name="close" size={16} color={colors.textPrimary} /></Pressable> : null}
      <View style={[styles.search, isRTL && styles.reverse]}><MaterialIcons name="search" size={23} color={colors.textPrimary} /><TextInput accessibilityLabel={t('searchProviders')} value={query} onChangeText={setQuery} onSubmitEditing={submit} autoFocus={!params.q && !activePreset} returnKeyType="search" placeholder={t('searchHint')} placeholderTextColor={colors.textMuted} style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} />{query ? <Pressable accessibilityRole="button" accessibilityLabel={t('clearSearch')} onPress={() => setQuery('')}><MaterialIcons name="close" size={20} color={colors.textSecondary} /></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={t('openFilters')} onPress={() => setShowFilters((current) => !current)}><MaterialIcons name="tune" size={21} color={colors.textPrimary} /></Pressable></View>
      {!query && !activePreset && recentSearches.length ? <View style={styles.recent}><View style={[styles.recentTitle, isRTL && styles.reverse]}><AppText style={styles.label}>{t('recentSearches')}</AppText><Pressable accessibilityRole="button" accessibilityLabel={t('clearSearch')} onPress={clearRecentSearches}><AppText style={styles.clear}>{t('clear')}</AppText></Pressable></View><View style={[styles.wrap, isRTL && styles.reverse]}>{recentSearches.map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => { setQuery(item); addRecentSearch(item); }} style={styles.recentChip}><MaterialIcons name="history" size={15} color={colors.textMuted} /><AppText style={styles.recentText}>{item}</AppText></Pressable>)}</View></View> : null}
      {showFilters ? <ProviderFilters filters={filters} onChange={setFilters} sort={sort} onSort={setSort} /> : null}
    </View>}
    ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="person-search" size={38} color={colors.textMuted} /><AppText style={styles.emptyTitle}>{query ? `${t('noMatches')}: “${query}”` : t('noProfessionals')}</AppText><AppText style={styles.emptyBody}>{t('searchSuggestion')}</AppText><Pressable accessibilityRole="button" accessibilityLabel={t('clearSearchFilters')} onPress={clearAll} style={styles.clearButton}><AppText style={styles.clearButtonText}>{t('clearSearchFilters')}</AppText></Pressable></View>}
  /></SafeAreaView>;
}

const styles = StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,paddingBottom:spacing.xxxl,maxWidth:720,width:'100%',alignSelf:'center',flexGrow:1},header:{gap:spacing.lg,marginBottom:spacing.xl},preset:{alignSelf:'flex-start',minHeight:36,flexDirection:'row',alignItems:'center',gap:spacing.sm,paddingHorizontal:spacing.md,borderWidth:1,borderColor:colors.borderSoft,borderRadius:radii.pill,backgroundColor:colors.surface},presetText:{fontSize:12,fontWeight:typography.semibold},search:{height:56,borderRadius:radii.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',paddingHorizontal:spacing.lg,gap:spacing.md},reverse:{flexDirection:'row-reverse'},input:{flex:1,color:colors.textPrimary,fontFamily:typography.family,fontSize:15,paddingVertical:0},recent:{gap:spacing.sm},recentTitle:{flexDirection:'row',justifyContent:'space-between'},label:{fontSize:13,fontWeight:typography.semibold},clear:{fontSize:12,color:colors.textSecondary,textDecorationLine:'underline'},wrap:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},recentChip:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:colors.border,borderRadius:radii.pill,paddingHorizontal:12,paddingVertical:8},recentText:{fontSize:12,color:colors.textSecondary},empty:{alignItems:'center',padding:spacing.xxxl,gap:spacing.md},emptyTitle:{fontSize:18,fontWeight:typography.semibold,textAlign:'center'},emptyBody:{fontSize:13,lineHeight:19,color:colors.textMuted,textAlign:'center'},clearButton:{height:44,paddingHorizontal:spacing.lg,borderRadius:radii.md,backgroundColor:colors.white,justifyContent:'center'},clearButtonText:{fontSize:13,color:colors.background,fontWeight:typography.bold}});
