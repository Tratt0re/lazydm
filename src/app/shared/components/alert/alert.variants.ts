import { cva, type VariantProps } from 'class-variance-authority';

export const alertVariants = cva(
  'relative w-full rounded-none border border-border border-l-[3px] px-4 py-3 text-sm flex items-center gap-3',
  {
    variants: {
      arcType: {
        default: 'border-l-primary bg-raised text-card-foreground [&>[data-slot=alert-icon]]:text-primary',
        destructive: 'border-l-destructive bg-card text-destructive',
      },
    },
    defaultVariants: {
      arcType: 'default',
    },
  },
);

export const alertIconVariants = cva('shrink-0 self-start text-base!');

export const alertTitleVariants = cva('text-xs font-bold uppercase tracking-[0.1em] leading-none');

export const alertDescriptionVariants = cva('text-sm leading-relaxed mt-1', {
  variants: {
    arcType: {
      default: 'text-muted-foreground',
      destructive: 'text-destructive/90',
    },
  },
  defaultVariants: {
    arcType: 'default',
  },
});

export type ArcTechAlertTypeVariants = NonNullable<VariantProps<typeof alertVariants>['arcType']>;
