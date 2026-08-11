import { ContentPage, contentMetadata } from '@/components/content-page';

export const generateMetadata = contentMetadata('how-it-works');

export default async function Page(
  { params }: { params: Promise<{ locale: string }> },
) {
  return <ContentPage slug="how-it-works" params={params} />;
}
