import type { Metadata } from 'next';

import { AlphaNote, Card, CardGrid, PageShell, Prose } from '@/components/page-shell';

export const metadata: Metadata = {
  title: "Find a professional",
  description: "Home repair and maintenance trades available through Warsha in Egypt.",
  alternates: { canonical: '/services' },
  openGraph: {
    title: "Find a professional · Warsha",
    description: "Home repair and maintenance trades available through Warsha in Egypt.",
    url: '/services',
  },
};

export default function Page() {
  return (
    <PageShell
      title={"Find a professional"}
      lead={"Warsha covers home repair and maintenance trades. You describe the job; workers who cover it quote."}
    >

      <CardGrid>
        <Card title="Plumbing">
          <p>Leaks, blockages, taps, water heaters, and bathroom fittings.</p>
        </Card>
        <Card title="Electrical">
          <p>Sockets, lighting, distribution boards, and fault finding.</p>
        </Card>
        <Card title="Air conditioning">
          <p>Installation, servicing, cleaning, and repair.</p>
        </Card>
        <Card title="Carpentry">
          <p>Doors, windows, cabinets, and fitted furniture repair.</p>
        </Card>
        <Card title="Painting">
          <p>Interior and exterior painting and surface preparation.</p>
        </Card>
        <Card title="Appliance repair">
          <p>Domestic appliances, including washing machines and refrigerators.</p>
        </Card>
      </CardGrid>
      <AlphaNote>
        Availability depends on verified professionals covering your area. Warsha does not
        publish worker counts or response times it cannot guarantee.
      </AlphaNote>
    </PageShell>
  );
}
