import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en" dir="auto">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#080808" />
        <meta name="color-scheme" content="dark" />
        <meta name="description" content="YOUR WORK, OUR MISSION" />
        <meta property="og:site_name" content="Warsha" />
        <meta property="og:description" content="YOUR WORK, OUR MISSION" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/warsha-current-approved-192.png" />
        <link rel="apple-touch-icon" href="/warsha-current-approved-192.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
