import { cva, type VariantProps } from 'class-variance-authority';

export const dialogVariants = cva(
  'fixed left-[50%] top-[50%] z-50 flex w-full max-h-[calc(100dvh-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-hidden rounded-none border-2 border-border-strong bg-card text-card-foreground p-6 shadow-modal max-w-[calc(100dvw-2rem)] sm:max-w-[425px] transition-[max-width,height] duration-200 ease-out motion-reduce:transition-none',
);
export type ArcTechDialogVariants = VariantProps<typeof dialogVariants>;
