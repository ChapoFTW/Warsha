import { ContentPage, contentMetadata } from '@/components/content-page';

export const generateMetadata = contentMetadata('services');

export default async function Page(
  { params }: { params: Promise<{ locale: string }> },
) {
  return <ContentPage slug="services" params={params} />;
}
