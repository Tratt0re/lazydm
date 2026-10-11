import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
  ViewEncapsulation,
  output,
  computed,
  viewChild,
  type InputSignal,
  type Signal,
} from '@angular/core';

import type { ClassValue } from 'clsx';
import type { EmblaCarouselType, EmblaEventType, EmblaOptionsType, EmblaPluginType } from 'embla-carousel';
import { EmblaCarouselDirective } from 'embla-carousel-angular';

import { ArcTechButtonComponent } from '@/shared/components/button';
import {
  carouselNextButtonVariants,
  carouselPreviousButtonVariants,
  carouselVariants,
  type ArcTechCarouselControlsVariants,
  type ArcTechCarouselOrientationVariants,
} from '@/shared/components/carousel/carousel.variants';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-carousel',
  imports: [EmblaCarouselDirective, ArcTechButtonComponent, ArcTechIconComponent],
  template: `
    <div class="relative">
      <div
        emblaCarousel
        #emblaRef="emblaCarousel"
        [class]="classes()"
        [options]="options()"
        [plugins]="arcPlugins()"
        [subscribeToEvents]="subscribeToEvents"
        (emblaChange)="onEmblaChange($event, emblaRef.emblaApi!)"
        aria-roledescription="carousel"
        role="region"
        tabindex="0"
      >
        <ng-content />

        @let controls = arcControls();
        @if (controls === 'button') {
          <button
            type="button"
            arc-button
            arcType="outline"
            [class]="prevBtnClasses()"
            [disabled]="!canScrollPrev()"
            (click)="slidePrevious()"
            aria-label="Previous slide"
          >
            <arc-icon arcType="chevron-left" class="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            arc-button
            arcType="outline"
            [class]="nextBtnClasses()"
            [disabled]="!canScrollNext()"
            (click)="slideNext()"
            aria-label="Next slide"
          >
            <arc-icon arcType="chevron-right" class="size-4" aria-hidden="true" />
          </button>
        } @else if (controls === 'dot') {
          <div class="mt-2 flex justify-center gap-1">
            @for (dot of dots(); track $index) {
              <button
                type="button"
                [class]="
                  'block size-4 border-0 bg-transparent p-0 ' +
                  ($index === selectedIndex() ? 'cursor-default' : 'cursor-pointer')
                "
                (click)="goTo($index)"
                [attr.aria-current]="$index === selectedIndex() ? 'true' : null"
                [aria-label]="'Go to slide ' + ($index + 1)"
              >
                <arc-icon
                  arcType="circle-small"
                  [arcStrokeWidth]="0"
                  [class]="$index === selectedIndex() ? 'fill-primary' : 'fill-border'"
                />
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '(keydown.arrowleft.prevent)': 'slidePrevious()',
    '(keydown.arrowright.prevent)': 'slideNext()',
  },
})
export class ArcTechCarouselComponent {
  protected readonly emblaRef = viewChild(EmblaCarouselDirective);

  readonly class = input<ClassValue>('');
  readonly arcOptions: InputSignal<EmblaOptionsType> = input<EmblaOptionsType>({ loop: false });
  readonly arcPlugins: InputSignal<EmblaPluginType[]> = input<EmblaPluginType[]>([]);
  readonly arcOrientation = input<ArcTechCarouselOrientationVariants>('horizontal');
  readonly arcControls = input<ArcTechCarouselControlsVariants>('button');
  readonly arcInited = output<EmblaCarouselType>();
  readonly arcSelected = output<void>();

  protected readonly selectedIndex = signal<number>(0);
  protected readonly canScrollPrev = signal<boolean>(false);
  protected readonly canScrollNext = signal<boolean>(false);
  protected readonly scrollSnaps = signal<number[]>([]);
  protected readonly subscribeToEvents: EmblaEventType[] = ['init', 'select', 'reInit'];
  protected readonly options: Signal<EmblaOptionsType> = computed(() => ({
    ...this.arcOptions(),
    axis: this.arcOrientation() === 'horizontal' ? 'x' : 'y',
  }));

  protected readonly dots = computed(() => new Array<string>(this.scrollSnaps().length).fill('.'));

  #index = -1;

  onEmblaChange(type: EmblaEventType, emblaApi: EmblaCarouselType): void {
    if (type === 'init' || type === 'reInit') {
      this.scrollSnaps.set(emblaApi.scrollSnapList());
      this.checkNavigation(emblaApi);
      if (type === 'init') {
        this.arcInited.emit(emblaApi);
      }
      return;
    }

    if (type === 'select' && emblaApi.selectedScrollSnap() !== this.#index) {
      this.checkNavigation(emblaApi);
      this.arcSelected.emit();
    }
  }

  slidePrevious(): void {
    const emblaRef = this.emblaRef();
    if (emblaRef) {
      emblaRef.scrollPrev();
    }
  }

  slideNext(): void {
    const emblaRef = this.emblaRef();
    if (emblaRef) {
      emblaRef.scrollNext();
    }
  }

  goTo(index: number): void {
    const emblaRef = this.emblaRef();
    if (emblaRef) {
      emblaRef.scrollTo(index);
    }
  }

  private checkNavigation(emblaApi: EmblaCarouselType): void {
    this.#index = emblaApi.selectedScrollSnap();
    this.selectedIndex.set(emblaApi.selectedScrollSnap());
    this.canScrollPrev.set(emblaApi.canScrollPrev());
    this.canScrollNext.set(emblaApi.canScrollNext());
  }

  protected readonly classes = computed(() =>
    mergeClasses(carouselVariants({ arcOrientation: this.arcOrientation() }), this.class()),
  );

  protected readonly prevBtnClasses = computed(() =>
    mergeClasses(carouselPreviousButtonVariants({ arcOrientation: this.arcOrientation() })),
  );

  protected readonly nextBtnClasses = computed(() =>
    mergeClasses(carouselNextButtonVariants({ arcOrientation: this.arcOrientation() })),
  );
}
