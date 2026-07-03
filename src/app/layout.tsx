import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { themeInitScript } from '@/lib/theme-script';

export const metadata: Metadata = {
  title: 'Water Factory Tracker',
  description: 'Daily inventory and driver distribution tracker for charity water shop',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
