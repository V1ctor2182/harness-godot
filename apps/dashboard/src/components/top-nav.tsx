'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { Bell, Settings, LayoutDashboard, RefreshCw, Milestone, FolderTree, Palette } from 'lucide-react';

import { SettingsDrawer } from '@/components/settings-drawer';
import { useInboxBadge } from '@/hooks/use-inbox-badge';

interface TopNavProps {
  projectName: string;
}

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/cycles', label: 'Cycles', icon: RefreshCw },
  { href: '/milestones', label: 'Milestones', icon: Milestone },
  { href: '/rooms', label: 'Rooms', icon: FolderTree },
  { href: '/assets', label: 'Assets', icon: Palette },
];

export function TopNav({ projectName }: TopNavProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { count: inboxCount } = useInboxBadge();

  const toggleSettings = useCallback(() => setSettingsOpen((v) => !v), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Cmd+, (macOS) / Ctrl+, (others) → toggle settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        toggleSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSettings]);

  return (
    <>
      <nav className="border-b border-border px-4 py-3 flex items-center gap-6">
        <span className="text-sm font-bold tracking-tight text-foreground">{projectName}</span>

        <div className="flex items-center gap-5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors no-underline"
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/inbox"
            className="relative flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors no-underline"
            aria-label={`Inbox${inboxCount > 0 ? ` (${inboxCount} unread)` : ''}`}
          >
            <Bell className="size-4" />
            {inboxCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center leading-none">
                {inboxCount > 99 ? '99+' : inboxCount}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={toggleSettings}
            className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open settings"
            title="Settings (⌘,)"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </nav>

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
