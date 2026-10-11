import { cva, type VariantProps } from 'class-variance-authority';

export const formFieldVariants = cva('grid gap-2');

export const formLabelVariants = cva(
  'text-xs font-semibold uppercase tracking-[0.08em] leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  {
    variants: {
      arcRequired: {
        true: "after:content-['*'] after:ml-0.5 after:text-destructive",
      },
    },
  },
);

export const formControlVariants = cva('');

export const formMessageVariants = cva('text-sm', {
  variants: {
    arcType: {
      default: 'text-muted-foreground',
      error: 'text-destructive',
      success: 'text-success',
      warning: 'text-warning',
    },
  },
  defaultVariants: {
    arcType: 'default',
  },
});

export type ArcTechFormMessageTypeVariants = NonNullable<VariantProps<typeof formMessageVariants>['arcType']>;
