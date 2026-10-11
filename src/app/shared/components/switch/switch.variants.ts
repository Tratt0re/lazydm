import { cva, type VariantProps } from 'class-variance-authority';

export const switchVariants = cva(
  'peer inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
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
  'pointer-events-none inline-flex items-center rounded-full border-2 border-transparent transition-colors data-[state=unchecked]:bg-input',
  {
    variants: {
      arcType: {
        default: 'data-[state=checked]:bg-primary',
        destructive: 'data-[state=checked]:bg-destructive',
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
