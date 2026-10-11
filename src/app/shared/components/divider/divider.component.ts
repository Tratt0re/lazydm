import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { dividerVariants, type ArcTechDividerVariants } from './divider.variants';

import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-divider',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[attr.role]': `'separator'`,
    '[attr.aria-orientation]': 'arcOrientation()',
    '[class]': 'classes()',
  },
  exportAs: 'arcDivider',
})
export class ArcTechDividerComponent {
  readonly arcOrientation = input<ArcTechDividerVariants['arcOrientation']>('horizontal');
  readonly arcSpacing = input<ArcTechDividerVariants['arcSpacing']>('default');
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(
      dividerVariants({
        arcOrientation: this.arcOrientation(),
        arcSpacing: this.arcSpacing(),
      }),
      this.class(),
    ),
  );
}
