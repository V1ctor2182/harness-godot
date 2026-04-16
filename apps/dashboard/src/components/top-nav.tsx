'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { Bell, Settings, LayoutDashboard, RefreshCw, Milestone, FolderTree, Palette, Package } from 'lucide-react';

import { SettingsDrawer } from '@/components/settings-drawer';
import { useInboxBadge } from '@/hooks/use-inbox-badge';
import { useProject } from '@/hooks/use-project';

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
  const { state: projectState } = useProject();

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

        {/* Project badge — shows currently loaded project or "no project". */}
        <button
          type="button"
          onClick={toggleSettings}
          title={
            projectState.loaded
              ? `Project: ${projectState.config?.name ?? projectState.config?.id}${projectState.source ? `\n${projectState.source}` : ''}`
              : projectState.error ?? 'No project loaded — set PROJECT_REPO_LOCAL_PATH'
          }
          className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border transition-colors ${
            projectState.loaded
              ? 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10'
              : 'border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10'
          }`}
        >
          <Package className="size-3" />
          {projectState.loaded
            ? (projectState.config?.name ?? projectState.config?.id ?? 'project')
            : 'no project'}
        </button>

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
