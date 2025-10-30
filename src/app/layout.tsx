import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'CSMS - Central Stock Management System',
  description: 'Inventory visibility and control for your products.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-dvh flex flex-col">
          <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
          <footer className="border-t bg-white">
            <div className="container mx-auto px-4 py-4 text-xs text-gray-500">© {new Date().getFullYear()} CSMS</div>
          </footer>
        </div>
      </body>
    </html>
  );
}


