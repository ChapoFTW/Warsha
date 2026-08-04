import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandButton, BrandLoadingState, BrandTextField, EmptyState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { environment } from '@/src/config/environment';
import { supportRepository } from '@/src/support/support-repository';
import { useSupportText } from '@/src/support/support-translations';
import type { StaffSupportCase, StaffSupportQueue, StaffSupportToolkit } from '@/src/support/support-types';

/**
 * WPS-019 staff support surface.
 *
 * It sits on the EXISTING WPS-017 operations platform: the same
 * `manage_support_cases` capability, the same `support_cases` queue, the same
 * audit trail. It adds the support-specific view that the generic assignment
 * screen cannot give — service levels, macros, resolution reasons, and merge.
 *
 * The presence of this route in a bundle is not a security boundary. Every
 * action below is refused by the server unless the caller holds the capability.
 */
export default function AdminSupportScreen() {
  const styles = useThemedStyles(makeStyles);
  const { can, text: adminText } = useAdmin();
  const copy = useSupportText();
  const [queue, setQueue] = useState<StaffSupportQueue | null>(null);
  const [toolkit, setToolkit] = useState<StaffSupportToolkit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCase, setBusyCase] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextQueue, nextToolkit] = await Promise.all([
        supportRepository.getStaffQueue(),
        supportRepository.getStaffToolkit(copy.locale),
      ]);
      setQueue(nextQueue);
      setToolkit(nextToolkit);
      setError(null);
    } catch {
      setError(adminText('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [adminText, copy.locale]);

  useEffect(() => { void load(); }, [load]);

  async function act(caseId: string, action: () => Promise<unknown>) {
    setBusyCase(caseId);
    setError(null);
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : adminText('errorDenied'));
    } finally {
      setBusyCase(null);
    }
  }

  if (!can('manage_support_cases')) {
    return <AdminShell title={copy.text('staffQueue')} onBack>
      <EmptyState icon="lock-outline" title={adminText('errorDenied')} />
    </AdminShell>;
  }

  if (environment.dataMode === 'mock') {
    return <AdminShell title={copy.text('staffQueue')} onBack>
      <EmptyState icon="cloud-off" title={copy.text('staffMockUnavailable')} />
    </AdminShell>;
  }

  return <AdminShell title={copy.text('staffQueue')} onBack>
    {loading ? <BrandLoadingState label={copy.text('loading')} /> : null}
    {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}

    {queue ? <>
      <AdminSection title={copy.text('staffQueue')}>
        <AdminRow label={copy.text('staffOpen')} value={`${queue.counts.open}`} />
        <AdminRow label={copy.text('staffInProgress')} value={`${queue.counts.inProgress}`} />
        <AdminRow label={copy.text('staffWaiting')} value={`${queue.counts.waitingParticipant}`} />
        <AdminRow label={copy.text('staffEscalated')} value={`${queue.counts.escalated}`} tone={queue.counts.escalated > 0 ? 'warning' : 'neutral'} />
        <AdminRow label={copy.text('staffMine')} value={`${queue.counts.mine}`} />
        <AdminRow
          label={copy.text('staffBreached')}
          value={`${queue.counts.breachedFirstResponse}`}
          tone={queue.counts.breachedFirstResponse > 0 ? 'error' : 'success'}
        />
      </AdminSection>

      {queue.cases.length === 0 ? <EmptyState icon="inbox" title={copy.text('noCases')} /> : null}

      {queue.cases.map(item => <CaseCard
        key={item.caseId}
        item={item}
        toolkit={toolkit}
        note={note}
        onNoteChange={setNote}
        busy={busyCase === item.caseId}
        onAssign={() => void act(item.caseId, () => supportRepository.assignCase(
          item.caseId, null, note, `assign-${item.caseId}-${Date.now().toString(36)}`))}
        onResolve={reasonKey => void act(item.caseId, () => supportRepository.resolveCase(
          item.caseId, reasonKey, note.trim() || null, `resolve-${item.caseId}-${Date.now().toString(36)}`))}
      />)}

      {toolkit ? <AdminSection title={copy.text('staffSla')}>
        {toolkit.slaPolicy.map(entry => <AdminRow
          key={entry.priority}
          label={entry.priority}
          value={`${entry.firstResponseHours}h / ${entry.resolutionHours}h`}
        />)}
      </AdminSection> : null}

      {toolkit && toolkit.macros.length > 0 ? <AdminSection
        title={copy.text('staffMacros')}
        hint={copy.text('staffNoteHint')}>
        {toolkit.macros.map(macro => <AdminRow key={macro.macroKey} label={macro.title} hint={macro.body} />)}
      </AdminSection> : null}
    </> : null}
  </AdminShell>;
}

function CaseCard({
  item, toolkit, note, onNoteChange, busy, onAssign, onResolve,
}: {
  item: StaffSupportCase;
  toolkit: StaffSupportToolkit | null;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  onAssign: () => void;
  onResolve: (reasonKey: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const copy = useSupportText();
  return <AdminSection title={item.subject}>
    <AdminRow label={copy.text('category')} value={copy.category(item.category)} />
    <AdminRow label={copy.text('staffQueue')} value={copy.status(item.status)} />
    <AdminRow label="priority" value={item.priority} />
    <AdminRow
      label={copy.text('staffBreached')}
      value={item.firstResponseBreached ? copy.text('yes') : copy.text('no')}
      tone={item.firstResponseBreached ? 'error' : 'success'}
    />
    {item.linkedType ? <AdminRow label={item.linkedType} value={item.linkedId ?? ''} /> : null}
    <View style={styles.actions}>
      <BrandTextField
        label={copy.text('staffNote')}
        helper={copy.text('staffNoteHint')}
        value={note}
        onChangeText={onNoteChange}
        multiline
        numberOfLines={3}
        maxLength={2000}
      />
      <BrandButton
        label={copy.text('staffAssign')}
        variant="secondary"
        icon="person-add-alt"
        loading={busy}
        onPress={onAssign}
      />
      {toolkit?.resolutionReasons.map(reason => <BrandButton
        key={reason.reasonKey}
        label={`${copy.text('staffResolve')} — ${reason.label}`}
        variant="secondary"
        icon="check-circle-outline"
        loading={busy}
        disabled={busy || (reason.requiresNote && note.trim().length === 0)}
        onPress={() => onResolve(reason.reasonKey)}
      />)}
    </View>
  </AdminSection>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  error: { color: colors.error, fontSize: 13, fontWeight: typography.medium, marginBottom: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
