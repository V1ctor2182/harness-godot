import './globals.css';
import { TopNav } from '@/components/top-nav';

const projectName = process.env.NEXT_PUBLIC_PROJECT_NAME ?? 'AI Team';

export const metadata = {
  title: `${projectName} — Dashboard`,
  description: 'AI Implementation Team Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav projectName={projectName} />
        <main className="max-w-[1400px] mx-auto p-4">{children}</main>
      </body>
    </html>
  );
}
