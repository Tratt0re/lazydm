import { cva, type VariantProps } from 'class-variance-authority';

export const dialogVariants = cva(
  'fixed left-[50%] top-[50%] z-50 flex w-full max-h-[calc(100dvh-120px)] translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-hidden rounded-none border-2 border-primary bg-popover text-popover-foreground p-6 shadow-[0_20px_65px_#0009] max-w-[calc(100dvw-120px)] sm:max-w-[425px]',
);
export type ArcTechDialogVariants = VariantProps<typeof dialogVariants>;
