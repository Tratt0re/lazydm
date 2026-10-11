import { cva, type VariantProps } from 'class-variance-authority';

export const sheetVariants = cva(
  'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex max-h-screen flex-col gap-4 overflow-hidden rounded-none border-primary shadow-[0_20px_65px_#0009] transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      arcSide: {
        right:
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 border-l-2',
        left: 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 border-r-2',
        top: 'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 border-b-2',
        bottom:
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 border-t-2',
      },
      arcSize: {
        default: '',
        sm: '',
        lg: '',
        custom: '',
      },
    },
    compoundVariants: [
      {
        arcSide: ['left', 'right'],
        arcSize: 'default',
        class: 'w-3/4 sm:max-w-sm h-full',
      },
      {
        arcSide: ['left', 'right'],
        arcSize: 'sm',
        class: 'w-1/2 sm:max-w-xs h-full',
      },
      {
        arcSide: ['left', 'right'],
        arcSize: 'lg',
        class: 'w-full sm:max-w-lg h-full',
      },
      {
        arcSide: ['top', 'bottom'],
        arcSize: 'default',
        class: 'h-auto',
      },
      {
        arcSide: ['top', 'bottom'],
        arcSize: 'sm',
        class: 'h-1/3',
      },
      {
        arcSide: ['top', 'bottom'],
        arcSize: 'lg',
        class: 'h-3/4',
      },
    ],
    defaultVariants: {
      arcSide: 'right',
      arcSize: 'default',
    },
  },
);
export type ArcTechSheetVariants = VariantProps<typeof sheetVariants>;
