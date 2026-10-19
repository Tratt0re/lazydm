import { cva, type VariantProps } from 'class-variance-authority';

export const containerProgressBarVariants = cva('w-full', {
  variants: {
    arcType: {
      default: 'border border-input bg-recessed',
      destructive: 'border border-input bg-recessed',
      accent: 'border border-input bg-recessed',
    },
    arcSize: {
      default: 'h-2',
      sm: 'h-3',
      lg: 'h-5',
    },
    arcShape: {
      default: 'rounded-none',
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
export type ArcTechProgressBarSizeVariants = NonNullable<
  VariantProps<typeof containerProgressBarVariants>['arcSize']
>;

export const progressBarVariants = cva('h-full transition-[width] duration-200 ease-out motion-reduce:transition-none', {
  variants: {
    arcType: {
      default: 'bg-primary',
      destructive: 'bg-destructive',
      accent: 'bg-chart-1',
    },
    arcShape: {
      default: 'rounded-none',
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
export type ArcTechProgressBarTypeVariants = NonNullable<
  VariantProps<typeof progressBarVariants>['arcType']
>;
export type ArcTechProgressBarShapeVariants = NonNullable<
  VariantProps<typeof progressBarVariants>['arcShape']
>;
