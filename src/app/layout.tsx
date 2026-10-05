import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Shopify Builder', description: 'Build a Shopify store from a CSV, photos and a reference site' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
