import { ContentPage, contentMetadata } from '@/components/content-page';

export const generateMetadata = contentMetadata('become-a-worker');

export default async function Page(
  { params }: { params: Promise<{ locale: string }> },
) {
  return <ContentPage slug="become-a-worker" params={params} />;
}
