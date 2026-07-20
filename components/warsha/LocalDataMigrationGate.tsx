import { PropsWithChildren,useEffect,useRef } from 'react';
import { Alert } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import { useLocalization } from '@/src/i18n/localization';
import { useAuth } from '@/src/auth/auth-context';
import { importSupportedLocalData,inspectLocalData } from '@/src/migration/local-data-migration';
export function LocalDataMigrationGate({children}:PropsWithChildren){const{mode,user}=useAuth();const{t}=useLocalization();const checked=useRef<string|null>(null);useEffect(()=>{if(mode!=='supabase'||!user||checked.current===user.id)return;checked.current=user.id;const marker=`warsha:migration-prompted:${user.id}`;void Storage.getItem(marker).then(async done=>{if(done)return;const info=await inspectLocalData();if(!info.hasData){await Storage.setItem(marker,'empty');return}Alert.alert(t('migrationTitle'),t('migrationBody'),[{text:t('notNow'),style:'cancel'},{text:t('importAction'),onPress:()=>void importSupportedLocalData(user.id).then(()=>Storage.setItem(marker,'imported')).catch(()=>Alert.alert(t('migrationTitle'),t('importFailed')))}])}).catch(()=>{})},[mode,t,user]);return children}
