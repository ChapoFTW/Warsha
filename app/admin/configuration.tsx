import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandButton, BrandLoadingState, BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { colors, spacing, typography } from '@/constants/theme';
import { useAdmin } from '@/src/admin/admin-context';
import { adminRepository } from '@/src/admin/admin-repository';
import type { ConfigurationDomain, ConfigurationVersion, FeatureFlag, KillSwitch } from '@/src/admin/admin-types';

/**
 * Configuration change control, feature flags, and kill switches.
 *
 * WPS-017 owns the change-control record: version, validation, reason,
 * approval, activation, and immutable history. It does not become the authority
 * for a domain's values — each domain row states who applies the activated
 * version. Nothing here stores a secret, and a kill switch only ever restricts.
 */
export default function AdminConfigurationScreen() {
  const { text, can, mayAct } = useAdmin();
  const [domains, setDomains] = useState<ConfigurationDomain[]>([]);
  const [versions, setVersions] = useState<ConfigurationVersion[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [switches, setSwitches] = useState<KillSwitch[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const configuration = await adminRepository.getConfiguration();
      setDomains(configuration.domains ?? []);
      setVersions(configuration.versions ?? []);
      if (can('manage_feature_flags')) setFlags(await adminRepository.getFeatureFlags());
      if (can('manage_kill_switches')) setSwitches(await adminRepository.getKillSwitches());
      setError(null);
    } catch {
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [can, text]);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      setError(null);
      await load();
    } catch {
      setError(text('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }, [load, text]);

  return (
    <AdminShell title={text('configTitle')} subtitle={text('configNoSecrets')} onBack>
      {loading ? <BrandLoadingState label={text('a11yLoading')} /> : null}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}

      {domains.length > 0 ? (
        <AdminSection title={text('configTitle')} hint={text('configDualControl')}>
          {domains.map(domain => (
            <AdminRow
              key={domain.domainKey}
              label={domain.displayName}
              hint={`${text('configOwner')} ${domain.authoritativeOwner} · ${
                domain.appliedBy === 'wps017' ? text('configAppliedByWps017') : text('configAppliedByDomain')
              }`}
              value={domain.allowedKeys.length ? `${domain.allowedKeys.length}` : undefined}
            />
          ))}
        </AdminSection>
      ) : null}

      {versions.length > 0 ? (
        <AdminSection title={text('configActive')} hint={text('configHistoryImmutable')}>
          {versions.map(version => (
            <AdminRow
              key={version.id}
              label={`${version.domainKey} v${version.version}`}
              hint={`${version.environment} · ${version.changeReason}`}
              value={statusLabel(version.status, text)}
              tone={version.status === 'active' ? 'success' : version.status === 'pending_approval' ? 'warning' : 'neutral'}
            />
          ))}
          {mayAct('approve_configuration') ? (
            <View style={styles.actions}>
              <BrandTextField
                label={text('configChangeReason')}
                value={reason}
                onChangeText={setReason}
                multiline
                accessibilityLabel={text('configChangeReason')}
              />
              {versions.filter(v => v.status === 'pending_approval').map(version => (
                <BrandButton
                  key={version.id}
                  label={`${text('configApprove')} — ${version.domainKey} v${version.version}`}
                  icon="verified"
                  loading={busy}
                  disabled={reason.trim().length < 3}
                  onPress={() => {
                    void act(async () => {
                      await adminRepository.activateConfiguration(version.id, reason.trim());
                      setReason('');
                    });
                  }}
                />
              ))}
            </View>
          ) : null}
        </AdminSection>
      ) : null}

      {can('manage_feature_flags') ? (
        <AdminSection title={text('flagsTitle')} hint={text('flagsDisabledByDefault')}>
          {flags.map(flag => (
            <AdminRow
              key={`${flag.flagKey}:${flag.environment}`}
              label={flag.flagKey}
              hint={`${flag.environment} · ${text('flagAudience')} ${flag.audience} · ${text('flagRollout')} ${flag.rolloutPercentage}%`}
              value={flag.enabled ? text('flagEnabled') : text('flagDisabled')}
              tone={flag.enabled ? 'success' : 'neutral'}
            />
          ))}
          <AppText style={styles.note}>{text('flagNotSecurity')}</AppText>
        </AdminSection>
      ) : null}

      {can('manage_kill_switches') ? (
        <AdminSection title={text('switchesTitle')} hint={text('switchesIntro')}>
          {switches.map(entry => (
            <AdminRow
              key={entry.switchKey}
              label={entry.displayName}
              hint={`${entry.domainAuthority} · ${
                entry.serverEnforced ? text('switchServerEnforced') : text('switchAdvisory')
              }`}
              value={entry.active ? text('switchActive') : text('switchInactive')}
              tone={entry.active ? 'error' : 'neutral'}
            />
          ))}
          <AppText style={styles.note}>{text('switchExistingWork')}</AppText>
        </AdminSection>
      ) : null}
    </AdminShell>
  );
}

function statusLabel(status: ConfigurationVersion['status'], text: ReturnType<typeof useAdmin>['text']) {
  switch (status) {
    case 'draft': return text('configDraft');
    case 'pending_approval': return text('configPendingApproval');
    case 'active': return text('configActive');
    case 'superseded': return text('configSuperseded');
    default: return text('configRejected');
  }
}

const styles = StyleSheet.create({
  error: { ...typography.bodySmall, color: colors.error },
  note: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
