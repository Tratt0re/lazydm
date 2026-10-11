import { cva, type VariantProps } from 'class-variance-authority';

export type arcInputIcon = 'email' | 'password' | 'text';

export const inputVariants = cva('w-full', {
  variants: {
    arcType: {
      default:
        'flex rounded-none border px-3 font-normal border-input bg-background file:border-0 file:text-foreground file:bg-transparent file:font-medium placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
      textarea:
        'flex pb-2 min-h-20 h-auto rounded-none border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
    },
    arcSize: {
      default: 'text-sm',
      sm: 'text-xs',
      lg: 'text-base',
    },
    arcStatus: {
      error: 'border-destructive focus-visible:border-destructive focus-visible:outline-destructive',
      warning: 'border-warning focus-visible:border-warning focus-visible:outline-warning',
      success: 'border-success focus-visible:border-success focus-visible:outline-success',
    },
    arcBorderless: {
      true: 'flex-1 bg-transparent border-0 outline-none focus-visible:outline-0 px-0 py-0',
    },
  },
  defaultVariants: {
    arcType: 'default',
    arcSize: 'default',
  },
  compoundVariants: [
    { arcType: 'default', arcSize: 'default', class: 'h-9 py-2 file:max-md:py-0' },
    { arcType: 'default', arcSize: 'sm', class: 'h-8 file:md:py-2 file:max-md:py-1.5' },
    { arcType: 'default', arcSize: 'lg', class: 'h-10 py-1 file:md:py-3 file:max-md:py-2.5' },
  ],
});

export type ArcTechInputTypeVariants = NonNullable<VariantProps<typeof inputVariants>['arcType']>;
export type ArcTechInputSizeVariants = NonNullable<VariantProps<typeof inputVariants>['arcSize']>;
export type ArcTechInputStatusVariants = NonNullable<VariantProps<typeof inputVariants>['arcStatus']>;
