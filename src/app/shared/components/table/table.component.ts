import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import {
  type ArcTechTableSizeVariants,
  type ArcTechTableTypeVariants,
  tableBodyVariants,
  tableCaptionVariants,
  tableCellVariants,
  tableHeaderVariants,
  tableHeadVariants,
  tableRowVariants,
  tableVariants,
} from '@/shared/components/table/table.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'table[arc-table]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcTable',
})
export class ArcTechTableComponent {
  readonly arcType = input<ArcTechTableTypeVariants>('default');
  readonly arcSize = input<ArcTechTableSizeVariants>('default');
  readonly arcRowDividers = input(true, { transform: booleanAttribute });
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(
      tableVariants({
        arcType: this.arcType(),
        arcSize: this.arcSize(),
      }),
      this.arcRowDividers() ? '' : '[&_tbody_tr]:border-b-0 [&_tbody_tr:last-child]:border-b-0',
      this.class(),
    ),
  );
}

@Component({
  selector: 'thead[arc-table-header]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcTableHeader',
})
export class ArcTechTableHeaderComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableHeaderVariants(), this.class()));
}

@Component({
  selector: 'tbody[arc-table-body]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcTableBody',
})
export class ArcTechTableBodyComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableBodyVariants(), this.class()));
}

@Component({
  selector: 'tr[arc-table-row]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcTableRow',
})
export class ArcTechTableRowComponent {
  private readonly parentTable = inject(ArcTechTableComponent, { optional: true });
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(
      tableRowVariants(),
      this.parentTable?.arcRowDividers() === false ? 'border-b-0' : '',
      this.class(),
    ),
  );
}

@Component({
  selector: 'th[arc-table-head]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcTableHead',
})
export class ArcTechTableHeadComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableHeadVariants(), this.class()));
}

@Component({
  selector: 'td[arc-table-cell]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcTableCell',
})
export class ArcTechTableCellComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableCellVariants(), this.class()));
}

@Component({
  selector: 'caption[arc-table-caption]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcTableCaption',
})
export class ArcTechTableCaptionComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableCaptionVariants(), this.class()));
}
