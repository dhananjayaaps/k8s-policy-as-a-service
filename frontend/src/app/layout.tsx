import type { Metadata } from 'next';
import '../index.css';

export const metadata: Metadata = {
  title: 'PolicyFlow - Kubernetes Policy Management',
  description: 'SME-friendly platform for Kubernetes policy-as-code adoption',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
