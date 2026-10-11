import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import { type ClassValue } from 'clsx';

import { kbdGroupVariants } from './kbd.variants';

import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-kbd-group, [arc-kbd-group]',
  standalone: true,
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcKbdGroup',
})
export class ArcTechKbdGroupComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(kbdGroupVariants(), this.class()));
}
