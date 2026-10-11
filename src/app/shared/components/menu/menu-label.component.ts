import type { BooleanInput } from '@angular/cdk/coercion';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { menuLabelVariants } from '@/shared/components/menu/menu.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-menu-label, [arc-menu-label]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-inset]': 'inset() || null',
  },
  exportAs: 'arcMenuLabel',
})
export class ArcTechMenuLabelComponent {
  readonly class = input<ClassValue>('');
  readonly inset = input<boolean, BooleanInput>(false, { transform: booleanAttribute });

  protected readonly classes = computed(() =>
    mergeClasses(
      menuLabelVariants({
        inset: this.inset(),
      }),
      this.class(),
    ),
  );
}
