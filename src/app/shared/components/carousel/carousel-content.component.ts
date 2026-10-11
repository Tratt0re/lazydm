import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input } from '@angular/core';

import { type ClassValue } from 'clsx';

import { ArcTechCarouselComponent } from '@/shared/components/carousel/carousel.component';
import { carouselContentVariants } from '@/shared/components/carousel/carousel.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-carousel-content',
  imports: [],
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
})
export class ArcTechCarouselContentComponent {
  readonly #parent = inject(ArcTechCarouselComponent);
  readonly #orientation = computed<'horizontal' | 'vertical'>(() => this.#parent.arcOrientation());
  readonly class = input<ClassValue>('');
  protected readonly classes = computed(() =>
    mergeClasses(carouselContentVariants({ arcOrientation: this.#orientation() }), this.class()),
  );
}
