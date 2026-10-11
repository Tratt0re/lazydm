import { cva, type VariantProps } from 'class-variance-authority';

export const switchVariants = cva(
  'peer inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-none outline-none focus-visible:[&>span]:outline-2 focus-visible:[&>span]:outline-offset-2 focus-visible:[&>span]:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      arcType: {
        default: '',
        destructive: '',
      },
      arcSize: {
        default: 'size-11',
        sm: 'size-10',
        lg: 'h-11 w-13',
      },
    },
    defaultVariants: {
      arcType: 'default',
      arcSize: 'default',
    },
  },
);

export const switchTrackVariants = cva(
  'pointer-events-none inline-flex items-center rounded-none border border-input p-px transition-colors data-[state=unchecked]:bg-recessed',
  {
    variants: {
      arcType: {
        default: 'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        destructive: 'data-[state=checked]:border-destructive data-[state=checked]:bg-destructive',
      },
      arcSize: {
        default: 'h-6 w-11',
        sm: 'h-5 w-9',
        lg: 'h-7 w-13',
      },
    },
    defaultVariants: {
      arcType: 'default',
      arcSize: 'default',
    },
  },
);

export type ArcTechSwitchSizeVariants = NonNullable<VariantProps<typeof switchVariants>['arcSize']>;
export type ArcTechSwitchTypeVariants = NonNullable<VariantProps<typeof switchVariants>['arcType']>;
