import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  ElementRef,
  effect,
  forwardRef,
  HostListener,
  input,
  type OnInit,
  output,
  signal,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { segmentedItemVariants, segmentedVariants, type ArcTechSegmentedVariants } from './segmented.variants';

import { mergeClasses } from '@/shared/utils/merge-classes';

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SegmentedActiveIndicatorState {
  readonly width: string;
  readonly transform: string;
  readonly visible: boolean;
}
@Component({
  selector: 'arc-segmented-item',
  standalone: true,
  template: `
    <ng-content />
  `,
  encapsulation: ViewEncapsulation.None,
})
export class ArcTechSegmentedItemComponent {
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  readonly disabled = input(false);
}

@Component({
  selector: 'arc-segmented',
  standalone: true,
  template: `
    <div [class]="classes()" role="group" [attr.aria-label]="arcAriaLabel()">
      <span
        class="pointer-events-none absolute top-0 bottom-0 left-0 rounded-none bg-primary transition-[transform,opacity] duration-200 ease-out"
        [style.width]="activeIndicatorState().width"
        [style.transform]="activeIndicatorState().transform"
        [class.opacity-0]="!activeIndicatorState().visible"
      ></span>

      @for (option of resolvedOptions(); track option.value) {
        <button
          #segmentButton
          type="button"
          [class]="getItemClasses(option.value)"
          [disabled]="option.disabled || arcDisabled()"
          [attr.aria-pressed]="isSelected(option.value)"
          [attr.tabindex]="tabIndexFor(option.value)"
          (click)="selectOption(option.value)"
          (keydown)="onItemKeydown($event, option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ArcTechSegmentedComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'wrapperClasses()',
  },
  exportAs: 'arcSegmented',
})
export class ArcTechSegmentedComponent implements ControlValueAccessor, OnInit {
  private readonly itemComponents = contentChildren(ArcTechSegmentedItemComponent);
  private readonly segmentButtons = viewChildren<ElementRef<HTMLButtonElement>>('segmentButton');
  private readonly layoutVersion = signal(0);

  readonly class = input<ClassValue>('');
  readonly arcSize = input<ArcTechSegmentedVariants['arcSize']>('default');
  readonly arcOptions = input<SegmentedOption[]>([]);
  readonly arcDefaultValue = input<string>('');
  readonly arcDisabled = input(false, { transform: booleanAttribute });
  readonly arcFull = input(false, { transform: booleanAttribute });
  readonly arcAriaLabel = input<string>('Segmented control');

  readonly arcChange = output<string>();

  protected readonly selectedValue = signal<string>('');
  protected readonly items = signal<readonly ArcTechSegmentedItemComponent[]>([]);
  protected readonly resolvedOptions = computed<readonly SegmentedOption[]>(() => {
    const options = this.arcOptions();
    if (options.length > 0) {
      return options;
    }

    return this.items().map((item) => ({
      value: item.value(),
      label: item.label(),
      disabled: item.disabled(),
    }));
  });
  protected readonly selectedIndex = computed(() =>
    this.resolvedOptions().findIndex((option) => option.value === this.selectedValue()),
  );
  protected readonly activeIndicatorState = computed<SegmentedActiveIndicatorState>(() => {
    this.layoutVersion();

    const selectedIndex = this.selectedIndex();
    const button = this.segmentButtons()[selectedIndex]?.nativeElement;

    if (!button) {
      return { width: '0px', transform: 'translateX(0px)', visible: false };
    }

    return {
      width: `${button.offsetWidth}px`,
      transform: `translateX(${button.offsetLeft}px)`,
      visible: true,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (value: string) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched = () => {};

  constructor() {
    effect(() => {
      this.items.set(this.itemComponents());
    });
  }

  ngOnInit() {
    // Initialize with default value
    if (this.arcDefaultValue()) {
      this.selectedValue.set(this.arcDefaultValue());
    }
  }

  protected readonly classes = computed(() =>
    mergeClasses(segmentedVariants({ arcSize: this.arcSize() }), this.arcFull() ? 'flex w-full' : '', this.class()),
  );

  protected readonly wrapperClasses = computed(() => (this.arcFull() ? 'block w-full' : 'inline-block'));

  protected getItemClasses(value: string): string {
    return mergeClasses(
      segmentedItemVariants({
        arcSize: this.arcSize(),
        isActive: this.isSelected(value),
      }),
      this.arcFull() ? 'flex-1' : '',
    );
  }

  protected isSelected(value: string): boolean {
    return this.selectedValue() === value;
  }

  protected tabIndexFor(value: string): number {
    return this.activeIndex() >= 0 && this.resolvedOptions()[this.activeIndex()]?.value === value ? 0 : -1;
  }

  protected selectOption(value: string) {
    if (this.arcDisabled()) return;

    const option = this.resolvedOptions().find((resolvedOption) => resolvedOption.value === value);
    if (!option || option.disabled) return;

    this.selectedValue.set(value);
    this.onChange(value);
    this.onTouched();
    this.arcChange.emit(value);
  }

  protected onItemKeydown(event: KeyboardEvent, value: string): void {
    const currentIndex = this.resolvedOptions().findIndex((option) => option.value === value);
    if (currentIndex < 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(currentIndex, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(currentIndex, -1);
        break;
      case 'Home':
        event.preventDefault();
        this.focusAndSelectFirstEnabled();
        break;
      case 'End':
        event.preventDefault();
        this.focusAndSelectLastEnabled();
        break;
    }
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.layoutVersion.update((current) => current + 1);
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.selectedValue.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(_isDisabled: boolean): void {
    // Handled by arcDisabled input
  }

  private activeIndex(): number {
    const selectedIndex = this.selectedIndex();
    const options = this.resolvedOptions();

    if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) {
      return selectedIndex;
    }

    return options.findIndex((option) => !option.disabled);
  }

  private moveSelection(startIndex: number, direction: 1 | -1): void {
    const options = this.resolvedOptions();
    if (options.length === 0) {
      return;
    }

    let nextIndex = startIndex;
    for (let iteration = 0; iteration < options.length; iteration++) {
      nextIndex = (nextIndex + direction + options.length) % options.length;
      if (!options[nextIndex]?.disabled) {
        this.focusAndSelectIndex(nextIndex);
        return;
      }
    }
  }

  private focusAndSelectFirstEnabled(): void {
    const nextIndex = this.resolvedOptions().findIndex((option) => !option.disabled);
    if (nextIndex >= 0) {
      this.focusAndSelectIndex(nextIndex);
    }
  }

  private focusAndSelectLastEnabled(): void {
    const options = this.resolvedOptions();
    for (let index = options.length - 1; index >= 0; index--) {
      if (!options[index]?.disabled) {
        this.focusAndSelectIndex(index);
        return;
      }
    }
  }

  private focusAndSelectIndex(index: number): void {
    const option = this.resolvedOptions()[index];
    if (!option || option.disabled) {
      return;
    }

    this.selectOption(option.value);
    this.segmentButtons()[index]?.nativeElement.focus();
  }
}
