import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { usePrivacy } from '@/src/privacy/privacy-context';
import { usePrivacyText } from '@/src/privacy/privacy-translations';
import {
  effectiveExportStatus,
  hoursUntil,
  manifestRowTotal,
  type ConsentEntry,
  type ExportRequest,
} from '@/src/privacy/privacy-types';

/**
 * The privacy centre.
 *
 * Deliberate choices, each the opposite of the common one:
 *
 *   - deletion is a plain row in the list, not buried three screens down and
 *     not styled to look dangerous before anyone has read what it does;
 *   - deactivation sits ABOVE deletion with its own heading, because most
 *     people who reach for deletion actually want a break;
 *   - the export never claims a file is ready when only a manifest exists;
 *   - a required consent renders as a statement, not as a toggle somebody
 *     could try to turn off and be refused.
 */
export default function PrivacyScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const pt = usePrivacyText();
  const { ready, overview, consents, exports, setConsent, clearHistory, setDeactivated, requestExport } =
    usePrivacy();

  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onClear = useCallback(
    async (scope: 'all' | 'searches' | 'views') => {
      setBusy(true);
      const result = await clearHistory(scope);
      setBusy(false);
      setNotice(result ? pt.text('historyCleared') : pt.text('errorGeneric'));
    },
    [clearHistory, pt],
  );

  const onToggleConsent = useCallback(
    async (entry: ConsentEntry) => {
      setBusy(true);
      const ok = await setConsent(entry.purposeKey, !entry.granted);
      setBusy(false);
      setNotice(ok ? pt.text('consentChanged') : pt.text('consentFailed'));
    },
    [setConsent, pt],
  );

  const onExport = useCallback(async () => {
    setBusy(true);
    const result = await requestExport();
    setBusy(false);
    setNotice(result ? pt.text('exportPreparingNote') : pt.text('errorGeneric'));
  }, [requestExport, pt]);

  const onDeactivate = useCallback(async () => {
    setBusy(true);
    await setDeactivated(!overview.deactivated);
    setBusy(false);
  }, [setDeactivated, overview.deactivated]);

  if (ready && !overview.available) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title={pt.text('privacyTitle')} />
          <View style={styles.state}>
            <MaterialIcons name="lock-outline" size={38} color={colors.textMuted} />
            <AppText style={styles.stateTitle}>{pt.text('unavailableTitle')}</AppText>
            <AppText style={styles.stateBody}>{pt.text('unavailableBody')}</AppText>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title={pt.text('privacyTitle')} subtitle={pt.text('privacySubtitle')} />

        {/* What we store */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('storedTitle')}
          </AppText>
          <AppText style={styles.hint}>{pt.text('storedBody')}</AppText>
          {overview.categories.map(category => (
            <View
              key={category.key}
              style={styles.row}
              accessibilityLabel={`${pt.categoryLabel(category)}. ${
                category.exportable ? pt.text('storedExportable') : pt.text('storedNotExportable')
              }`}>
              <MaterialIcons
                name={category.exportable ? 'file-download' : 'block'}
                size={16}
                color={colors.textMuted}
              />
              <View style={styles.grow}>
                <AppText style={styles.rowTitle}>{pt.categoryLabel(category)}</AppText>
                <AppText style={styles.hint}>
                  {category.exportable ? pt.text('storedExportable') : pt.text('storedNotExportable')}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        {/* Consent */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('consentTitle')}
          </AppText>
          <AppText style={styles.hint}>{pt.text('consentRequiredNote')}</AppText>
          {consents.map(entry => (
            <ConsentRow key={entry.purposeKey} entry={entry} />
          ))}
        </View>

        {/* History */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('historyTitle')}
          </AppText>
          <AppText style={styles.hint}>{pt.text('historyBody')}</AppText>
          <View style={[styles.actions, isRTL && styles.reverse]}>
            <Action label={pt.text('clearSearches')} onPress={() => void onClear('searches')} />
            <Action label={pt.text('clearViews')} onPress={() => void onClear('views')} />
            <Action label={pt.text('clearAll')} onPress={() => void onClear('all')} />
          </View>
        </View>

        {/* Export */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('exportTitle')}
          </AppText>
          <AppText style={styles.hint}>{pt.text('exportBody')}</AppText>
          {overview.exportAvailable ? (
            <Action label={pt.text('exportRequest')} onPress={() => void onExport()} primary />
          ) : (
            <AppText style={styles.hint}>{pt.text('unavailableBody')}</AppText>
          )}
          {exports.length === 0 ? (
            <AppText style={styles.hint}>{pt.text('exportEmpty')}</AppText>
          ) : (
            exports.map(request => <ExportRow key={request.id} request={request} />)
          )}
        </View>

        {/* Deactivate — above deletion, deliberately. */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('deactivateTitle')}
          </AppText>
          <AppText style={styles.hint}>{pt.text('deactivateBody')}</AppText>
          <AppText style={styles.hint}>{pt.text('deactivateDiffers')}</AppText>
          {overview.deactivated ? (
            <AppText style={styles.notice} accessibilityLiveRegion="polite">
              {pt.text('deactivated')}
            </AppText>
          ) : null}
          <Action
            label={overview.deactivated ? pt.text('reactivateAction') : pt.text('deactivateAction')}
            onPress={() => void onDeactivate()}
          />
        </View>

        {/* Delete — a plain row, not hidden and not dressed up. */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('deleteTitle')}
          </AppText>
          <AppText style={styles.hint}>{pt.text('deleteBody')}</AppText>
          <Action label={pt.text('deleteAction')} onPress={() => router.push('/privacy-delete')} />
        </View>

        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('articlesTitle')}
          </AppText>
          <Action label={pt.text('articlePrivacy')} onPress={() => router.push('/help')} />
        </View>

        {notice ? (
          <AppText accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.notice}>
            {notice}
          </AppText>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );

  function Action({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onPress}
        style={[styles.action, primary && styles.actionPrimary]}>
        <AppText style={[styles.actionText, primary && styles.actionPrimaryText]}>{label}</AppText>
      </Pressable>
    );
  }

  function ConsentRow({ entry }: { entry: ConsentEntry }) {
    const title = pt.consentTitle(entry);
    const explanation = pt.consentExplanation(entry);

    // A required purpose is a statement of fact, not a control. Rendering it as
    // a switch that always refuses would be a lie the user has to discover.
    if (entry.required) {
      return (
        <View style={styles.row} accessibilityLabel={`${title}. ${pt.text('consentRequired')}. ${explanation}`}>
          <MaterialIcons name="check-circle-outline" size={16} color={colors.successText} />
          <View style={styles.grow}>
            <AppText style={styles.rowTitle}>{title}</AppText>
            <AppText style={styles.hint}>{explanation}</AppText>
            <AppText style={styles.hint}>{pt.text('consentRequired')}</AppText>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.row, isRTL && styles.reverse]}>
        <View style={styles.grow}>
          <AppText style={styles.rowTitle}>{title}</AppText>
          <AppText style={styles.hint}>{explanation}</AppText>
          {/* State is a word as well as a switch position, never colour alone. */}
          <AppText style={styles.hint}>
            {entry.granted ? pt.text('consentOn') : pt.text('consentOff')}
          </AppText>
        </View>
        <Switch
          value={entry.granted}
          disabled={busy}
          onValueChange={() => void onToggleConsent(entry)}
          accessibilityLabel={title}
          accessibilityHint={explanation}
          accessibilityState={{ checked: entry.granted, disabled: busy }}
          trackColor={{ true: colors.successText, false: colors.borderDefault }}
        />
      </View>
    );
  }

  function ExportRow({ request }: { request: ExportRequest }) {
    const status = effectiveExportStatus(request);
    const statusText = pt.exportStatus(status);
    const remaining = hoursUntil(request.expiresAt);
    const rows = manifestRowTotal(request.manifest);
    const expiry =
      status === 'expired'
        ? null
        : `${pt.text('exportExpiresIn')} ${remaining} ${pt.text('exportHours')}`;

    return (
      <View
        style={styles.exportRow}
        accessibilityLabel={[statusText, `${rows} ${pt.text('exportRows')}`, expiry]
          .filter(Boolean)
          .join('. ')}>
        <View style={[styles.rowHeader, isRTL && styles.reverse]}>
          <MaterialIcons
            name={status === 'ready' ? 'file-download' : status === 'expired' ? 'schedule' : 'hourglass-empty'}
            size={16}
            color={status === 'ready' ? colors.successText : colors.textMuted}
          />
          <AppText style={styles.rowTitle}>{statusText}</AppText>
        </View>
        {status === 'manifest_ready' || status === 'requested' ? (
          <AppText style={styles.hint}>{pt.text('exportPreparingNote')}</AppText>
        ) : null}
        <AppText style={styles.hint}>
          {rows} {pt.text('exportRows')}
        </AppText>
        {expiry ? <AppText style={styles.hint}>{expiry}</AppText> : null}
        {request.manifest ? (
          <AppText style={styles.hint}>
            {pt.text('exportExcludes')}: {request.manifest.excluded.join(' · ')}
          </AppText>
        ) : null}
      </View>
    );
  }
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, maxWidth: 720, width: '100%', alignSelf: 'center', gap: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderDefault, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  notice: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { fontSize: 13, fontWeight: typography.semibold, color: colors.textPrimary },
  reverse: { flexDirection: 'row-reverse' },
  grow: { flexGrow: 1, flexShrink: 1, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault },
  actionPrimary: { backgroundColor: colors.surfaceSelected },
  actionText: { fontSize: 12, fontWeight: typography.semibold, color: colors.textPrimary },
  actionPrimaryText: { color: colors.textPrimary },
  exportRow: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderDefault },
  state: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  stateTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary, textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
