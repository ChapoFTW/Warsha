import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandButton, BrandLoadingState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAdmin } from '@/src/admin/admin-context';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { onboardingStaffRepository } from '@/src/onboarding/onboarding-staff-repository';
import {
  DECISION_CAPABILITY,
  requiresEvidence,
  type VettingDecision,
} from '@/src/onboarding/onboarding-staff-types';
import { vettingCaseRepository } from '@/src/legal/legal-staff-repository';

/**
 * WPS-024 staff vetting decision surface.
 *
 * WPS-023 shipped the queue read-only and recorded why: recording an adverse
 * decision needs a reason, recorded evidence, a fresh session and — for a
 * rejection — a second person, and a half-built control that lets somebody
 * begin that and not finish it is worse than no control. WPS-024 activates the
 * staff review workflow, so the control is built properly here.
 *
 * The rules the screen enforces, each of which the server also enforces — this
 * is about not letting somebody compose a request that will be refused after
 * they have typed a paragraph, never about being the check itself:
 *
 *   * a decision the reviewer lacks the capability for is not offered;
 *   * an adverse decision cannot be submitted without recorded evidence;
 *   * the worker-facing reason and the private note are separate fields, and
 *     the screen says which one the worker will read;
 *   * no confidence score is displayed anywhere, because a reviewer shown a
 *     score decides the score rather than the case.
 *
 * Opening this screen is itself an audited event. The detail RPC records the
 * access before it returns anything.
 */

const DECISIONS: { key: VettingDecision; label: string; tone: 'neutral' | 'warning' }[] = [
  { key: 'start_identity_review', label: 'Start identity review', tone: 'neutral' },
  { key: 'start_certificate_review', label: 'Start certificate review', tone: 'neutral' },
  { key: 'request_correction', label: 'Request a correction', tone: 'neutral' },
  { key: 'escalate_manual_review', label: 'Escalate to manual review', tone: 'neutral' },
  { key: 'approve', label: 'Approve', tone: 'neutral' },
  { key: 'activate', label: 'Activate fully', tone: 'neutral' },
  { key: 'suspend', label: 'Suspend', tone: 'warning' },
  { key: 'reject', label: 'Reject', tone: 'warning' },
];

type CaseDetail = {
  subjectRef: string;
  workerState: string | null;
  capabilityTier: string;
  gates: Record<string, boolean>;
  provisionalGates: Record<string, boolean>;
  documents: { documentType: string; status: string; captureSource: string | null }[];
  certificate: { status: string; issueDate: string | null } | null;
  extractionRuns: {
    documentType: string;
    outcome: string;
    providerVersion: string;
    fieldsExtracted: number;
    requestedAt: string;
  }[];
  fieldsConfirmedByWorker: boolean | null;
};

