import './globals.css';
import Link from 'next/link';
import {
  LayoutDashboard,
  RefreshCw,
  ListTodo,
  Bot,
  Layers,
  BookOpen,
  ShieldCheck,
  Settings,
  BarChart2,
} from 'lucide-react';

export const metadata = {
  title: 'Erika Dashboard',
  description: 'Self-improving agentic development team',
};

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cycles', label: 'Cycles', icon: RefreshCw },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/jobs', label: 'Jobs', icon: Layers },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/review', label: 'Review', icon: ShieldCheck },
  { href: '/control', label: 'Control', icon: Settings },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-border px-4 py-3 flex items-center gap-6">
          <span className="text-sm font-bold tracking-tight text-foreground">Erika</span>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors no-underline"
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          ))}
        </nav>
        <main className="max-w-[1400px] mx-auto p-4">{children}</main>
      </body>
    </html>
  );
}
