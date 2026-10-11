import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

import { badgeVariants, type ArcTechBadgeShapeVariants, type ArcTechBadgeTypeVariants } from './badge.variants';

@Component({
  selector: 'arc-badge',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcBadge',
})
export class ArcTechBadgeComponent {
  readonly arcType = input<ArcTechBadgeTypeVariants>('default');
  readonly arcShape = input<ArcTechBadgeShapeVariants>('default');

  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(badgeVariants({ arcType: this.arcType(), arcShape: this.arcShape() }), this.class()),
  );
}
