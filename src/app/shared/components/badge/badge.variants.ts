import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center justify-center border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive transition-colors overflow-hidden',
  {
    variants: {
      arcType: {
        default: 'border-primary bg-primary text-primary-foreground [a&]:hover:brightness-110 h-5',
        secondary: 'border-input bg-secondary text-secondary-foreground [a&]:hover:bg-accent h-5',
        destructive:
          'border-destructive bg-transparent text-destructive [a&]:hover:bg-destructive [a&]:hover:text-destructive-foreground h-5',
        filter: 'h-6 border-input bg-muted text-foreground px-2 pr-1',
        outline: 'border-primary text-primary [a&]:hover:bg-primary [a&]:hover:text-primary-foreground',
      },
      arcShape: {
        default: 'rounded-none',
        square: 'rounded-none',
        pill: 'rounded-full',
      },
    },
    defaultVariants: {
      arcType: 'default',
      arcShape: 'default',
    },
  },
);

export type ArcTechBadgeTypeVariants = NonNullable<VariantProps<typeof badgeVariants>['arcType']>;
export type ArcTechBadgeShapeVariants = NonNullable<VariantProps<typeof badgeVariants>['arcShape']>;
