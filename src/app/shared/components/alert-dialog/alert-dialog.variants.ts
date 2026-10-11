import { cva, type VariantProps } from 'class-variance-authority';

export const alertDialogVariants = cva(
  'fixed z-50 w-full max-w-[calc(100%-2rem)] overflow-hidden border-2 border-border-strong bg-card text-card-foreground shadow-[0_20px_75px_#0008] rounded-none sm:max-w-lg',
);

export type ArcTechAlertDialogVariants = VariantProps<typeof alertDialogVariants>;
