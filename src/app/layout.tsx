import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Judgement store',
  description:
    'A creator\'s judgement, codified: deterministic answers that show the rule behind every pick.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
