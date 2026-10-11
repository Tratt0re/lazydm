import { ChangeDetectionStrategy, Component, computed, contentChildren, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { layoutVariants, type LayoutVariants } from '@/shared/components/layout/layout.variants';
import { SidebarComponent } from '@/shared/components/layout/sidebar.component';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-layout',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcLayout',
})
export class LayoutComponent {
  readonly class = input<ClassValue>('');
  readonly arcDirection = input<LayoutVariants>('auto');

  // Query for direct sidebar children to auto-detect layout direction
  private readonly sidebars = contentChildren(SidebarComponent, { descendants: false });

  private readonly detectedDirection = computed(() => {
    if (this.arcDirection() !== 'auto') {
      return this.arcDirection();
    }

    // Auto-detection: Check if there are any sidebar children
    const hasSidebar = this.sidebars().length > 0;
    return hasSidebar ? 'horizontal' : 'vertical';
  });

  protected readonly classes = computed(() =>
    mergeClasses(
      layoutVariants({
        arcDirection: this.detectedDirection(),
      }),
      this.class(),
    ),
  );
}
