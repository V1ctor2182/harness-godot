import './globals.css';
import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/app-shell';

/* ── Editorial Workbench fonts — see DESIGN.md ─────────────── */
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
  variable: '--font-display',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

const projectName = process.env.NEXT_PUBLIC_PROJECT_NAME ?? 'AI Team';

export const metadata = {
  title: `${projectName} — Dashboard`,
  description: 'AI Implementation Team Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <AppShell projectName={projectName}>{children}</AppShell>
      </body>
    </html>
  );
}
