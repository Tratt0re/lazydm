import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import {
  formControlVariants,
  formFieldVariants,
  formLabelVariants,
  formMessageVariants,
  type ArcTechFormMessageTypeVariants,
} from '@/shared/components/form/form.variants';
import { mergeClasses, transform } from '@/shared/utils/merge-classes';

@Component({
  selector: 'arc-form-field, [arc-form-field]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcFormField',
})
export class ArcTechFormFieldComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(formFieldVariants(), this.class()));
}

@Component({
  selector: 'arc-form-control, [arc-form-control]',
  imports: [],
  template: `
    <div class="relative">
      <ng-content />
    </div>
    <div class="mt-1.5 min-h-5" role="status" aria-live="polite" aria-atomic="true">
      @if (errorMessage()) {
        <p class="text-sm text-destructive">{{ errorMessage() }}</p>
      } @else if (helpText()) {
        <p class="text-muted-foreground text-sm">{{ helpText() }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcFormControl',
})
export class ArcTechFormControlComponent {
  readonly class = input<ClassValue>('');
  readonly errorMessage = input<string>('');
  readonly helpText = input<string>('');

  protected readonly classes = computed(() => mergeClasses(formControlVariants(), this.class()));
}

@Component({
  selector: 'arc-form-label, label[arc-form-label]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcFormLabel',
})
export class ArcTechFormLabelComponent {
  readonly class = input<ClassValue>('');
  readonly arcRequired = input(false, { transform });

  protected readonly classes = computed(() =>
    mergeClasses(formLabelVariants({ arcRequired: this.arcRequired() }), this.class()),
  );
}

@Component({
  selector: 'arc-form-message, [arc-form-message]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcFormMessage',
})
export class ArcTechFormMessageComponent {
  readonly class = input<ClassValue>('');
  readonly arcType = input<ArcTechFormMessageTypeVariants>('default');

  protected readonly classes = computed(() => mergeClasses(formMessageVariants({ arcType: this.arcType() }), this.class()));
}
