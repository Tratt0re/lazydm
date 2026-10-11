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
