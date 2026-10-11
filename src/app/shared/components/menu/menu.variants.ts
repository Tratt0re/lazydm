import { cva, type VariantProps } from 'class-variance-authority';

export const menuContentVariants = cva([
  'z-50 min-w-32 overflow-hidden rounded-none border border-input bg-popover p-1 text-popover-foreground',
  'shadow-[0_12px_40px_#0007] animate-in data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95',
  'data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
  'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
]);

export const menuItemVariants = cva(
  [
    'relative flex w-full cursor-default select-none items-center rounded-none px-2 py-1.5',
    'text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
    'focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none',
    'data-disabled:opacity-50 text-left [&>i]:mr-2 [&>arc-icon]:mr-2',
  ],
  {
    variants: {
      inset: {
        true: 'pl-8',
        false: '',
      },
      arcType: {
        default: '',
        destructive: 'text-destructive',
      },
    },
    defaultVariants: {
      inset: false,
    },
  },
);

export const submenuArrowVariants = cva([
  'ml-auto opacity-60 transition-opacity duration-150',
  'text-muted-foreground',
  'group-hover:opacity-100 group-focus:opacity-100',
]);

export const menuLabelVariants = cva(
  'relative flex items-center px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
  {
    variants: {
      inset: {
        true: 'pl-8',
        false: '',
      },
    },
    defaultVariants: {
      inset: false,
    },
  },
);

export const menuShortcutVariants = cva('ml-auto text-xs tracking-widest text-muted-foreground');

export type ArcTechMenuItemTypeVariants = NonNullable<VariantProps<typeof menuItemVariants>['arcType']>;
