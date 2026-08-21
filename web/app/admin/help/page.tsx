'use client';

import { ConsoleShell } from '@/components/console-shell';
import { appCopy } from '@/lib/app-copy';
import { HelpManual, type HelpArticle } from '@/components/help-manual';
import source from '@/lib/generated-admin-help.json';
import { useAppLocale } from '@/lib/use-app-locale';

export default function AdminHelpPage() {
  const locale = useAppLocale();
  return <ConsoleShell title={appCopy[locale].navHelp}><HelpManual locale={locale} articles={source.articles as HelpArticle[]}/></ConsoleShell>;
}
