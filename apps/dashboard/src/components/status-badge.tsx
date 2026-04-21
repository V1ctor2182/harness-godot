import { cn } from '@/lib/utils';

type StatusVariant = 'success' | 'warning' | 'destructive' | 'info' | 'muted';

const statusMap: Record<string, StatusVariant> = {
  // Cycle/agent statuses
  active: 'success',
  completed: 'info',
  running: 'info',
  starting: 'info',
  failed: 'destructive',
  timeout: 'destructive',
  killed: 'destructive',
  paused: 'warning',
  // Task statuses
  done: 'success',
  'in-progress': 'info',
  'in-review': 'warning',
  blocked: 'destructive',
  ready: 'muted',
  backlog: 'muted',
  pending: 'muted',
  // Phase
  plan: 'muted',
  implement: 'info',
  review: 'warning',
  integrate: 'info',
  retrospect: 'warning',
  // Approval
  approved: 'success',
  rejected: 'destructive',
  'changes-requested': 'destructive',
};

// Editorial Workbench palette: pills, not squares; burgundy/forest/oxblood/mustard
const variantStyles: Record<StatusVariant, React.CSSProperties> = {
  success: {
    background: 'color-mix(in oklch, var(--forest) 12%, transparent)',
    color: 'var(--forest)',
    borderColor: 'color-mix(in oklch, var(--forest) 30%, transparent)',
  },
  warning: {
    background: 'color-mix(in oklch, var(--mustard) 18%, transparent)',
    color: 'color-mix(in oklch, var(--mustard) 70%, var(--ink))',
    borderColor: 'color-mix(in oklch, var(--mustard) 40%, transparent)',
  },
  destructive: {
    background: 'color-mix(in oklch, var(--oxblood) 12%, transparent)',
    color: 'var(--oxblood)',
    borderColor: 'color-mix(in oklch, var(--oxblood) 30%, transparent)',
  },
  info: {
    background: 'color-mix(in oklch, var(--burgundy) 10%, transparent)',
    color: 'var(--burgundy)',
    borderColor: 'color-mix(in oklch, var(--burgundy) 25%, transparent)',
  },
  muted: {
    background: 'var(--surface)',
    color: 'var(--muted-foreground)',
    borderColor: 'var(--rule-strong)',
  },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = statusMap[status] ?? 'muted';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap',
        className
      )}
      style={variantStyles[variant]}
    >
      {status}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.1em] live-pulse',
        className
      )}
      style={{ color: 'var(--burgundy)' }}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ background: 'var(--burgundy)' }}
      />
      LIVE
    </span>
  );
}
