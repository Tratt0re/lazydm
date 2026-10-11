import { cva, type VariantProps } from 'class-variance-authority';

export const comboboxVariants = cva('', {
  variants: {
    arcWidth: {
      default: 'w-50',
      sm: 'w-37.5',
      md: 'w-62.5',
      lg: 'w-87.5',
      full: 'w-full',
    },
  },
  defaultVariants: {
    arcWidth: 'default',
  },
});

export type ArcTechComboboxWidthVariants = NonNullable<VariantProps<typeof comboboxVariants>['arcWidth']>;
