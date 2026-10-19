import { cva, type VariantProps } from 'class-variance-authority';

export const menuContentVariants = cva([
  'z-50 min-w-32 overflow-hidden rounded-none border border-primary bg-popover p-1 text-popover-foreground',
  'shadow-overlay animate-in data-[state=open]:animate-in data-[state=closed]:animate-out',
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95',
  'data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
  'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
]);

export const menuItemVariants = cva(
  [
    'relative flex w-full cursor-default select-none items-center gap-2 rounded-none px-2.5 py-2',
    'font-mono text-[11px] font-semibold tracking-[0.04em] outline-none transition-colors duration-150',
    'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
    '[&>arc-icon]:size-3.5 [&>arc-icon]:shrink-0 [&>arc-icon]:text-muted-foreground',
    'hover:[&>arc-icon]:text-primary focus:[&>arc-icon]:text-primary',
    'data-disabled:pointer-events-none data-disabled:opacity-50 text-left',
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
  'relative flex items-center px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
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

export const menuShortcutVariants = cva(
  'ml-auto pl-4 font-mono text-[11px] font-medium tracking-[0.04em] text-muted-foreground',
);

export type ArcTechMenuItemTypeVariants = NonNullable<VariantProps<typeof menuItemVariants>['arcType']>;
