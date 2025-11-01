import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'CSMS - Central Stock Management System',
  description: 'Inventory visibility and control for your products.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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


