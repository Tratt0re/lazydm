import { cva, type VariantProps } from 'class-variance-authority';

export const containerProgressBarVariants = cva('w-full transition-all', {
  variants: {
    arcType: {
      default: 'bg-primary/20',
      destructive: 'bg-destructive/20',
      accent: 'bg-chart-1/20',
    },
    arcSize: {
      default: 'h-2',
      sm: 'h-3',
      lg: 'h-5',
    },
    arcShape: {
      default: 'rounded-full',
      square: 'rounded-none',
    },
    arcIndeterminate: {
      true: 'relative',
    },
  },

  defaultVariants: {
    arcType: 'default',
    arcSize: 'default',
    arcShape: 'default',
  },
});
export type ArcTechProgressBarSizeVariants = NonNullable<VariantProps<typeof containerProgressBarVariants>['arcSize']>;

export const progressBarVariants = cva('h-full transition-all', {
  variants: {
    arcType: {
      default: 'bg-primary',
      destructive: 'bg-destructive',
      accent: 'bg-chart-1',
    },
    arcShape: {
      default: 'rounded-full',
      square: 'rounded-none',
    },
    arcIndeterminate: {
      true: 'absolute animate-[indeterminate_1.5s_infinite_ease-out]',
    },
  },
  defaultVariants: {
    arcType: 'default',
    arcShape: 'default',
  },
});
export type ArcTechProgressBarTypeVariants = NonNullable<VariantProps<typeof progressBarVariants>['arcType']>;
export type ArcTechProgressBarShapeVariants = NonNullable<VariantProps<typeof progressBarVariants>['arcShape']>;
