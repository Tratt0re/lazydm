import { cva, type VariantProps } from 'class-variance-authority';

export const accordionVariants = cva('grid w-full', {
  variants: {},
  defaultVariants: {},
});

export const accordionItemVariants = cva('border-b border-border flex flex-1 flex-col', {
  variants: {},
  defaultVariants: {},
});

export const accordionTriggerVariants = cva(
  'cursor-pointer group flex flex-1 items-start justify-between gap-4 rounded-none py-4 text-left text-sm font-semibold uppercase tracking-[0.06em] transition-colors outline-none hover:text-primary focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 w-full',
  {
    variants: {},
    defaultVariants: {},
  },
);

export const accordionContentVariants = cva('grid text-sm transition-all', {
  variants: {
    isOpen: {
      true: 'grid-rows-[1fr]',
      false: 'grid-rows-[0fr]',
    },
  },
  defaultVariants: {
    isOpen: false,
  },
});

export type ArcTechAccordionVariants = VariantProps<typeof accordionVariants>;
export type ArcTechAccordionItemVariants = VariantProps<typeof accordionItemVariants>;
export type ArcTechAccordionTriggerVariants = VariantProps<typeof accordionTriggerVariants>;
export type ArcTechAccordionContentVariants = VariantProps<typeof accordionContentVariants>;
