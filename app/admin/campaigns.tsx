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
import { formatMinorAsEgp, type StaffCampaign } from '@/src/growth/growth-types';

/**
 * WPS-021 campaign administration.
 *
 * Campaigns are staff instruments. This screen is the only place they are
 * visible at all, and even here they are read through `get_staff_campaigns`
 * rather than by selecting the table — no client role holds a grant on
 * `growth_campaigns`, including a staff member's.
 *
 * Activation is not a button that works. It consumes a WPS-018 dual-control
 * approval, and the server refuses when the activator authored the campaign, so
 * a single person can never both write and fund a discount.
 */
export default function AdminCampaignsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text, can, mayAct } = useAdmin();
  const gt = useGrowthText();

  const [campaigns, setCampaigns] = useState<StaffCampaign[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCampaigns(await growthRepository.getStaffCampaigns(50));
      setError(null);
    } catch {
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [text]);

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

  return (
    <AdminShell title={gt.text('campaignsTitle')}>
      {error ? (
        <AppText accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <AdminSection title={gt.text('campaignsTitle')}>
        {campaigns.length === 0 ? (
          <AppText style={styles.detail}>{gt.text('campaignsEmpty')}</AppText>
        ) : (
          campaigns.map(campaign => (
            <View key={campaign.id} style={styles.card}>
              <AdminRow
                label={`${campaign.campaignKey} v${campaign.version}`}
                value={gt.campaignStatus(campaign.status)}
              />
              <AdminRow
                label={gt.text('campaignBudget')}
                value={`${formatMinorAsEgp(campaign.budgetConsumedMinor)} / ${formatMinorAsEgp(campaign.budgetMinor)} ${gt.text('currency')}`}
              />
              <AdminRow
                label={gt.text('campaignRedemptions')}
                value={`${campaign.redemptionCount} / ${campaign.globalRedemptionLimit}`}
              />
              {campaign.status === 'draft' ? (
                <AppText style={styles.detail}>{gt.text('campaignNeedsApproval')}</AppText>
              ) : (
                <AppText style={styles.detail}>{gt.text('campaignImmutable')}</AppText>
              )}

              <View style={styles.actions}>
                {campaign.status === 'draft' && can('approve_growth_campaign') ? (
                  <BrandButton
                    label={gt.text('campaignActivate')}
                    disabled={!mayAct || busy || reason.trim().length < 3}
                    onPress={() =>
                      void act(() => growthRepository.activateCampaign(campaign.id, reason.trim()))
                    }
                  />
                ) : null}
                {campaign.status === 'active' && can('manage_growth_campaigns') ? (
                  <BrandButton
                    label={gt.text('campaignPause')}
                    disabled={!mayAct || busy || reason.trim().length < 3}
                    onPress={() =>
                      void act(() =>
                        growthRepository.setCampaignState(campaign.id, 'paused', reason.trim()),
                      )
                    }
                  />
                ) : null}
                {campaign.status === 'paused' && can('manage_growth_campaigns') ? (
                  <BrandButton
                    label={gt.text('campaignResume')}
                    disabled={!mayAct || busy || reason.trim().length < 3}
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
                    label={gt.text('campaignCancel')}
                    disabled={!mayAct || busy || reason.trim().length < 3}
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
        {/* Every campaign action writes a staff audit row naming this reason. */}
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
