import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  ElementRef,
  forwardRef,
  input,
  model,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ArcTechIdDirective } from '@/shared/core';
import { mergeClasses, noopFn } from '@/shared/utils/merge-classes';

import {
  switchTrackVariants,
  switchVariants,
  type ArcTechSwitchSizeVariants,
  type ArcTechSwitchTypeVariants,
} from './switch.variants';

type OnTouchedType = () => void;
type OnChangeType = (value: boolean) => void;

@Component({
  selector: 'arc-switch',
  imports: [ArcTechIdDirective],
  template: `
    <span class="inline-flex min-h-11 items-center" arcTechId="switch" #z="arcTechId"
    [class.gap-2]="hasLabel()">
      <button
        [id]="arcId() || z.id()"
        type="button"
        role="switch"
        [attr.data-state]="status()"
        [attr.aria-checked]="arcChecked()"
        [attr.aria-label]="arcAriaLabel() || null"
        [class]="classes()"
        [disabled]="arcDisabled() || formDisabled()"
        (click)="onSwitchChange()"
      >
        <span
          [class]="trackClasses()"
          [attr.data-type]="arcType()"
          [attr.data-size]="arcSize()"
          [attr.data-state]="status()"
        >
          <span
            [attr.data-size]="arcSize()"
            [attr.data-state]="status()"
            class="bg-background pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform data-[size=lg]:h-6 data-[size=lg]:w-6 data-[size=sm]:h-4 data-[size=sm]:w-4 data-[state=checked]:translate-x-5 data-[size=lg]:data-[state=checked]:translate-x-6 data-[size=sm]:data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 data-[size=lg]:data-[state=unchecked]:translate-x-0 data-[size=sm]:data-[state=unchecked]:translate-x-0"
          ></span>
        </span>
      </button>

      <label
        class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        [for]="arcId() || z.id()"
      >
        <ng-content />
      </label>
    </span>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ArcTechSwitchComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcSwitch',
})
export class ArcTechSwitchComponent implements ControlValueAccessor {
  readonly class = input<ClassValue>('');
  readonly arcChecked = model<boolean>(true);
  readonly arcId = input<string>('');
  readonly arcAriaLabel = input<string>('');
  readonly arcSize = input<ArcTechSwitchSizeVariants>('default');
  readonly arcType = input<ArcTechSwitchTypeVariants>('default');
  readonly arcDisabled = input(false, { transform: booleanAttribute });

  protected readonly labelContent = contentChild<ElementRef>('labelContent');
  protected readonly hasLabel = computed(() => !!this.labelContent());

  private onChange: OnChangeType = noopFn;
  private onTouched: OnTouchedType = noopFn;

  protected readonly status = computed(() => (this.arcChecked() ? 'checked' : 'unchecked'));
  protected readonly classes = computed(() =>
    mergeClasses(switchVariants({ arcType: this.arcType(), arcSize: this.arcSize() }), this.class()),
  );
  protected readonly trackClasses = computed(() =>
    mergeClasses(switchTrackVariants({ arcType: this.arcType(), arcSize: this.arcSize() })),
  );

  protected readonly formDisabled = signal(false);

  writeValue(val: boolean): void {
    this.arcChecked.set(val);
  }

  registerOnChange(fn: OnChangeType): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: OnTouchedType): void {
    this.onTouched = fn;
  }

  onSwitchChange(): void {
    if (this.arcDisabled() || this.formDisabled()) {
      return;
    }

    this.arcChecked.update(checked => !checked);
    this.onTouched();
    this.onChange(this.arcChecked());
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }
}
