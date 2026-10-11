import { cva, type VariantProps } from 'class-variance-authority';

export const popoverVariants = cva(
  'z-50 w-72 rounded-none border border-border-strong bg-popover p-4 text-popover-foreground shadow-[0_12px_25px_#0005] outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
);

export type ArcTechPopoverVariants = VariantProps<typeof popoverVariants>;
