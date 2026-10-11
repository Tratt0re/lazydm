import { cva, type VariantProps } from 'class-variance-authority';

export const commandVariants = cva(
  'flex h-full w-full flex-col overflow-hidden border border-input rounded-none bg-popover text-popover-foreground',
  {
    variants: {
      size: {
        sm: 'min-h-64',
        default: 'min-h-80',
        lg: 'min-h-96',
        xl: 'min-h-120',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export const commandInputVariants = cva(
  'flex h-11 w-full rounded-none bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {},
    defaultVariants: {},
  },
);

export const commandListVariants = cva('max-h-75 overflow-y-auto overflow-x-hidden p-1', {
  variants: {},
  defaultVariants: {},
});

export const commandEmptyVariants = cva('py-6 text-center text-sm text-muted-foreground', {
  variants: {},
  defaultVariants: {},
});

export const commandGroupVariants = cva('overflow-hidden text-foreground', {
  variants: {},
  defaultVariants: {},
});

export const commandGroupHeadingVariants = cva(
  'px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
  {
  variants: {},
  defaultVariants: {},
});

export const commandItemVariants = cva(
  'relative flex cursor-default select-none items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground aria-selected:shadow-[inset_3px_0_0_var(--primary)] data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
  {
    variants: {
      variant: {
        default: '',
        destructive:
          'aria-selected:bg-destructive aria-selected:text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export const commandSeparatorVariants = cva('-mx-1 my-1 h-px bg-border', {
  variants: {},
  defaultVariants: {},
});

export const commandShortcutVariants = cva('ml-auto text-xs tracking-widest text-muted-foreground', {
  variants: {},
  defaultVariants: {},
});

export type ArcTechCommandSizeVariants = NonNullable<VariantProps<typeof commandVariants>['size']>;
export type ArcTechCommandItemVariants = NonNullable<VariantProps<typeof commandItemVariants>['variant']>;
