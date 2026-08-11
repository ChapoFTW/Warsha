import { ContentPage, contentMetadata } from '@/components/content-page';

export const generateMetadata = contentMetadata('trust-and-safety');

export default async function Page(
  { params }: { params: Promise<{ locale: string }> },
) {
  return <ContentPage slug="trust-and-safety" params={params} />;
}
