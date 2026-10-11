import { cva, type VariantProps } from 'class-variance-authority';

export const segmentedVariants = cva(
  'relative inline-flex items-stretch justify-center rounded-none border border-input bg-card p-0 text-muted-foreground',
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
  'relative z-10 inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-none border-r border-input last:border-r-0 px-3 py-1.5 text-sm font-medium uppercase tracking-[0.08em] transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      arcSize: {
        sm: 'px-2 py-1 text-xs',
        default: 'px-3 py-1.5 text-sm',
        lg: 'px-4 py-2 text-base',
      },
      isActive: {
        true: 'text-primary-foreground font-bold',
        false: 'text-muted-foreground hover:bg-accent hover:text-foreground',
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
