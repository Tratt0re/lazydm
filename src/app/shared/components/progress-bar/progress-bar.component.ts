import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import {
  containerProgressBarVariants,
  progressBarVariants,
  type ArcTechProgressBarShapeVariants,
  type ArcTechProgressBarSizeVariants,
  type ArcTechProgressBarTypeVariants,
} from './progress-bar.variants';

import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-progress-bar',
  template: `
    @if (arcIndeterminate()) {
      <div [class]="classes()">
        <div [class]="barClasses()"></div>
      </div>
    } @else {
      <div [class]="classes()">
        <div [style.width.%]="correctedProgress()" [class]="barClasses()" id="bar"></div>
      </div>
    }
  `,
  styles: `
    @keyframes indeterminate {
      0% {
        left: -0%;
        width: 30%;
      }
      50% {
        left: 50%;
        width: 30%;
      }
      100% {
        left: 100%;
        width: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'w-full',
  },
})
export class ArcTechProgressBarComponent {
  readonly arcType = input<ArcTechProgressBarTypeVariants>('default');
  readonly arcSize = input<ArcTechProgressBarSizeVariants>('default');
  readonly arcShape = input<ArcTechProgressBarShapeVariants>('default');
  readonly arcIndeterminate = input(false, { transform: booleanAttribute });
  readonly class = input<ClassValue>('');
  readonly barClass = input<ClassValue>('');
  readonly progress = input(0);

  readonly correctedProgress = computed(() => {
    if (this.progress() > 100) {
      return 100;
    } else if (this.progress() < 0) {
      return 0;
    }
    return this.progress();
  });

  protected readonly classes = computed(() =>
    mergeClasses(
      containerProgressBarVariants({
        arcIndeterminate: this.arcIndeterminate(),
        arcType: this.arcType(),
        arcSize: this.arcSize(),
        arcShape: this.arcShape(),
      }),
      this.class(),
    ),
  );

  protected readonly barClasses = computed(() =>
    mergeClasses(
      progressBarVariants({ arcIndeterminate: this.arcIndeterminate(), arcType: this.arcType(), arcShape: this.arcShape() }),
      this.barClass(),
    ),
  );
}
