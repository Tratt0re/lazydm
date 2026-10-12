import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { contentVariants } from '@/shared/components/layout/layout.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-content',
  template: `
    <main class="flex flex-1 flex-col">
      <ng-content />
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcContent',
})
export class ContentComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(contentVariants(), this.class()));
}
