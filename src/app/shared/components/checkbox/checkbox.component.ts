import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  model,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import type { ClassValue } from 'clsx';

import { ArcTechIdDirective } from '@/shared/core';
import { mergeClasses, noopFn } from '@/shared/utils/merge-classes';

import {
  checkboxLabelVariants,
  checkboxVariants,
  type ArcTechCheckboxShapeVariants,
  type ArcTechCheckboxSizeVariants,
  type ArcTechCheckboxTypeVariants,
} from './checkbox.variants';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';

type OnTouchedType = () => void;
type OnChangeType = (value: boolean) => void;

@Component({
  selector: 'arc-checkbox, [arc-checkbox]',
  imports: [ArcTechIconComponent, ArcTechIdDirective],
  template: `
    <div class="relative flex" arcTechId="checkbox" #z="arcTechId">
      <input
        #input
        type="checkbox"
        name="checkbox"
        [id]="z.id()"
        [class]="classes()"
        [checked]="arcChecked()"
        [disabled]="disabled()"
        (blur)="onCheckboxBlur()"
        (click)="onCheckboxChange()"
      />
      <arc-icon
        arcType="check"
        [class]="
          'text-primary-foreground pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-opacity ' +
          (arcChecked() ? 'opacity-100' : 'opacity-0')
        "
      />
    </div>
    <label [class]="labelClasses()" [for]="z.id()">
      <ng-content />
    </label>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ArcTechCheckboxComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'hostClasses()',
    '[attr.aria-disabled]': 'disabled()',
  },
  exportAs: 'arcCheckbox',
})
export class ArcTechCheckboxComponent implements ControlValueAccessor {
  readonly checkChange = output<boolean>();

  readonly class = input<ClassValue>('');
  readonly arcDisabled = input(false, { transform: booleanAttribute });
  readonly arcType = input<ArcTechCheckboxTypeVariants>('default');
  readonly arcSize = input<ArcTechCheckboxSizeVariants>('default');
  readonly arcShape = input<ArcTechCheckboxShapeVariants>('default');
  readonly arcNoLabelSpacing = input(false, { transform: booleanAttribute });
  readonly arcChecked = model<boolean>(false);

  private onChange: OnChangeType = noopFn;
  private onTouched: OnTouchedType = noopFn;

  protected readonly classes = computed(() =>
    mergeClasses(checkboxVariants({ arcType: this.arcType(), arcSize: this.arcSize(), arcShape: this.arcShape() }), this.class()),
  );

  protected readonly hostClasses = computed(() =>
    mergeClasses(
      this.disabled() ? 'cursor-not-allowed' : 'cursor-pointer',
      'flex items-center',
      this.arcNoLabelSpacing() ? 'gap-0' : 'gap-2',
    ),
  );

  readonly disabledByForm = signal(false);
  protected readonly labelClasses = computed(() => mergeClasses(checkboxLabelVariants({ arcSize: this.arcSize() })));
  protected readonly disabled = computed(() => this.arcDisabled() || this.disabledByForm());

  writeValue(val: boolean): void {
    this.arcChecked.set(val);
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledByForm.set(isDisabled);
  }

  registerOnChange(fn: OnChangeType): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: OnTouchedType): void {
    this.onTouched = fn;
  }

  onCheckboxBlur(): void {
    this.onTouched();
  }

  onCheckboxChange(): void {
    if (this.disabled()) {
      return;
    }

    this.arcChecked.update(v => !v);
    this.onChange(this.arcChecked());
    this.checkChange.emit(this.arcChecked());
  }
}
