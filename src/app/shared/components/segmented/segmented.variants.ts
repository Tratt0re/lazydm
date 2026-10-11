import { cva, type VariantProps } from 'class-variance-authority';

export const segmentedVariants = cva(
  'relative inline-flex items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
  {
    variants: {
      arcSize: {
        sm: 'h-9 text-xs',
        default: 'h-10 text-sm',
        lg: 'h-12 text-base',
      },
    },
    defaultVariants: {
      arcSize: 'default',
    },
  },
);

export const segmentedItemVariants = cva(
  'relative z-10 inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      arcSize: {
        sm: 'px-2 py-1 text-xs',
        default: 'px-3 py-1.5 text-sm',
        lg: 'px-4 py-2 text-base',
      },
      isActive: {
        true: 'text-foreground',
        false: 'text-muted-foreground hover:text-foreground',
      },
    },
    defaultVariants: {
      arcSize: 'default',
      isActive: false,
    },
  },
);

export type ArcTechSegmentedVariants = VariantProps<typeof segmentedVariants>;
export type ArcTechSegmentedItemVariants = VariantProps<typeof segmentedItemVariants>;
