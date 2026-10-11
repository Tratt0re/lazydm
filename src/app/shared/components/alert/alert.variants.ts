import { cva, type VariantProps } from 'class-variance-authority';

export const alertVariants = cva('relative w-full rounded-lg border px-4 py-3 text-sm flex items-center gap-3', {
  variants: {
    arcType: {
      default: 'bg-card text-card-foreground',
      destructive: 'text-destructive bg-card',
    },
  },
  defaultVariants: {
    arcType: 'default',
  },
});

export const alertIconVariants = cva('shrink-0 self-start text-base!');

export const alertTitleVariants = cva('font-medium tracking-tight leading-none');

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
