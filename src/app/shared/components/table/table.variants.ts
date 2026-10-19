import { cva, type VariantProps } from 'class-variance-authority';

export const tableVariants = cva(
  'w-full caption-bottom text-sm [&_thead_tr]:border-b [&_tbody]:border-0 [&_tbody_tr:last-child]:border-0 [&_tbody_tr]:border-b [&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-accent [&_tbody_tr]:data-[state=selected]:bg-raised [&_th]:h-10 [&_th]:px-2 [&_th]:text-left [&_th]:align-middle [&_th]:bg-raised [&_th]:font-mono [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.05em] [&_th]:text-muted-foreground [&_th:has([role=checkbox])]:pr-0 [&_th>[role=checkbox]]:translate-y-0.5 [&_td]:p-2 [&_td]:align-middle [&_td:has([role=checkbox])]:pr-0 [&_td>[role=checkbox]]:translate-y-0.5 [&_caption]:mt-4 [&_caption]:text-sm [&_caption]:text-muted-foreground',
  {
    variants: {
      arcType: {
        default: '',
        striped: '[&_tbody_tr:nth-child(odd)]:bg-muted/50',
        bordered: 'border border-border',
      },
      arcSize: {
        default: '',
        compact: '[&_td]:py-2 [&_th]:py-2',
        comfortable: '[&_td]:py-4 [&_th]:py-4',
      },
    },
    defaultVariants: {
      arcType: 'default',
      arcSize: 'default',
    },
  },
);

export const tableHeaderVariants = cva('[&_tr]:border-b', {
  variants: {},
  defaultVariants: {},
});

export const tableBodyVariants = cva('[&_tr:last-child]:border-0', {
  variants: {},
  defaultVariants: {},
});

export const tableRowVariants = cva(
  'border-b transition-colors hover:bg-accent data-[state=selected]:bg-raised',
  {
  variants: {},
  defaultVariants: {},
});

export const tableHeadVariants = cva(
  'h-10 px-2 text-left align-middle bg-raised font-mono text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5',
  {
    variants: {},
    defaultVariants: {},
  },
);

export const tableCellVariants = cva(
  'p-2 align-middle [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5',
  {
    variants: {},
    defaultVariants: {},
  },
);

export const tableCaptionVariants = cva('mt-4 text-sm text-muted-foreground', {
  variants: {},
  defaultVariants: {},
});

export type ArcTechTableSizeVariants = NonNullable<VariantProps<typeof tableVariants>['arcSize']>;
export type ArcTechTableTypeVariants = NonNullable<VariantProps<typeof tableVariants>['arcType']>;
