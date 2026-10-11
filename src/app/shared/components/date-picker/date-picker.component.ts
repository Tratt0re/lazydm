import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  model,
  output,
  viewChild,
  ViewEncapsulation,
  type TemplateRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import type { ClassValue } from 'clsx';

import { ArcTechButtonComponent } from '@/shared/components/button/button.component';
import type { ArcTechButtonSizeVariants, ArcTechButtonTypeVariants } from '@/shared/components/button/button.variants';
import { ArcTechCalendarComponent } from '@/shared/components/calendar/calendar.component';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';
import { ArcTechPopoverComponent, ArcTechPopoverDirective } from '@/shared/components/popover/popover.component';
import type { ArcTechPopoverPlacement } from '@/shared/components/popover/popover.component';
import { ArcTechIdDirective } from '@/shared/core';

import { mergeClasses, transform } from '@/shared/utils/merge-classes';

const HEIGHT_BY_SIZE: Record<NonNullable<ArcTechButtonSizeVariants>, string> = {
  sm: 'h-8',
  default: 'h-10',
  lg: 'h-12',
};

@Component({
  selector: 'arc-date-picker, [arc-date-picker]',
  imports: [ArcTechButtonComponent, ArcTechCalendarComponent, ArcTechPopoverComponent, ArcTechPopoverDirective, ArcTechIconComponent, ArcTechIdDirective],
  standalone: true,
  template: `
    <button
      arc-button
      type="button"
      arcTechId="date-picker"
      #z="arcTechId"
      [id]="arcId() || z.id()"
      [arcType]="arcType()"
      [arcSize]="arcSize()"
      [arcDisabled]="disabled()"
      [disabled]="disabled()"
      [class]="buttonClasses()"
      arcPopover
      #popoverDirective="arcPopover"
      [arcContent]="calendarTemplate"
      arcTrigger="click"
      [arcPlacement]="arcPopoverPlacement()"
      [arcAutoFlip]="arcPopoverAutoFlip()"
      [arcPush]="arcPopoverPush()"
      [arcViewportMargin]="arcPopoverViewportMargin()"
      (arcVisibleChange)="onPopoverVisibilityChange($event)"
      [attr.aria-expanded]="false"
      [attr.aria-haspopup]="true"
      [attr.aria-label]="chooseDateAriaLabel()"
    >
      @if (arcIconPosition() === 'left') {
        <arc-icon arcType="calendar" [class]="arcCalendarIconClass()" />
      }
      <span [class]="textClasses()">
        {{ displayText() }}
      </span>
      @if (arcIconPosition() === 'right') {
        <arc-icon arcType="calendar" [class]="arcCalendarIconClass()" />
      }
    </button>

    <ng-template #calendarTemplate>
      <arc-popover [class]="popoverClasses()">
        <arc-calendar
          #calendar
          class="border-0"
          [value]="value()"
          [minDate]="minDate()"
          [maxDate]="maxDate()"
          [disabled]="disabled()"
          (dateChange)="onDateChange($event)"
        />
      </arc-popover>
    </ng-template>
  `,
  providers: [
    DatePipe,
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ArcTechDatePickerComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'class()',
  },
  exportAs: 'arcDatePicker',
})
export class ArcTechDatePickerComponent implements ControlValueAccessor {
  private readonly datePipe = inject(DatePipe);
  private readonly translateService = inject(TranslateService);
  private readonly currentLocale = toSignal(
    this.translateService.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.translateService.currentLang ?? this.translateService.getCurrentLang() ?? 'en'),
    ),
    { initialValue: this.translateService.currentLang ?? this.translateService.getCurrentLang() ?? 'en' },
  );

  readonly calendarTemplate = viewChild.required<TemplateRef<unknown>>('calendarTemplate');
  readonly popoverDirective = viewChild.required<ArcTechPopoverDirective>('popoverDirective');
  readonly calendar = viewChild.required<ArcTechCalendarComponent>('calendar');

  readonly arcId = input<string>('');
  readonly class = input<ClassValue>('');
  readonly arcType = input<ArcTechButtonTypeVariants>('outline');
  readonly arcSize = input<ArcTechButtonSizeVariants>('default');
  readonly arcIconPosition = input<'left' | 'right'>('left');
  readonly arcBorderless = input(false, { transform });
  readonly arcPaddingless = input(false, { transform });
  readonly arcCalendarIconClass = input<ClassValue>('');
  readonly arcPopoverPlacement = input<ArcTechPopoverPlacement>('bottom');
  readonly arcPopoverAutoFlip = input(true, { transform });
  readonly arcPopoverPush = input(false, { transform });
  readonly arcPopoverViewportMargin = input(8);
  readonly value = model<Date | null>(null);
  readonly placeholder = input<string>('Pick a date');
  readonly arcFormat = input<string>('MMMM d, yyyy');
  readonly minDate = input<Date | null>(null);
  readonly maxDate = input<Date | null>(null);
  readonly disabled = model<boolean>(false);

  readonly dateChange = output<Date | null>();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (value: Date | null) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched: () => void = () => {};

  protected readonly buttonClasses = computed(() => {
    const hasValue = !!this.value();
    const size = this.arcSize();
    const height = HEIGHT_BY_SIZE[size];
    return mergeClasses(
      'text-left font-normal',
      this.arcIconPosition() === 'right' ? 'justify-between' : 'justify-start',
      this.arcBorderless()
        ? 'border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent'
        : '',
      this.arcPaddingless() ? 'px-0 py-0' : '',
      !hasValue && 'text-muted-foreground',
      height,
      'w-full min-w-0',
    );
  });

  protected readonly textClasses = computed(() => {
    const hasValue = !!this.value();
    return mergeClasses(!hasValue && 'text-muted-foreground');
  });

  protected readonly popoverClasses = computed(() => mergeClasses('w-auto p-0'));
  protected readonly chooseDateAriaLabel = computed(() =>
    this.translateService.instant('common.calendar.aria.chooseDate'),
  );

  protected readonly displayText = computed(() => {
    const locale = this.currentLocale();
    const date = this.value();
    if (!date) {
      return this.placeholder();
    }
    return this.formatDate(date, this.arcFormat(), locale);
  });

  protected onDateChange(date: Date | Date[]): void {
    // Date picker always uses single mode, so we can safely cast
    const singleDate = Array.isArray(date) ? (date[0] ?? null) : date;
    this.value.set(singleDate);
    this.onChange(singleDate);
    this.onTouched();
    this.dateChange.emit(singleDate);

    this.popoverDirective().hide();
  }

  protected onPopoverVisibilityChange(visible: boolean): void {
    if (visible) {
      setTimeout(() => {
        if (this.calendar()) {
          this.calendar().resetNavigation();
        }
      });
    }
  }

  private formatDate(date: Date, format: string, locale?: string): string {
    return this.datePipe.transform(date, format, undefined, locale) ?? '';
  }

  writeValue(value: Date | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
