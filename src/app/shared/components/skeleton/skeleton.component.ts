import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-skeleton',
  template: `
    <div [class]="classes()"></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcSkeleton',
})
export class ArcTechSkeletonComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses('animate-pulse rounded-md bg-muted', this.class()));
}
