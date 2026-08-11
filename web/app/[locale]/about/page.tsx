import { ContentPage, contentMetadata } from '@/components/content-page';

export const generateMetadata = contentMetadata('about');

export default async function Page(
  { params }: { params: Promise<{ locale: string }> },
) {
  return <ContentPage slug="about" params={params} />;
}
