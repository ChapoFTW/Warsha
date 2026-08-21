import { contentMetadata } from '@/components/content-page';
import { HelpManual, type HelpArticle } from '@/components/help-manual';
import source from '@/lib/generated-public-help.json';
import { isLocale } from '@/lib/preferences';

export const generateMetadata = contentMetadata('help');

export default async function Page(
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const typed = isLocale(locale) ? locale : 'en';
  return <main style={{ padding: 'clamp(24px, 6vw, 72px)' }}><HelpManual locale={typed} articles={source.articles as HelpArticle[]} /></main>;
}
