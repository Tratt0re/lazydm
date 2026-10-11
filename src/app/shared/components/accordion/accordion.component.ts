import {
  type AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  input,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { ArcTechAccordionItemComponent } from '@/shared/components/accordion/accordion-item.component';
import { accordionVariants } from '@/shared/components/accordion/accordion.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-accordion',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcAccordion',
})
export class ArcTechAccordionComponent implements AfterContentInit {
  readonly items = contentChildren(ArcTechAccordionItemComponent);

  readonly class = input<ClassValue>('');
  readonly arcType = input<'single' | 'multiple'>('single');
  readonly arcCollapsible = input<boolean>(true);
  readonly arcDefaultValue = input<string | string[]>('');

  private readonly defaultValue = computed(() => {
    const defaultValue = this.arcDefaultValue();
    if (typeof defaultValue === 'string') {
      return defaultValue ? [defaultValue] : [];
    } else if (this.arcType() === 'single') {
      throw new Error('Array of default values is supported only for multiple arcType');
    }
    return defaultValue;
  });

  protected readonly classes = computed(() => mergeClasses(accordionVariants(), this.class()));

  ngAfterContentInit(): void {
    for (const item of this.items()) {
      item.accordion = this;
      item.isOpen.set(this.defaultValue().includes(item.arcValue()));
    }
  }

  toggleItem(selectedItem: ArcTechAccordionItemComponent): void {
    if (this.arcType() === 'single') {
      this.toggleForSingleType(selectedItem);
    } else {
      this.toggleForMultipleType(selectedItem);
    }
  }

  private toggleForSingleType(selectedItem: ArcTechAccordionItemComponent): void {
    const isClosing = selectedItem.isOpen();

    if (isClosing && !this.arcCollapsible()) {
      return;
    }

    for (const item of this.items()) {
      const shouldBeOpen = item === selectedItem ? !item.isOpen() : false;
      item.isOpen.set(shouldBeOpen);
    }
  }

  private toggleForMultipleType(selectedItem: ArcTechAccordionItemComponent): void {
    const isClosing = selectedItem.isOpen();
    if (isClosing && !this.arcCollapsible() && this.countOpenItems() <= 1) {
      return;
    }

    selectedItem.isOpen.update(v => !v);
  }

  private countOpenItems(): number {
    return this.items().reduce((counter, item) => (item.isOpen() ? ++counter : counter), 0);
  }
}
