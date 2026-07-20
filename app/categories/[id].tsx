import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProviderListItem } from '@/components/warsha/ProviderListItem';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useLocalization } from '@/src/i18n/localization';

export default function CategoryScreen(){const{id}=useLocalSearchParams<{id:string}>();const{t,isRTL}=useLocalization();const{getCategory,providers}=useMarketplaceData();const category=getCategory(id);const results=providers.filter((provider)=>provider.categoryId===id);if(!category)return <SafeAreaView style={styles.safe}><ScreenHeader title={t('browseServices')}/><AppText style={styles.empty}>{t('noProviders')}</AppText></SafeAreaView>;return <SafeAreaView style={styles.safe}><FlatList data={results} keyExtractor={(item)=>item.id} renderItem={({item})=><ProviderListItem provider={item}/>} ItemSeparatorComponent={()=><View style={{height:spacing.md}}/>} contentContainerStyle={styles.content} ListHeaderComponent={<View style={styles.header}><ScreenHeader title={t(category.label)} subtitle={`${results.length} ${t('providersFound')}`}/><View style={[styles.hero,isRTL&&styles.reverse]}><View style={styles.categoryIcon}><MaterialIcons name={category.icon} size={30} color={colors.textPrimary}/></View><AppText style={styles.description}>{t(category.description)}</AppText></View></View>} ListEmptyComponent={<AppText style={styles.empty}>{t('noProviders')}</AppText>}/></SafeAreaView>}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,paddingBottom:spacing.xxxl},header:{gap:spacing.lg,marginBottom:spacing.lg},hero:{flexDirection:'row',alignItems:'center',gap:spacing.md,padding:spacing.lg,borderRadius:radii.lg,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},reverse:{flexDirection:'row-reverse'},categoryIcon:{width:54,height:54,borderRadius:radii.md,backgroundColor:colors.surfaceElevated,alignItems:'center',justifyContent:'center'},description:{flex:1,fontSize:13,lineHeight:19,color:colors.textSecondary},empty:{padding:spacing.xxxl,textAlign:'center',color:colors.textMuted,fontWeight:typography.medium}});


