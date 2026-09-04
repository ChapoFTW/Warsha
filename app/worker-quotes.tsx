import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router,useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { EmptyState, StateBadge } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { WorkerOfferCapacityNotice } from '@/components/warsha/WorkerOfferCapacity';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useMarketplaceIntelligence } from '@/src/marketplace-intelligence/marketplace-context';
import { invitationStatusText, requestWorkLabel, useMarketplaceText } from '@/src/marketplace-intelligence/marketplace-translations';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { invitationLifecycleSemantic, lifecycleBadgeTone, partitionInvitationLifecycle } from '@/src/lifecycle/lifecycle-presentation';

export default function WorkerQuotesScreen(){
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const market = useMarketplaceIntelligence();
  const mt = useMarketplaceText();
  const { isRTL, language } = useLocalization();
  const { services: catalogue } = useMarketplaceData();
  /*
   * Focus is the second freshness signal, not the first.
   *
   * Realtime keeps this screen current while it is open. Refetching on focus
   * covers what realtime cannot: a socket that dropped while the phone slept, an
   * event delivered to a channel that had already been torn down, a screen
   * pushed and popped faster than a subscription settles. Both paths call the
   * same loader, so neither can produce a state the other would not.
   */
  useFocusEffect(useCallback(() => {
    void market.reloadInvitations();
    void market.reloadOfferCapacity();
  }, [market]));

  const { active: activeInvitations, history: historicalInvitations } = partitionInvitationLifecycle(market.invitations);
  const renderInvitation = (invitation: (typeof market.invitations)[number]) => (
    <Pressable key={invitation.id} accessibilityRole="button"
      onPress={() => router.push({ pathname: '/worker/requests/[id]', params: { id: invitation.id } })}
      style={styles.card}>
      <View style={styles.icon}>
        <MaterialIcons name={invitation.flowKind === 'emergency' ? 'emergency' : 'request-quote'} size={25} color={colors.background}/>
      </View>
      <View style={styles.grow}>
        <View style={styles.between}>
          <AppText style={styles.title}>{requestWorkLabel(invitation, catalogue, language)}</AppText>
          <StateBadge label={invitationStatusText(language, invitation.status)}
            tone={lifecycleBadgeTone(invitationLifecycleSemantic(invitation.status))} compact />
        </View>
        <AppText numberOfLines={2} style={styles.muted}>{invitation.issueDescription}</AppText>
        <AppText style={styles.muted}>{invitation.area.district}, {invitation.area.governorate}</AppText>
      </View>
    </Pressable>
  );

  return <SafeAreaView style={styles.safe}>
    <ScreenHeader title={mt('workerQuotes')}/>
    <ScrollView refreshControl={<RefreshControl refreshing={market.loading} onRefresh={() => void market.reloadInvitations()} tintColor={colors.white}/>} contentContainerStyle={[styles.content, isRTL && { direction: 'rtl' }]}>
      <WorkerOfferCapacityNotice capacity={market.offerCapacity} />
      {market.loading ? <EmptyState title={mt('workerQuotes')} loading/> : market.invitations.length ? <>
        <AppText style={styles.sectionTitle}>{mt('activeInvitations')}</AppText>
        {activeInvitations.length ? activeInvitations.map(renderInvitation) : <EmptyState title={mt('noInvitations')} icon="inbox"/>}
        {historicalInvitations.length ? <>
          <AppText style={styles.sectionTitle}>{mt('invitationHistory')}</AppText>
          {historicalInvitations.map(renderInvitation)}
        </> : null}
      </> : <EmptyState title={mt('noInvitations')} icon="inbox"/>}
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,paddingBottom:spacing.xxxl,gap:spacing.md,maxWidth:720,width:'100%',alignSelf:'center'},sectionTitle:{fontSize:18,fontWeight:typography.bold,color:colors.textPrimary,marginTop:spacing.sm},card:{flexDirection:'row',gap:spacing.md,padding:spacing.lg,borderWidth:1,borderColor:colors.border,borderRadius:radii.xl,backgroundColor:colors.surface},icon:{width:48,height:48,borderRadius:16,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},grow:{flex:1,gap:5},between:{flexDirection:'row',justifyContent:'space-between',gap:spacing.sm},title:{fontSize:17,fontWeight:typography.bold,textTransform:'capitalize'},muted:{color:colors.textMuted,lineHeight:19},empty:{alignItems:'center',gap:spacing.md,padding:spacing.xxxl}});
