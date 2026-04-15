import './globals.css';
import { AppShell } from '@/components/app-shell';

const projectName = process.env.NEXT_PUBLIC_PROJECT_NAME ?? 'AI Team';

export const metadata = {
  title: `${projectName} — Dashboard`,
  description: 'AI Implementation Team Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell projectName={projectName}>{children}</AppShell>
      </body>
    </html>
  );
}
