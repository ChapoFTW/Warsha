import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { StateBadge } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useWorkerText } from '@/src/worker/worker-copy';

/**
 * What a field is called, whether it is required, and why Warsha asks.
 *
 * The disclosure itself is not negotiable — "Private. Customers won't see your
 * exact home address." is the sentence that makes handing over a home address
 * reasonable, and none of it is removed here.
 *
 * What changed is where it sits. These were emitted as a manifest of every
 * field ahead of the form, so a professional read "Governorate — Required —
 * choose the governorate where you work", then "Area — Required — choose the
 * area where you work", and only then reached a control labelled "Governorate"
 * again. Every name appeared twice, and on a 320dp screen the first thing you
 * could actually touch was pushed to the very bottom edge.
 *
 * Passing `children` makes it a wrapper instead of a preamble: the label, the
 * badges and the reason sit directly on top of the control they describe, as
 * one group. Same words, half the height, and the first control is on screen.
 *
 * `accessible` on the group is deliberate: the label, the badges and the reason
 * are one announcement rather than four fragments, and the control keeps its own
 * focus because a `Pressable` inside stays separately focusable.
 *
 * That was the intent and it was not happening. Read off emulator-5554, the two
 * `StateBadge` chips were accessibility elements of their own, so the group
 * composed nothing and the reason went unannounced. The group now carries an
 * explicit name instead of trusting the platform to assemble one — see
 * docs/decisions/accessible-names.md.
 */
export function OnboardingFieldMeta({
  label,
  required,
  privateField = false,
  purpose,
  labelShownElsewhere = false,
  children,
}: {
  label: string;
  required: boolean;
  privateField?: boolean;
  purpose: string;
  /**
   * Something else on this card already shows exactly this phrase, so drawing it
   * here is a repetition rather than a heading.
   *
   * It happens in both directions. Four cards passed the same expression to
   * their own `title` and to this `label`, so "Upload the criminal-record
   * certificate" appeared twice, 190px apart, with one line of body text
   * between. Two more sit above a checkbox that states the phrase itself — the
   * skill-certificate question, and the criminal-record declaration — where the
   * repeat lands below rather than above.
   *
   * The label is never lost. It is in the announcement regardless, because a
   * screen reader needs the badges attached to something even when a sighted
   * reader has just read the same words an inch away.
   */
  labelShownElsewhere?: boolean;
  /** The control this describes. Omit for a step whose control names itself. */
  children?: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const wt = useWorkerText();
  const requirement = required ? wt.text('required') : wt.text('optional');
  /*
   * Said outright rather than composed. This group used to rely on the platform
   * joining its children, which stopped working the moment one of those children
   * was an accessibility element of its own — see docs/decisions/accessible-names.md.
   * Naming it here makes the announcement the same sentence on every surface, and
   * the same sentence whether or not the label is drawn.
   */
  const announcement = [label, requirement, privateField ? wt.text('privateLabel') : '', purpose]
    .filter(Boolean).join('. ');
  return (
    <View style={styles.field}>
      <View accessible accessibilityLabel={announcement} style={styles.group}>
        <View style={[styles.row, isRTL && styles.reverse]}>
          {labelShownElsewhere ? null : <AppText style={styles.label}>{label}</AppText>}
          <StateBadge label={requirement} compact />
          {privateField ? <StateBadge label={wt.text('privateLabel')} icon="lock" compact /> : null}
        </View>
        <AppText style={styles.purpose}>{purpose}</AppText>
      </View>
      {children}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  // Tighter than the gap between fields, so a label reads as belonging to the
  // control beneath it rather than floating between two of them.
  field: { gap: spacing.sm },
  group: { gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  label: { ...typography.body, color: colors.textPrimary, fontWeight: typography.semibold },
  purpose: { ...typography.bodySmall, color: colors.textMuted },
});
