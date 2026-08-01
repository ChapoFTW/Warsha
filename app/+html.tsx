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
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/warsha-icon-192.png" />
        <link rel="apple-touch-icon" href="/warsha-icon-192.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
