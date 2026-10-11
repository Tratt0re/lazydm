import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

import { ArcTechDropdownService } from './dropdown.service';
import { dropdownItemVariants, type ArcTechDropdownItemVariants } from './dropdown.variants';

@Component({
  selector: 'arc-dropdown-menu-item, [arc-dropdown-menu-item]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-disabled]': 'disabled() || null',
    '[attr.data-variant]': 'variant()',
    '[attr.data-inset]': 'inset() || null',
    '[attr.aria-disabled]': 'disabled()',
    '(click.prevent-with-stop)': 'onClick()',
    role: 'menuitem',
    tabindex: '-1',
  },
  exportAs: 'arcDropdownMenuItem',
})
export class ArcTechDropdownMenuItemComponent {
  private readonly dropdownService = inject(ArcTechDropdownService);

  readonly variant = input<ArcTechDropdownItemVariants['variant']>('default');
  readonly inset = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly class = input<ClassValue>('');

  onClick() {
    if (this.disabled()) {
      return;
    }

    // Fechar dropdown após click
    setTimeout(() => {
      this.dropdownService.close();
    }, 0);
  }

  protected readonly classes = computed(() =>
    mergeClasses(
      dropdownItemVariants({
        variant: this.variant(),
        inset: this.inset(),
      }),
      this.class(),
    ),
  );
}
