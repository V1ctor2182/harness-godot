import './globals.css';
import Link from 'next/link';
import {
  LayoutDashboard,
  RefreshCw,
  ListTodo,
  Bot,
  BookOpen,
  ShieldCheck,
  Settings,
  BarChart2,
  Milestone,
  FlaskConical,
  Palette,
} from 'lucide-react';

export const metadata = {
  title: 'Zombie Farm — AI Team',
  description: 'AI Implementation Team for Godot game development',
};

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/milestones', label: 'Milestones', icon: Milestone },
  { href: '/cycles', label: 'Cycles', icon: RefreshCw },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/tests', label: 'Tests', icon: FlaskConical },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/assets', label: 'Assets', icon: Palette },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/review', label: 'Review', icon: ShieldCheck },
  { href: '/control', label: 'Control', icon: Settings },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-border px-4 py-3 flex items-center gap-6">
          <span className="text-sm font-bold tracking-tight text-foreground">🧟 Zombie Farm</span>
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
