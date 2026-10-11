import { ChangeDetectionStrategy, Component, computed, inject, input, output, ViewEncapsulation } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';

import { getCalendarMonthLabels, resolveCalendarLocale } from '@/shared/components/calendar/calendar.utils';
import { mergeClasses } from '@/shared/utils/merge-classes';

import { calendarNavVariants } from './calendar.variants';
import { ArcTechButtonComponent } from '@/shared/components/button/button.component';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';
import { ArcTechSelectItemComponent } from '@/shared/components/select/select-item.component';
import { ArcTechSelectComponent } from '@/shared/components/select/select.component';

@Component({
  selector: 'arc-calendar-navigation',
  imports: [ArcTechButtonComponent, ArcTechIconComponent, ArcTechSelectComponent, ArcTechSelectItemComponent],
  template: `
    <div [class]="navClasses()">
      <button
        type="button"
        arc-button
        arcType="ghost"
        arcSize="sm"
        (click)="onPreviousClick()"
        [disabled]="isPreviousDisabled()"
        [attr.aria-label]="previousMonthAriaLabel()"
        class="h-7 w-7 p-0"
      >
        <arc-icon arcType="chevron-left" />
      </button>

      <!-- Month and Year Selectors -->
      <div class="flex items-center space-x-2">
        <!-- Month Select -->
        <arc-select [arcValue]="currentMonth()" [arcLabel]="currentMonthName()" (arcSelectionChange)="onMonthChange($event)">
          @for (month of months(); track $index) {
            <arc-select-item [arcValue]="$index.toString()">{{ month }}</arc-select-item>
          }
        </arc-select>

        <!-- Year Select -->
        <arc-select [arcValue]="currentYear()" [arcLabel]="currentYear()" (arcSelectionChange)="onYearChange($event)">
          @for (year of availableYears(); track year) {
            <arc-select-item [arcValue]="year.toString()">{{ year }}</arc-select-item>
          }
        </arc-select>
      </div>

      <button
        type="button"
        arc-button
        arcType="ghost"
        arcSize="sm"
        (click)="onNextClick()"
        [disabled]="isNextDisabled()"
        [attr.aria-label]="nextMonthAriaLabel()"
        class="h-7 w-7 p-0"
      >
        <arc-icon arcType="chevron-right" />
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  exportAs: 'arcCalendarNavigation',
})
export class ArcTechCalendarNavigationComponent {
  private readonly translateService = inject(TranslateService);
  private readonly currentLocale = toSignal(
    this.translateService.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.translateService.currentLang ?? this.translateService.getCurrentLang() ?? 'en'),
    ),
    { initialValue: this.translateService.currentLang ?? this.translateService.getCurrentLang() ?? 'en' },
  );

  // Inputs
  readonly currentMonth = input.required<string>();
  readonly currentYear = input.required<string>();
  readonly minDate = input<Date | null>(null);
  readonly maxDate = input<Date | null>(null);
  readonly disabled = input<boolean>(false);

  // Outputs
  readonly monthChange = output<string>();
  readonly yearChange = output<string>();
  readonly previousMonth = output<void>();
  readonly nextMonth = output<void>();

  protected readonly navClasses = computed(() => mergeClasses(calendarNavVariants()));
  protected readonly months = computed(() => getCalendarMonthLabels(resolveCalendarLocale(this.currentLocale())));
  protected readonly previousMonthAriaLabel = computed(() =>
    this.translateService.instant('common.calendar.actions.previousMonth'),
  );
  protected readonly nextMonthAriaLabel = computed(() =>
    this.translateService.instant('common.calendar.actions.nextMonth'),
  );

  protected readonly availableYears = computed(() => {
    const minYear = this.minDate()?.getFullYear() ?? new Date().getFullYear() - 10;
    const maxYear = this.maxDate()?.getFullYear() ?? new Date().getFullYear() + 10;
    const years = [];
    for (let i = minYear; i <= maxYear; i++) {
      years.push(i);
    }
    return years;
  });

  protected readonly currentMonthName = computed(() => {
    const selectedMonth = Number.parseInt(this.currentMonth());
    const months = this.months();

    if (!Number.isNaN(selectedMonth) && months[selectedMonth]) {
      return months[selectedMonth];
    }
    return months[new Date().getMonth()];
  });

  protected readonly isPreviousDisabled = computed(() => {
    if (this.disabled()) {
      return true;
    }

    const minDate = this.minDate();
    if (!minDate) {
      return false;
    }

    const currentMonth = Number.parseInt(this.currentMonth());
    const currentYear = Number.parseInt(this.currentYear());
    const lastDayOfPreviousMonth = new Date(currentYear, currentMonth, 0);

    return lastDayOfPreviousMonth.getTime() < minDate.getTime();
  });

  protected readonly isNextDisabled = computed(() => {
    if (this.disabled()) {
      return true;
    }

    const maxDate = this.maxDate();
    if (!maxDate) {
      return false;
    }

    const currentMonth = Number.parseInt(this.currentMonth());
    const currentYear = Number.parseInt(this.currentYear());
    const nextMonth = new Date(currentYear, currentMonth + 1, 1);

    return nextMonth.getTime() > maxDate.getTime();
  });

  protected onPreviousClick(): void {
    this.previousMonth.emit();
  }

  protected onNextClick(): void {
    this.nextMonth.emit();
  }

  protected onMonthChange(month: string | string[]): void {
    if (Array.isArray(month)) {
      console.warn('Calendar navigation received array for month selection, expected single value. Ignoring:', month);
      return;
    }
    this.monthChange.emit(month);
  }

  protected onYearChange(year: string | string[]): void {
    if (Array.isArray(year)) {
      console.warn('Calendar navigation received array for year selection, expected single value. Ignoring:', year);
      return;
    }
    this.yearChange.emit(year);
  }
}
