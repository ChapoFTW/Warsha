import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandButton, BrandLoadingState, BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { growthRepository } from '@/src/growth/growth-repository';
import { useGrowthText } from '@/src/growth/growth-translations';
import {
  formatMinorAsEgp,
  type StaffCampaign,
  type StaffReferralProgram,
} from '@/src/growth/growth-types';

/**
 * WPS-021 growth administration.
 *
 * Two independent systems, shown separately because they are separate:
 *
 *   - REFERRAL PROGRAMMES. Approving one is the ONLY human decision in the
 *     referral system. After that the server grants rewards automatically, and
 *     there is deliberately no screen anywhere for approving an individual
 *     referral, because no such step exists.
 *   - PROMOTION CAMPAIGNS. Approving one is the only human decision there too;
 *     the server then evaluates each user against the campaign's stated
 *     criteria.
 *
 * Both are read through capability-gated RPCs rather than by selecting a table:
 * no client role holds a grant on `growth_campaigns` or `referral_programs`,
 * including a staff member's.
 */
export default function AdminCampaignsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text, can, mayAct } = useAdmin();
  const gt = useGrowthText();

  const [campaigns, setCampaigns] = useState<StaffCampaign[]>([]);
  const [programs, setPrograms] = useState<StaffReferralProgram[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (can('manage_growth_campaigns')) {
        setCampaigns(await growthRepository.getStaffCampaigns(50));
      }
      if (can('manage_referral_programs')) {
        setPrograms(await growthRepository.getStaffReferralPrograms(50));
      }
      setError(null);
    } catch {
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [can, text]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (run: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await run();
        await load();
      } catch {
        setError(text('errorDenied'));
      } finally {
        setBusy(false);
      }
    },
    [load, text],
  );

  if (loading) return <BrandLoadingState label={text('a11yLoading')} />;

  const blocked = !mayAct || busy || reason.trim().length < 3;

  return (
    <AdminShell title={gt.text('campaignsTitle')}>
      {error ? (
        <AppText accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <AdminSection title={gt.text('programsTitle')}>
        <AppText style={styles.detail}>{gt.text('programsSubtitle')}</AppText>
        {programs.length === 0 ? (
          <AppText style={styles.detail}>{gt.text('programsEmpty')}</AppText>
        ) : (
          programs.map(program => (
            <View key={program.id} style={styles.card}>
              <AdminRow
                label={`${program.programKey} v${program.version}`}
                value={gt.lifecycle(program.status)}
              />
              <AdminRow
                label={gt.text('budgetUsed')}
                value={`${formatMinorAsEgp(program.budgetConsumedMinor)} / ${formatMinorAsEgp(program.budgetMinor)} ${gt.text('currency')}`}
              />
              <AdminRow label={gt.text('rewardsGranted')} value={`${program.rewardCount}`} />
              <AppText style={styles.detail}>
                {program.status === 'draft'
                  ? gt.text('needsApproval')
                  : gt.text('immutableNotice')}
              </AppText>

              <View style={styles.actions}>
                {program.status === 'draft' && can('approve_referral_program') ? (
                  <BrandButton
                    label={gt.text('activate')}
                    disabled={blocked}
                    onPress={() =>
                      void act(() =>
                        growthRepository.activateReferralProgram(program.id, reason.trim()),
                      )
                    }
                  />
                ) : null}
                {program.status === 'active' && can('manage_referral_programs') ? (
                  <BrandButton
                    label={gt.text('pause')}
                    disabled={blocked}
                    onPress={() =>
                      void act(() =>
                        growthRepository.setReferralProgramState(
                          program.id,
                          'paused',
                          reason.trim(),
                        ),
                      )
                    }
                  />
                ) : null}
                {program.status === 'paused' && can('manage_referral_programs') ? (
                  <BrandButton
                    label={gt.text('resume')}
                    disabled={blocked}
                    onPress={() =>
                      void act(() =>
                        growthRepository.setReferralProgramState(
                          program.id,
                          'active',
                          reason.trim(),
                        ),
                      )
                    }
                  />
                ) : null}
                {['active', 'paused', 'scheduled'].includes(program.status) &&
                can('manage_referral_programs') ? (
                  <BrandButton
                    label={gt.text('cancel')}
                    disabled={blocked}
                    onPress={() =>
                      void act(() =>
                        growthRepository.setReferralProgramState(
                          program.id,
                          'cancelled',
                          reason.trim(),
                        ),
                      )
                    }
                  />
                ) : null}
              </View>
            </View>
          ))
        )}
      </AdminSection>

      <AdminSection title={gt.text('campaignsTitle')}>
        {campaigns.length === 0 ? (
          <AppText style={styles.detail}>{gt.text('campaignsEmpty')}</AppText>
        ) : (
          campaigns.map(campaign => (
            <View key={campaign.id} style={styles.card}>
              <AdminRow
                label={`${campaign.campaignKey} v${campaign.version}`}
                value={gt.lifecycle(campaign.status)}
              />
              <AdminRow
                label={gt.text('budgetUsed')}
                value={`${formatMinorAsEgp(campaign.budgetConsumedMinor)} / ${formatMinorAsEgp(campaign.budgetMinor)} ${gt.text('currency')}`}
              />
              <AdminRow
                label={gt.text('redemptions')}
                value={`${campaign.redemptionCount} / ${campaign.globalRedemptionLimit}`}
              />
              <AppText style={styles.detail}>
                {campaign.status === 'draft'
                  ? gt.text('needsApproval')
                  : gt.text('immutableNotice')}
              </AppText>

              <View style={styles.actions}>
                {campaign.status === 'draft' && can('approve_growth_campaign') ? (
                  <BrandButton
                    label={gt.text('activate')}
                    disabled={blocked}
                    onPress={() =>
                      void act(() => growthRepository.activateCampaign(campaign.id, reason.trim()))
                    }
                  />
                ) : null}
                {campaign.status === 'active' && can('manage_growth_campaigns') ? (
                  <BrandButton
                    label={gt.text('pause')}
                    disabled={blocked}
                    onPress={() =>
                      void act(() =>
                        growthRepository.setCampaignState(campaign.id, 'paused', reason.trim()),
                      )
                    }
                  />
                ) : null}
                {campaign.status === 'paused' && can('manage_growth_campaigns') ? (
                  <BrandButton
                    label={gt.text('resume')}
                    disabled={blocked}
                    onPress={() =>
                      void act(() =>
                        growthRepository.setCampaignState(campaign.id, 'active', reason.trim()),
                      )
                    }
                  />
                ) : null}
                {['active', 'paused', 'scheduled'].includes(campaign.status) &&
                can('manage_growth_campaigns') ? (
                  <BrandButton
                    label={gt.text('cancel')}
                    disabled={blocked}
                    onPress={() =>
                      void act(() =>
                        growthRepository.setCampaignState(campaign.id, 'cancelled', reason.trim()),
                      )
                    }
                  />
                ) : null}
              </View>
            </View>
          ))
        )}
      </AdminSection>

      <AdminSection title={text('configChangeReason')}>
        {/* Every action above writes a staff audit row naming this reason. */}
        <BrandTextField
          label={text('configChangeReason')}
          value={reason}
          onChangeText={setReason}
          multiline
        />
      </AdminSection>
    </AdminShell>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  detail: { ...typography.bodySmall, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.errorText },
});
