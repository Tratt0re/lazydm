import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { footerVariants } from '@/shared/components/layout/layout.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-footer',
  template: `
    <footer [class]="classes()" [style.height.px]="arcHeight()">
      <ng-content />
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcFooter',
})
export class FooterComponent {
  readonly class = input<ClassValue>('');
  readonly arcHeight = input<number>(64);

  protected readonly classes = computed(() => mergeClasses(footerVariants(), this.class()));
}
