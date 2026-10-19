import { cva, type VariantProps } from 'class-variance-authority';

import { mergeClasses } from '@/shared/utils/merge-classes';

export const toastVariants = cva(
  mergeClasses(
    'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border',
    '[--ngx-sonner-border-radius:0px] [--ngx-sonner-font-family:var(--font-sans)]',
    '[--ngx-sonner-toast-normal-background:var(--popover)] [--ngx-sonner-toast-dark-normal-background:var(--popover)]',
    '[--ngx-sonner-toast-normal-border-color:var(--border-strong)] [--ngx-sonner-toast-dark-normal-border-color:var(--border-strong)]',
    '[--ngx-sonner-toast-normal-color:var(--popover-foreground)] [--ngx-sonner-toast-dark-normal-color:var(--popover-foreground)]',
  ),
  {
    variants: {
      variant: {
        default: 'group-[.toaster]:bg-background group-[.toaster]:text-foreground',
        destructive:
          'group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground destructive group-[.toaster]:border-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type ArcTechToastVariants = VariantProps<typeof toastVariants>;

/**
 * Nordic Relic notification banner: card surface, 1px border in the state colour, strong uppercase
 * title, muted mono description and a square close button on the right.
 */
export const toastClasses = {
  toast: mergeClasses(
    '!items-start !gap-3 !border !border-border-strong !bg-card !py-3.5 !pr-12 !pl-3.5 !text-card-foreground',
    '!shadow-overlay [&_[data-icon]]:mt-px',
  ),
  title: '!text-[12px] !font-bold !uppercase !tracking-[0.05em] !text-foreground-strong',
  description: '!mt-1 !font-mono !text-[11px] !leading-[1.5] !text-muted-foreground',
  closeButton: mergeClasses(
    '!top-1/2 !right-2.5 !left-auto ![transform:none] -translate-y-1/2',
    '!size-7 !rounded-none !border !border-border !bg-transparent',
    '!text-muted-foreground hover:!bg-accent hover:!text-foreground focus-visible:!outline-2 focus-visible:!outline-ring',
  ),
  actionButton: mergeClasses(
    '!h-7 !rounded-none !border !border-primary !bg-transparent !px-2.5 !font-mono !text-[11px]',
    '!font-semibold !tracking-[0.06em] !text-primary !uppercase hover:!bg-primary hover:!text-primary-foreground',
  ),
  success: '!border-success [&_[data-icon]]:text-success',
  error: '!border-destructive [&_[data-icon]]:text-destructive',
  warning: '!border-warning [&_[data-icon]]:text-warning',
  info: '!border-info [&_[data-icon]]:text-info',
} as const;
