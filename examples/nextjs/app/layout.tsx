import type { Metadata } from 'next';
import './style.css';
import { DemoShell } from './shell';
export const metadata: Metadata = {
  title: 'SignalKit / local lab',
  description: 'A local consent and ecommerce instrumentation demonstration.',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DemoShell>{children}</DemoShell>
      </body>
    </html>
  );
}
