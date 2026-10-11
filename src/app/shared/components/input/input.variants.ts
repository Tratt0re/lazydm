import { cva, type VariantProps } from 'class-variance-authority';

export type arcInputIcon = 'email' | 'password' | 'text';

export const inputVariants = cva('w-full', {
  variants: {
    arcType: {
      default:
        'flex rounded-md border px-4 font-normal border-input bg-transparent file:border-0 file:text-foreground file:bg-transparent file:font-medium placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
      textarea:
        'flex pb-2 min-h-20 h-auto rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
    },
    arcSize: {
      default: 'text-sm',
      sm: 'text-xs',
      lg: 'text-base',
    },
    arcStatus: {
      error: 'border-destructive focus-visible:ring-destructive',
      warning: 'border-warning focus-visible:ring-warning',
      success: 'border-success focus-visible:ring-success',
    },
    arcBorderless: {
      true: 'flex-1 bg-transparent border-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-0',
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
