import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import { ServiceWorker } from '@/components/ServiceWorker';

export const metadata: Metadata = {
  title: 'CSMS - Central Stock Management System',
  description: 'Inventory visibility and control for your products.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CSMS',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#3c55f3',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icons/icon-192x192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-180x180.png" sizes="180x180" />
        <link rel="apple-touch-icon" href="/icons/icon-152x152.png" sizes="152x152" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CSMS" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const stored = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const shouldBeDark = stored === 'dark' || (!stored && prefersDark);
                if (shouldBeDark) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <ServiceWorker />
        <div className="min-h-dvh flex flex-col">
          <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
          <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="container mx-auto px-4 py-4 text-xs text-gray-500 dark:text-gray-400">© {new Date().getFullYear()} CSMS</div>
          </footer>
        </div>
      </body>
    </html>
  );
}