export default function AdminVettingCaseScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text, can } = useAdmin();
  const params = useLocalSearchParams<{ ref?: string }>();
  const subjectRef = params.ref ?? '';

  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VettingDecision | null>(null);
  const [safeReason, setSafeReason] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!can('review_worker_vetting') || subjectRef.length === 0) {
        setDetail(null);
      } else {
        setDetail((await vettingCaseRepository.detail(subjectRef)) as CaseDetail);
      }
      setError(null);
    } catch {
      // Fail closed: an unreadable case reads as "you cannot see this", never
      // as "there is nothing here".
      setDetail(null);
      setError(text('errorDenied'));
    } finally {
      setLoading(false);
    }
  }, [can, subjectRef, text]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    if (!selected || !detail) return;
    setBusy(true);
    try {
      await onboardingStaffRepository.decide({
        // The server resolves the subject; the screen never holds a user id.
        userId: detail.subjectRef,
        decision: selected,
        reasonCode: selected,
        safeReason: safeReason.trim(),
        privateNote: privateNote.trim().length > 0 ? privateNote.trim() : null,
      });
      setNotice('Decision recorded.');
      setSelected(null);
      setSafeReason('');
      setPrivateNote('');
      await load();
    } catch {
      setNotice('That decision was refused. Check your capability and the case state.');
    } finally {
      setBusy(false);
    }
  }, [detail, load, privateNote, safeReason, selected]);

  if (loading) {
    return <AdminShell title="Vetting case"><BrandLoadingState label="Vetting case" /></AdminShell>;
  }

  if (!detail) {
    return (
      <AdminShell title="Vetting case">
        <AppText style={styles.error}>{error ?? text('errorDenied')}</AppText>
      </AdminShell>
    );
  }

  const outstandingGates = Object.entries(detail.gates).filter(([, passed]) => !passed);
  // Adverse decisions need evidence; the server refuses without it, and the
  // button is disabled here so nobody types a reason into a dead end.
  const evidenceMissing =
    selected !== null && requiresEvidence(selected) && privateNote.trim().length < 3;
  const reasonMissing = safeReason.trim().length < 3;

  return (
    <AdminShell title="Vetting case">
      {notice ? <AppText style={styles.notice}>{notice}</AppText> : null}

      <AdminSection title="State">
        <AdminRow label="Reference" value={detail.subjectRef.slice(0, 12)} />
        <AdminRow label="Lifecycle" value={detail.workerState ?? '—'} />
        <AdminRow
          label="Capability"
          value={detail.capabilityTier}
          hint={
            detail.capabilityTier === 'provisional'
              ? 'Taking work now. Review has not completed.'
              : detail.capabilityTier === 'full'
                ? 'Fully verified.'
                : 'Cannot take work.'
          }
          tone={detail.capabilityTier === 'provisional' ? 'warning' : 'neutral'}
        />
        <AdminRow
          label="Fields confirmed by worker"
          value={detail.fieldsConfirmedByWorker ? 'Yes' : 'No'}
        />
      </AdminSection>

      <AdminSection title="Documents">
        {detail.documents.length === 0 ? (
          <AppText style={styles.hint}>No documents submitted.</AppText>
        ) : (
          detail.documents.map((document) => (
            <AdminRow
              key={document.documentType}
              label={document.documentType}
              value={document.status}
              hint={document.captureSource ? `Captured via ${document.captureSource}` : undefined}
            />
          ))
        )}
        {detail.certificate ? (
          <AdminRow
            label="Criminal-record certificate"
            value={detail.certificate.status}
            hint={detail.certificate.issueDate ? `Issued ${detail.certificate.issueDate}` : undefined}
          />
        ) : (
          <AppText style={styles.hint}>No certificate submitted.</AppText>
        )}
        <AppText style={styles.note}>
          Opening a document is a separate action under its own capability, and every open is
          recorded against you whether or not anything is found.
        </AppText>
      </AdminSection>

      <AdminSection title="Automatic reading">
        {detail.extractionRuns.length === 0 ? (
          <AppText style={styles.hint}>No extraction was run.</AppText>
        ) : (
          detail.extractionRuns.map((run) => (
            <AdminRow
              key={`${run.documentType}-${run.requestedAt}`}
              label={run.documentType}
              value={run.outcome}
              hint={`${run.fieldsExtracted} field(s) · ${run.providerVersion} · ${run.requestedAt.slice(0, 10)}`}
            />
          ))
        )}
        {/* Stated on the screen, not only in a policy, because this is where a
            reviewer might otherwise assume the machine has already checked. */}
        <AppText style={styles.note}>
          Automatic reading fills a form the worker then confirms. It does not establish that a
          document is genuine, that it belongs to this person, or that they are eligible. No
          confidence score is shown here, because a score invites deferring to it.
        </AppText>
      </AdminSection>

      <AdminSection title="Outstanding gates">
        {outstandingGates.length === 0 ? (
          <AppText style={styles.hint}>Every activation gate passes.</AppText>
        ) : (
          outstandingGates.map(([gate]) => (
            <AdminRow key={gate} label={gate} value="Not satisfied" tone="warning" />
          ))
        )}
      </AdminSection>

      <AdminSection title="Decision">
        <View style={styles.decisions}>
          {DECISIONS.filter((decision) => can(DECISION_CAPABILITY[decision.key] as never)).map(
            (decision) => (
              <BrandButton
                key={decision.key}
                label={decision.label}
                variant={selected === decision.key ? 'primary' : 'secondary'}
                onPress={() => setSelected(decision.key)}
                disabled={busy}
              />
            ),
          )}
        </View>

        {selected ? (
          <View style={styles.form}>
            <AppText style={styles.label}>Reason the worker will read</AppText>
            <AppText style={styles.note}>
              Something they can act on. &quot;Your document was rejected&quot; is not a reason;
              &quot;the back of your ID is cut off at the bottom edge&quot; is.
            </AppText>
            <TextInput
              style={styles.input}
              multiline
              value={safeReason}
              onChangeText={setSafeReason}
              accessibilityLabel="Reason the worker will read"
            />

            <AppText style={styles.label}>
              Private evidence{requiresEvidence(selected) ? ' (required)' : ''}
            </AppText>
            <AppText style={styles.note}>
              What you actually saw. Never shown to the worker, and it is what an appeal examines.
            </AppText>
            <TextInput
              style={styles.input}
              multiline
              value={privateNote}
              onChangeText={setPrivateNote}
              accessibilityLabel="Private evidence"
            />

            {evidenceMissing ? (
              <AppText style={styles.warning}>
                An adverse decision cannot be recorded without evidence.
              </AppText>
            ) : null}

            <BrandButton
              label="Record decision"
              onPress={() => void submit()}
              disabled={busy || reasonMissing || evidenceMissing}
            />
          </View>
        ) : null}
      </AdminSection>
    </AdminShell>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  error: { color: colors.errorText, paddingHorizontal: spacing.lg },
  notice: { color: colors.textSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  hint: { color: colors.textSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  warning: { color: colors.warningText, fontSize: 13, paddingHorizontal: spacing.lg },
  decisions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  form: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: typography.semibold, color: colors.textPrimary },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radii.md,
    backgroundColor: colors.inputBackground,
    color: colors.inputText,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
});
