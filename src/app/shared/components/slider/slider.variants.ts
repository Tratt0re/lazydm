import { cva, type VariantProps } from 'class-variance-authority';

export const sliderVariants = cva(
  'relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
  {
    variants: {
      orientation: {
        horizontal: 'items-center',
        vertical: 'flex-col h-full min-h-44 w-auto',
      },
      disabled: {
        true: 'opacity-50 pointer-events-none',
        false: '',
      },
    },
    defaultVariants: {
      orientation: 'horizontal',
      disabled: false,
    },
  },
);

export type SliderVariants = VariantProps<typeof sliderVariants>;

export const sliderTrackVariants = cva(
  'flex bg-muted relative grow overflow-hidden rounded-none data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
  {
    variants: {
      arcOrientation: {
        horizontal: 'h-1.5 w-full',
        vertical: 'w-1.5 h-full min-h-44',
      },
    },
    defaultVariants: {
      arcOrientation: 'horizontal',
    },
  },
);

export type SliderTrackVariants = VariantProps<typeof sliderTrackVariants>;

export const sliderRangeVariants = cva(
  'bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
  {
    variants: {
      arcOrientation: {
        horizontal: 'h-full',
        vertical: 'w-full',
      },
    },
    defaultVariants: {
      arcOrientation: 'horizontal',
    },
  },
);

export type SliderRangeVariants = VariantProps<typeof sliderRangeVariants>;

export const sliderThumbVariants = cva(
  'border-primary bg-background block size-3.5 shrink-0 rotate-45 rounded-none border-2 transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      disabled: {
        true: '',
        false: 'hover:bg-primary',
      },
    },
  },
);

export type SliderThumbVariants = VariantProps<typeof sliderThumbVariants>;

export const sliderOrientationVariants = cva('absolute', {
  variants: {
    arcOrientation: {
      horizontal: 'translate-x-[-50%]',
      vertical: 'translate-y-[50%]',
    },
  },
  defaultVariants: {
    arcOrientation: 'horizontal',
  },
});

export type SliderOrientationVariants = VariantProps<typeof sliderOrientationVariants>;
