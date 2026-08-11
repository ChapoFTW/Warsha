import type { Metadata, Viewport } from 'next';

import { StaffGate } from '@/components/staff-gate';

import '../globals.css';

/**
 * The staff console, served from `admin.usewarsha.com`.
 *
 * A separate origin from the customer application on purpose: the browser
 * isolates storage and scripting per origin, so a flaw in a product surface
 * cannot reach a staff session, and a staff session cannot leak into one.
 */
export const metadata: Metadata = {
  title: { default: 'Warsha Console', template: '%s · Warsha Console' },
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#080808' },
    { media: '(prefers-color-scheme: light)', color: '#F4F2EE' },
  ],
  width: 'device-width',
  initialScale: 1,
};

const applyStoredAppearance = `
(function () {
  try {
    var stored = window.localStorage.getItem('warsha:appearance:v1');
    var explicit = window.localStorage.getItem('warsha:appearance-explicit:v1') === 'true';
    if (explicit && (stored === 'light' || stored === 'dark')) {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (error) {}
})();
`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyStoredAppearance }} />
      </head>
      <body>
        <StaffGate>{children}</StaffGate>
      </body>
    </html>
  );
}
