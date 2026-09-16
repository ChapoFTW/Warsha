import Constants from 'expo-constants';
import { StyleSheet } from 'react-native';

import { AppText } from '@/components/warsha/Typography';
import { typography, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';

/** What `app.config.js` stamped into this binary. */
type Stamp = { commit?: string | null; dirty?: boolean | null; builtAt?: string | null };

export function buildStamp(): Stamp {
  return (Constants.expoConfig?.extra?.build ?? {}) as Stamp;
}

/**
 * Which build this is, said where a person can read it out.
 *
 * On 2026-09-11 a header removed from the chrome three days earlier was
 * photographed on a real phone. Deciding whether that was a regression or a
 * stale artifact took a trace through git history, four versions of the
 * component and the contents of an APK bundle — because nothing in the product
 * says which commit it is running.
 *
 * The web has been able to answer this since it shipped: `/api/health` returns
 * `commit`. Native could not answer it at all. `runtimeVersion` is pinned to
 * `appVersion`, the app version has been 1.0.0 throughout, and `versionCode` is
 * unset — so every build ever produced looks identical from the outside, and an
 * over-the-air update published against 1.0.0 is considered compatible with all
 * of them. This does not fix that. It makes it legible, which is the part that
 * was missing at the moment somebody needed it.
 *
 * Deliberately unlocalized. It is an identifier — a version and seven hex
 * characters — and translating it would make it harder to read back, not
 * easier. The trailing `+` means the tree had uncommitted changes when the
 * binary was built, which a release never does and a QA build often does.
 */
export function BuildStamp() {
  const styles = useThemedStyles(makeStyles);
  const { commit, dirty } = buildStamp();
  const version = Constants.expoConfig?.version ?? null;
  if (!version && !commit) return null;
  const text = [version, commit ? `${commit}${dirty ? '+' : ''}` : null]
    .filter(Boolean).join(' · ');
  return <AppText style={styles.stamp}>{text}</AppText>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  stamp: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
