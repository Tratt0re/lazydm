import { cva } from 'class-variance-authority';

/** The value at rest: whatever is projected, with a hairline outline on hover and focus that says it can be typed. */
export const inlineValueButtonVariants = cva(
  'relative inline-flex min-w-0 max-w-full cursor-text items-center text-left outline-offset-2 hover:outline hover:outline-1 hover:outline-primary/60 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:hover:outline-none',
);

/** The field it turns into while it is typed. */
export const inlineValueInputVariants = cva(
  'h-8 w-full min-w-0 border border-ring bg-recessed px-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground aria-invalid:border-destructive',
);

/** The mark on a value that differs from the one it would otherwise show (a square, never a colour alone). */
export const inlineValueMarkerVariants = cva(
  'pointer-events-none absolute -top-0.5 -right-0.5 size-1.5 bg-primary',
);
