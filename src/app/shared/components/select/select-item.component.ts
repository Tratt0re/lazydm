import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';

import { ArcTechIconComponent } from '@/shared/components/icon';
import type { ArcTechIcon } from '@/shared/components/icon';
import {
  selectItemIconVariants,
  selectItemVariants,
  type ArcTechSelectItemModeVariants,
  type ArcTechSelectSizeVariants,
} from '@/shared/components/select/select.variants';
import { mergeClasses, noopFn, transform } from '@/shared/utils/merge-classes';

// Interface to avoid circular dependency
interface SelectHost {
  selectedValue(): string[];
  selectItem(value: string, label: string): void;
  navigateTo(): void;
}

@Component({
  selector: 'arc-select-item, [arc-select-item]',
  imports: [ArcTechIconComponent],
  template: `
    @if (isSelected()) {
      <span [class]="iconClasses()">
        <arc-icon arcType="check" [arcStrokeWidth]="strokeWidth()" aria-hidden="true" data-testid="check-icon" />
      </span>
    }
    @if (arcColorHex(); as colorHex) {
      <span
        class="inline-block h-3.5 w-6 shrink-0 rounded-sm border border-border/70"
        [style.backgroundColor]="colorHex"
      ></span>
    }
    @if (arcIcon(); as iconType) {
      <arc-icon [arcType]="iconType" class="size-3.5 shrink-0" />
    }
    @if (arcShowLabel()) {
      <span class="truncate">
        @if (arcLabel()) {
          {{ arcLabel() }}
        } @else {
          <ng-content />
        }
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'option',
    tabindex: '-1',
    '[class]': 'classes()',
    '[attr.value]': 'arcValue()',
    '[attr.data-disabled]': 'arcDisabled() ? "" : null',
    '[attr.data-selected]': 'isSelected() ? "" : null',
    '[attr.aria-selected]': 'isSelected()',
    '(click)': 'onClick()',
    '(mouseenter)': 'onMouseEnter()',
    '(keydown.{tab}.prevent)': 'noopFn',
  },
})
export class ArcTechSelectItemComponent {
  readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly arcValue = input.required<string>();
  readonly arcDisabled = input(false, { transform });
  readonly arcLabel = input<string>('');
  readonly arcShowLabel = input(true, { transform });
  readonly arcIcon = input<ArcTechIcon | null>(null);
  readonly arcColorHex = input<string | null>(null);
  readonly class = input<string>('');

  private readonly select = signal<SelectHost | null>(null);
  noopFn = noopFn;

  readonly label = linkedSignal<string>(() => {
    const explicitLabel = this.arcLabel().trim();
    if (explicitLabel.length > 0) {
      return explicitLabel;
    }

    const element = this.elementRef.nativeElement;
    return (element.textContent ?? element.innerText)?.trim() ?? '';
  });

  readonly arcMode = signal<ArcTechSelectItemModeVariants>('normal');
  readonly arcSize = signal<ArcTechSelectSizeVariants>('default');

  protected readonly classes = computed(() =>
    mergeClasses(selectItemVariants({ arcMode: this.arcMode(), arcSize: this.arcSize() }), this.class()),
  );

  protected readonly iconClasses = computed(() =>
    mergeClasses(selectItemIconVariants({ arcMode: this.arcMode(), arcSize: this.arcSize() })),
  );

  protected readonly strokeWidth = computed(() => (this.arcMode() === 'compact' ? 3 : 2));

  protected readonly isSelected = computed(() => this.select()?.selectedValue().includes(this.arcValue()) ?? false);

  setSelectHost(selectHost: SelectHost) {
    this.select.set(selectHost);
  }

  onMouseEnter() {
    if (this.arcDisabled()) {
      return;
    }
    this.select()?.navigateTo();
  }

  onClick() {
    if (this.arcDisabled()) {
      return;
    }
    this.select()?.selectItem(this.arcValue(), this.label());
  }
}
