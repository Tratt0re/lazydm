import { cva, type VariantProps } from 'class-variance-authority';

export const dividerVariants = cva('bg-border block', {
  variants: {
    arcOrientation: {
      horizontal: 'h-px w-full',
      vertical: 'w-px h-full inline-block',
    },
    arcSpacing: {
      none: '',
      sm: '',
      default: '',
      lg: '',
    },
  },
  defaultVariants: {
    arcOrientation: 'horizontal',
    arcSpacing: 'default',
  },
  compoundVariants: [
    {
      arcOrientation: 'horizontal',
      arcSpacing: 'sm',
      class: 'my-2',
    },
    {
      arcOrientation: 'horizontal',
      arcSpacing: 'default',
      class: 'my-4',
    },
    {
      arcOrientation: 'horizontal',
      arcSpacing: 'lg',
      class: 'my-8',
    },
    {
      arcOrientation: 'vertical',
      arcSpacing: 'sm',
      class: 'mx-2',
    },
    {
      arcOrientation: 'vertical',
      arcSpacing: 'default',
      class: 'mx-4',
    },
    {
      arcOrientation: 'vertical',
      arcSpacing: 'lg',
      class: 'mx-8',
    },
  ],
});

export type ArcTechDividerVariants = VariantProps<typeof dividerVariants>;
