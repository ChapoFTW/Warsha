import { ContentPage, contentMetadata } from '@/components/content-page';

export const generateMetadata = contentMetadata('contact');

export default async function Page(
  { params }: { params: Promise<{ locale: string }> },
) {
  return <ContentPage slug="contact" params={params} />;
}
