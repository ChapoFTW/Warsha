import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AdminRow, AdminSection, AdminShell } from '@/components/warsha/AdminShell';
import { BrandButton, BrandTextField, EmptyState } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useAdmin } from '@/src/admin/admin-context';
import { adminRepository } from '@/src/admin/admin-repository';
import { searchTermIsAllowed, type SafeSearchResult } from '@/src/admin/admin-types';

/**
 * Restricted operational search: exact identifiers only, no name lookup, no
 * wildcard, no bulk enumeration, and no National ID search of any kind. The
 * server re-applies every one of those rules and records the search.
 */
export default function AdminSearchScreen() {
  const styles = useThemedStyles(makeStyles);
  const { text } = useAdmin();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SafeSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const trimmed = term.trim();
    if (!searchTermIsAllowed(trimmed)) {
      setError(/[%_*]/.test(trimmed) ? text('searchWildcard') : text('searchTooShort'));
      setResults(null);
      return;
    }
    setBusy(true);
    try {
      setResults(await adminRepository.search(trimmed));
      setError(null);
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : '';
      setError(/rate limit/i.test(message) ? text('searchRateLimited') : text('errorDenied'));
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title={text('searchTitle')} subtitle={text('searchHint')} onBack>
      <AdminSection title={text('searchTitle')} hint={text('searchNoNationalId')}>
        <BrandTextField
          label={text('searchTitle')}
          placeholder={text('searchPlaceholder')}
          value={term}
          onChangeText={setTerm}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={text('searchTitle')}
          error={error ?? undefined}
        />
        <BrandButton label={text('searchTitle')} icon="search" loading={busy} onPress={() => { void run(); }} />
        <AppText style={styles.note}>{text('searchAudited')}</AppText>
      </AdminSection>

      {results !== null && results.length === 0 ? (
        <EmptyState title={text('searchEmpty')} icon="search-off" />
      ) : null}

      {results !== null && results.length > 0 ? (
        <AdminSection title={text('searchTitle')}>
          {results.map(result => (
            <AdminRow
              key={`${result.kind}:${result.id}`}
              label={result.id}
              hint={result.kind}
              value={result.status}
            />
          ))}
        </AdminSection>
      ) : null}
    </AdminShell>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  note: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
});
