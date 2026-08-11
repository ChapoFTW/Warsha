import { ContentPage, contentMetadata } from '@/components/content-page';

export const generateMetadata = contentMetadata('help');

export default async function Page(
  { params }: { params: Promise<{ locale: string }> },
) {
  return <ContentPage slug="help" params={params} />;
}
