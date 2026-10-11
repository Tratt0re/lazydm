import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { menuShortcutVariants } from '@/shared/components/menu/menu.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-menu-shortcut, [arc-menu-shortcut]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcMenuShortcut',
})
export class ArcTechMenuShortcutComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(menuShortcutVariants(), this.class()));
}
