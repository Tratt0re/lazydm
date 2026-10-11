import { ChangeDetectionStrategy, Component, computed, input, signal, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import type { ArcTechAccordionComponent } from '@/shared/components/accordion/accordion.component';
import {
  accordionContentVariants,
  accordionItemVariants,
  accordionTriggerVariants,
} from '@/shared/components/accordion/accordion.variants';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-accordion-item',
  imports: [ArcTechIconComponent],
  template: `
    <button
      type="button"
      [attr.aria-controls]="'content-' + arcValue()"
      [attr.aria-expanded]="isOpen()"
      [id]="'accordion-' + arcValue()"
      [class]="triggerClasses()"
      (click)="toggle()"
    >
      {{ arcTitle() }}
      <arc-icon
        arcType="chevron-down"
        class="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200"
        [class]="isOpen() ? 'rotate-180' : ''"
      />
    </button>

    <div
      role="region"
      [attr.aria-labelledby]="'accordion-' + arcValue()"
      [attr.data-state]="isOpen() ? 'open' : 'closed'"
      [id]="'content-' + arcValue()"
      [class]="contentClasses()"
    >
      <div class="overflow-hidden">
        <div class="pt-0 pb-4">
          <ng-content />
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'itemClasses()',
    '[attr.data-state]': "isOpen() ? 'open' : 'closed'",
  },
  exportAs: 'arcAccordionItem',
})
export class ArcTechAccordionItemComponent {
  readonly arcTitle = input<string>('');
  readonly arcValue = input<string>('');
  readonly class = input<ClassValue>('');

  accordion!: ArcTechAccordionComponent;
  readonly isOpen = signal(false);

  protected readonly itemClasses = computed(() => mergeClasses(accordionItemVariants(), this.class()));
  protected readonly triggerClasses = computed(() => mergeClasses(accordionTriggerVariants()));
  protected readonly contentClasses = computed(() => mergeClasses(accordionContentVariants({ isOpen: this.isOpen() })));

  toggle(): void {
    if (this.accordion) {
      this.accordion.toggleItem(this);
    } else {
      this.isOpen.update(v => !v);
    }
  }
}
