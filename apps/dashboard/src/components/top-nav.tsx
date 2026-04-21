'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Settings, Package } from 'lucide-react';

import { SettingsDrawer } from '@/components/settings-drawer';
import { useInboxBadge } from '@/hooks/use-inbox-badge';
import { useProject } from '@/hooks/use-project';

interface TopNavProps {
  /** Env fallback. Current masthead reads project.name from useProject(). Kept for compat. */
  projectName?: string;
}

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/cycles', label: 'Cycles' },
  { href: '/milestones', label: 'Milestones' },
  { href: '/rooms', label: 'Rooms' },
  { href: '/assets', label: 'Assets' },
];

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}·${mm}·${dd}`;
}

export function TopNav(_props: TopNavProps) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { count: inboxCount } = useInboxBadge();
  const { state: projectState } = useProject();

  const toggleSettings = useCallback(() => setSettingsOpen((v) => !v), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘, / Ctrl+, → toggle settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        toggleSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSettings]);

  const today = formatDate(new Date());
  const projectLabel = projectState.loaded
    ? (projectState.config?.name ?? projectState.config?.id ?? 'project')
    : 'no project';

  return (
    <>
      {/* ── Masthead ─────────────────────────────────────────── */}
      <header className="border-b border-[var(--rule-strong)]">
        <div className="max-w-[1280px] mx-auto px-6 py-4 flex items-end justify-between gap-6">
          <div className="flex items-baseline gap-4 min-w-0">
            <Link
              href="/"
              className="font-display text-[28px] font-medium leading-none text-[var(--ink)] hover:no-underline"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
            >
              Harness
              <span
                className="italic"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--burgundy)' }}
              >
                .
              </span>
            </Link>
            <div className="text-kicker hidden sm:flex items-center gap-4 text-[var(--muted-foreground)]">
              <span>VOL. I</span>
              <span>·</span>
              <button
                type="button"
                onClick={toggleSettings}
                title={
                  projectState.loaded
                    ? `Project: ${projectLabel}${projectState.source ? `\n${projectState.source}` : ''}`
                    : (projectState.error ?? 'No project — click to setup')
                }
                className={`inline-flex items-center gap-1 hover:text-[var(--ink)] transition-colors ${
                  projectState.loaded ? 'text-[var(--burgundy)]' : 'text-[var(--oxblood)]'
                }`}
              >
                <Package className="size-3" />
                <span>PROJECT: {projectLabel.toUpperCase()}</span>
              </button>
              <span>·</span>
              <span>{today}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleSettings}
            className="text-kicker text-[var(--muted-foreground)] hover:text-[var(--ink)] transition-colors inline-flex items-center gap-1.5"
            aria-label="Open settings"
            title="Settings (⌘,)"
          >
            <Settings className="size-3.5" />
            <span className="hidden sm:inline">SETTINGS</span>
          </button>
        </div>

        {/* ── Nav strip ───────────────────────────────────── */}
        <div className="max-w-[1280px] mx-auto px-6 py-3 border-t border-[var(--rule)] flex items-center gap-6">
          {NAV_ITEMS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`text-meta no-underline transition-colors ${
                  active
                    ? 'text-[var(--burgundy)]'
                    : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                }`}
                style={
                  active
                    ? { textDecoration: 'underline', textUnderlineOffset: '6px' }
                    : undefined
                }
              >
                {label}
              </Link>
            );
          })}

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/inbox"
              className="relative inline-flex items-center gap-1.5 text-meta no-underline text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
              aria-label={`Inbox${inboxCount > 0 ? ` (${inboxCount} unread)` : ''}`}
            >
              <Bell className="size-3.5" />
              <span className="hidden sm:inline">INBOX</span>
              {inboxCount > 0 && (
                <span
                  className="text-mono text-[10px] font-semibold px-2 py-[1px] rounded-full border"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--burgundy)',
                    borderColor: 'var(--burgundy)',
                    background:
                      'color-mix(in oklch, var(--burgundy) 6%, var(--surface))',
                  }}
                >
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
