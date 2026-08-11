import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
        outline: 'text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Maps a domain status to a badge variant, so status colours stay consistent. */
export function statusVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'PUBLISHED':
    case 'CONVERTED':
      return 'success';
    case 'PENDING':
    case 'PENDING_REVIEW':
    case 'PENDING_PAYMENT':
    case 'TRIALING':
    case 'NEW':
      return 'warning';
    case 'REJECTED':
    case 'SUSPENDED':
    case 'EXPIRED':
    case 'CANCELED':
    case 'LOST':
      return 'destructive';
    default:
      return 'muted';
  }
}

export { Badge, badgeVariants };
