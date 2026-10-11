import { cva, type VariantProps } from 'class-variance-authority';

export const loaderVariants = cva('', {
  variants: {
    arcSize: {
      default: 'size-6',
      sm: 'size-4',
      lg: 'size-8',
    },
  },
  defaultVariants: {
    arcSize: 'default',
  },
});
export type ArcTechLoaderVariants = VariantProps<typeof loaderVariants>;
