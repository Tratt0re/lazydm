import { cva, type VariantProps } from 'class-variance-authority';

import { mergeClasses } from '@/shared/utils/merge-classes';

export const buttonVariants = cva(
  mergeClasses(
    'cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border text-xs font-semibold uppercase tracking-[0.04em] transition-colors duration-150 active:brightness-95',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring',
    'aria-invalid:border-destructive aria-invalid:outline-destructive',
  ),
  {
    variants: {
      arcType: {
        default: 'border-primary bg-primary text-primary-foreground hover:border-highlight hover:bg-highlight active:bg-primary-pressed',
        destructive:
          'border-destructive bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:outline-destructive',
        outline: 'border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
        secondary: 'border-input bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'border-transparent hover:bg-accent hover:text-accent-foreground',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
      },
      arcSize: {
        default: 'h-10 px-4 py-2 data-icon-only:size-10 data-icon-only:p-0',
        sm: 'h-10 gap-1.5 px-3.5 data-icon-only:size-10 data-icon-only:p-0',
        lg: 'h-11 px-6 data-icon-only:size-11 data-icon-only:p-0',
      },
      arcShape: {
        default: 'rounded-none',
        circle: 'rounded-full',
        square: 'rounded-none',
      },
      arcFull: {
        true: 'w-full',
      },
      arcLoading: {
        true: 'opacity-50 pointer-events-none',
      },
      arcDisabled: {
        true: 'pointer-events-none opacity-50',
      },
    },
    defaultVariants: {
      arcType: 'default',
      arcSize: 'default',
      arcShape: 'default',
    },
  },
);
export type ArcTechButtonShapeVariants = NonNullable<VariantProps<typeof buttonVariants>['arcShape']>;
export type ArcTechButtonSizeVariants = NonNullable<VariantProps<typeof buttonVariants>['arcSize']>;
export type ArcTechButtonTypeVariants = NonNullable<VariantProps<typeof buttonVariants>['arcType']>;
