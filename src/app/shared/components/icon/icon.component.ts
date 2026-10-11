import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';
import { LucideAngularModule } from 'lucide-angular';

import { mergeClasses } from '@/shared/utils/merge-classes';

import { iconVariants, type ArcTechIconSizeVariants } from './icon.variants';
import { ARCTECH_ICONS, type ArcTechIcon } from './icons';

@Component({
  selector: 'arc-icon, [arc-icon]',
  imports: [LucideAngularModule],
  template: `
    <lucide-angular
      [img]="icon()"
      [strokeWidth]="arcStrokeWidth()"
      [absoluteStrokeWidth]="arcAbsoluteStrokeWidth()"
      [class]="classes()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class ArcTechIconComponent {
  readonly arcType = input.required<ArcTechIcon>();
  readonly arcSize = input<ArcTechIconSizeVariants>('default');
  readonly arcStrokeWidth = input<number>(2);
  readonly arcAbsoluteStrokeWidth = input<boolean>(false);
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(iconVariants({ arcSize: this.arcSize() }), this.class(), this.arcStrokeWidth() === 0 ? 'stroke-none' : ''),
  );

  protected readonly icon = computed(() => {
    const type = this.arcType();
    if (typeof type === 'string') {
      return ARCTECH_ICONS[type] ?? ARCTECH_ICONS.circle;
    }

    return type;
  });
}
