import { Badge } from '@/components/ui/badge';
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

const variantStyles: Record<StatusVariant, string> = {
  success: 'bg-success/15 text-success border-success/20',
  warning: 'bg-warning/15 text-warning border-warning/20',
  destructive: 'bg-destructive/15 text-destructive border-destructive/20',
  info: 'bg-primary/15 text-primary border-primary/20',
  muted: 'bg-muted text-muted-foreground border-border',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = statusMap[status] ?? 'muted';
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md font-mono text-[10px] uppercase tracking-wider',
        variantStyles[variant],
        className
      )}
    >
      {status}
    </Badge>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-success text-[10px] font-bold tracking-wide',
        className
      )}
    >
      <span
        className="inline-block size-1.5 rounded-full bg-success"
        style={{ animation: 'pulse-dot 1.4s ease-in-out infinite' }}
      />
      LIVE
    </span>
  );
}
