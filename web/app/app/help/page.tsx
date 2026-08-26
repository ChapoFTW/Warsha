'use client';

import { AppShell } from '@/components/app-shell';
import { HelpManual, type HelpArticle } from '@/components/help-manual';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import source from '@/lib/generated-public-help.json';
import { customerNavigation, workerNavigation } from '@/lib/nav';
import { useAppLocale } from '@/lib/use-app-locale';

export default function AppHelpPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const { resolution } = useSession();
  const worker = resolution.status === 'resolved' && (resolution.target === 'worker_home' || resolution.target === 'worker_onboarding');
  const articles = (source.articles as HelpArticle[]).filter(article => article.audience === 'all' || article.audience === (worker ? 'worker' : 'customer'));
  return <AppShell navigation={worker ? workerNavigation(words) : customerNavigation(words)} mode={worker ? words.modeWorker : words.modeCustomer}><HelpManual locale={locale} articles={articles}/></AppShell>;
}
