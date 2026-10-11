import type { BooleanInput } from '@angular/cdk/coercion';
import { CdkMenuItem } from '@angular/cdk/menu';
import { booleanAttribute, computed, Directive, effect, inject, input, signal, untracked } from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

import { menuItemVariants, type ArcTechMenuItemTypeVariants } from './menu.variants';

@Directive({
  selector: 'button[arc-menu-item], [arc-menu-item]',
  host: {
    '[class]': 'classes()',
    '[attr.data-orientation]': "'horizontal'",
    '[attr.data-state]': 'isOpenState()',
    '[attr.aria-disabled]': "disabledState() ? '' : undefined",
    '[attr.data-disabled]': "disabledState() ? '' : undefined",
    '[attr.data-highlighted]': "highlightedState() ? '' : undefined",
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
    '(pointermove)': 'onPointerMove($event)',
    '(click)': 'onClick($event)',
    '(keydown.enter)': 'onClick($event)',
    '(keydown.space)': 'onClick($event)',
  },
  hostDirectives: [
    {
      directive: CdkMenuItem,
      outputs: ['cdkMenuItemTriggered: menuItemTriggered'],
    },
  ],
})
export class ArcTechMenuItemDirective {
  private readonly cdkMenuItem = inject(CdkMenuItem, { host: true });

  readonly arcDisabled = input<boolean, BooleanInput>(false, { transform: booleanAttribute });
  readonly arcInset = input<boolean, BooleanInput>(false, { transform: booleanAttribute });
  readonly arcType = input<ArcTechMenuItemTypeVariants>('default');
  readonly class = input<ClassValue>('');

  private readonly isFocused = signal(false);

  protected readonly disabledState = computed(() => this.arcDisabled());

  protected readonly isOpenState = computed(() => this.cdkMenuItem.isMenuOpen());

  protected readonly highlightedState = computed(() => this.isFocused());

  protected readonly classes = computed(() =>
    mergeClasses(
      menuItemVariants({
        inset: this.arcInset(),
        arcType: this.arcType(),
      }),
      this.class(),
    ),
  );

  constructor() {
    effect(() => {
      const disabled = this.arcDisabled();
      untracked(() => {
        this.cdkMenuItem.disabled = disabled;
      });
    });
  }

  onFocus(): void {
    if (!this.arcDisabled()) {
      this.isFocused.set(true);
    }
  }

  onBlur(): void {
    this.isFocused.set(false);
  }

  onPointerMove(event: PointerEvent) {
    if (event.defaultPrevented || !(event.pointerType === 'mouse')) {
      return;
    }

    if (!this.arcDisabled()) {
      const item = event.currentTarget;
      (item as HTMLElement)?.focus({ preventScroll: true });
    }
  }

  onClick(event: Event) {
    if (this.disabledState()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
