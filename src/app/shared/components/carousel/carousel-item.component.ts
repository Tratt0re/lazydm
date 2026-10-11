import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input } from '@angular/core';

import { type ClassValue } from 'clsx';

import { ArcTechCarouselComponent } from '@/shared/components/carousel/carousel.component';
import { carouselItemVariants } from '@/shared/components/carousel/carousel.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-carousel-item',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    role: 'group',
    'aria-roledescription': 'slide',
  },
})
export class ArcTechCarouselItemComponent {
  readonly #parent = inject(ArcTechCarouselComponent);

  readonly #orientation = computed<'horizontal' | 'vertical'>(() => this.#parent.arcOrientation());
  readonly class = input<ClassValue>('');
  protected readonly classes = computed(() =>
    mergeClasses(carouselItemVariants({ arcOrientation: this.#orientation() }), this.class()),
  );
}
