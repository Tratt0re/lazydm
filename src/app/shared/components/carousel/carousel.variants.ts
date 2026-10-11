import { cva, type VariantProps } from 'class-variance-authority';

export const carouselVariants = cva('overflow-hidden', {
  variants: {
    arcOrientation: {
      horizontal: '',
      vertical: 'h-full',
    },
    arcControls: {
      none: '',
      button: '',
      dot: '',
    },
  },
  defaultVariants: {
    arcOrientation: 'horizontal',
  },
});

export const carouselContentVariants = cva('flex', {
  variants: {
    arcOrientation: {
      horizontal: '-ml-4 mr-0.5',
      vertical: '-mt-4 flex-col',
    },
  },
  defaultVariants: {
    arcOrientation: 'horizontal',
  },
});

export const carouselItemVariants = cva('min-w-0 shrink-0 grow-0 basis-full', {
  variants: {
    arcOrientation: {
      horizontal: 'pl-4',
      vertical: 'pt-5',
    },
  },
  defaultVariants: {
    arcOrientation: 'horizontal',
  },
});

export const carouselPreviousButtonVariants = cva('absolute size-8 rounded-none', {
  variants: {
    arcOrientation: {
      horizontal: 'top-1/2 -left-12.5 -translate-y-1/2',
      vertical: '-top-12 left-1/2 -translate-x-1/2 rotate-90',
    },
  },
  defaultVariants: {
    arcOrientation: 'horizontal',
  },
});

export const carouselNextButtonVariants = cva('absolute size-8 rounded-none', {
  variants: {
    arcOrientation: {
      horizontal: 'top-1/2 -right-12 -translate-y-1/2',
      vertical: '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
    },
  },
  defaultVariants: {
    arcOrientation: 'horizontal',
  },
});

export type ArcTechCarouselOrientationVariants = NonNullable<VariantProps<typeof carouselVariants>['arcOrientation']>;
export type ArcTechCarouselControlsVariants = NonNullable<VariantProps<typeof carouselVariants>['arcControls']>;
