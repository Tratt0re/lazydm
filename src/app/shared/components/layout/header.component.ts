import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { headerVariants } from '@/shared/components/layout/layout.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-header',
  template: `
    <header [class]="classes()" [style.height.px]="arcHeight()">
      <ng-content />
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcHeader',
})
export class HeaderComponent {
  readonly class = input<ClassValue>('');
  readonly arcHeight = input<number | null>(64);

  protected readonly classes = computed(() => mergeClasses(headerVariants(), this.class()));
}
