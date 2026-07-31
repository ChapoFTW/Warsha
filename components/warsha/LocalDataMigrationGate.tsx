import Storage from 'expo-sqlite/kv-store';
import { PropsWithChildren, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/src/auth/auth-context';
import { useLocalization } from '@/src/i18n/localization';
import { importSupportedLocalData, inspectLocalData } from '@/src/migration/local-data-migration';

export function LocalDataMigrationGate({ children }: PropsWithChildren) {
  const { mode, user } = useAuth();
  const { t } = useLocalization();
  const checked = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'supabase' || !user || checked.current === user.id) return;
    checked.current = user.id;
    const expectedUserId = user.id;
    const marker = `warsha:migration-prompted:${expectedUserId}`;

    const runImport = async () => {
      try {
        const result = await importSupportedLocalData(expectedUserId);
        await Storage.setItem(marker, 'imported');
        Alert.alert(
          t('migrationTitle'),
          t(result.skippedFavouriteCount > 0 ? 'importPartial' : 'importSucceeded'),
        );
      } catch {
        Alert.alert(t('migrationTitle'), t('importFailed'), [
          { text: t('notNow'), style: 'cancel' },
          { text: t('tryAgain'), onPress: () => void runImport() },
        ]);
      }
    };

    void Storage.getItem(marker).then(async done => {
      if (done) return;
      const info = await inspectLocalData();
      if (!info.hasData) {
        await Storage.setItem(marker, 'empty');
        return;
      }
      Alert.alert(t('migrationTitle'), t('migrationBody'), [
        { text: t('notNow'), style: 'cancel' },
        { text: t('importAction'), onPress: () => void runImport() },
      ]);
    }).catch(() => { checked.current = null; });
  }, [mode, t, user]);

  return children;
}
