import { cva, type VariantProps } from 'class-variance-authority';

export const checkboxVariants = cva(
  'cursor-[unset] peer appearance-none border bg-recessed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      arcType: {
        default: 'border-input hover:border-primary checked:border-primary checked:bg-primary',
        destructive: 'border-destructive checked:bg-destructive',
      },
      arcSize: {
        default: 'size-4',
        lg: 'size-6',
      },
      arcShape: {
        default: 'rounded-none',
        circle: 'rounded-full',
        square: 'rounded-none',
      },
    },
    defaultVariants: {
      arcType: 'default',
      arcSize: 'default',
      arcShape: 'default',
    },
  },
);

export const checkboxLabelVariants = cva('cursor-[unset] text-current empty:hidden select-none', {
  variants: {
    arcSize: {
      default: 'text-base',
      lg: 'text-lg',
    },
  },
  defaultVariants: {
    arcSize: 'default',
  },
});

export type ArcTechCheckboxShapeVariants = NonNullable<VariantProps<typeof checkboxVariants>['arcShape']>;
export type ArcTechCheckboxSizeVariants = NonNullable<VariantProps<typeof checkboxVariants>['arcSize']>;
export type ArcTechCheckboxTypeVariants = NonNullable<VariantProps<typeof checkboxVariants>['arcType']>;
