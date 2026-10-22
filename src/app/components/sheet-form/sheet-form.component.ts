import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { NumberFormatService } from '@/services/number-format.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechCheckboxComponent } from '@/shared/components/checkbox';
import {
  ArcTechComboboxComponent,
  type ArcTechComboboxGroup,
  type ArcTechComboboxOption,
} from '@/shared/components/combobox';
import { ArcTechDatePickerComponent } from '@/shared/components/date-picker';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechInputDirective } from '@/shared/components/input';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { ARC_MODAL_DATA } from '@/shared/components/dialog';
import { ARC_SHEET_DATA } from '@/shared/components/sheet';
import { mergeClasses } from '@/shared/utils/merge-classes';
import type {
  AppSheetCheckboxField,
  AppSheetComboboxField,
  AppSheetDatePickerField,
  AppSheetField,
  AppSheetFieldValue,
  AppSheetFieldValueMap,
  AppSheetFormData,
  AppSheetInputAction,
  AppSheetInputField,
  AppSheetSelectField,
  AppSheetSelectOption,
} from './sheet-form.types';

const DEFAULT_EMPTY_TEXT = 'No results found.';
const DEFAULT_SEARCH_PLACEHOLDER = 'Search...';
const DEFAULT_COMBOBOX_PLACEHOLDER = 'Select...';
const DEFAULT_DATE_PLACEHOLDER = 'Pick a date';
const DEFAULT_GRID_COLUMNS = 12;
const WIDTH_FRACTION_PATTERN = /^\s*(\d+)\s*\/\s*(\d+)\s*$/;
const GRID_SPAN_CLASS_BY_VALUE = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
} as const;

@Component({
  selector: 'app-sheet-form',
  imports: [
    ArcTechButtonComponent,
    ArcTechDatePickerComponent,
    ArcTechComboboxComponent,
    ArcTechCheckboxComponent,
    ArcTechIconComponent,
    ArcTechInputDirective,
    ...ArcTechSelectImports,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './sheet-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppSheetFormComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly numberFormatService = inject(NumberFormatService);
  private readonly translateService = inject(TranslateService);
  /** The form's data: handed over by the sheet or by the modal that hosts it. */
  private readonly sheetData =
    inject<AppSheetFormData | null>(ARC_SHEET_DATA, { optional: true }) ??
    inject<AppSheetFormData | null>(ARC_MODAL_DATA, { optional: true });

  readonly fields = input<readonly AppSheetField[] | null>(null);
  readonly values = input<AppSheetFieldValueMap | null>(null);
  readonly class = input<string>('');

  private readonly fieldValueState = signal<AppSheetFieldValueMap>({});
  /** Set once the user tried to confirm with fields missing: required fields then show their message. */
  private readonly showRequiredErrors = signal(false);

  protected readonly resolvedFields = computed<readonly AppSheetField[]>(() => this.fields() ?? this.sheetData?.fields ?? []);
  protected readonly resolvedClass = computed(() => this.class().trim());
  protected readonly containerClasses = computed(() =>
    mergeClasses('grid grid-cols-12 gap-4 p-4', this.resolvedClass()),
  );
  private readonly resolvedInitialValues = computed<AppSheetFieldValueMap>(() => this.values() ?? this.sheetData?.values ?? {});

  constructor() {
    effect(() => {
      const fields = this.resolvedFields();
      const initialValues = this.resolvedInitialValues();

      const nextValues: AppSheetFieldValueMap = {};
      for (const field of fields) {
        const hasExplicitValue = Object.prototype.hasOwnProperty.call(initialValues, field.id);
        const initialValue = hasExplicitValue ? initialValues[field.id] : field.value;
        nextValues[field.id] = this.normalizeFieldValue(field, initialValue);
      }

      this.fieldValueState.set(nextValues);
    });
  }

  public getValues(): AppSheetFieldValueMap {
    return { ...this.fieldValueState() };
  }

  public getValue(fieldId: string): AppSheetFieldValue | undefined {
    return this.fieldValueState()[fieldId];
  }

  public setValue(fieldId: string, value: AppSheetFieldValue): void {
    const field = this.resolvedFields().find((candidate) => candidate.id === fieldId);
    if (!field) {
      return;
    }

    this.patchValue(fieldId, this.normalizeFieldValue(field, value));
  }

  public isValid(): boolean {
    for (const field of this.resolvedFields()) {
      const value = this.fieldValueState()[field.id];
      if (this.fieldError(field) !== null) {
        return false;
      }

      if (field.required && this.isFieldValueEmpty(field, value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Called when the user confirms with the form not valid: required fields that are empty now show their
   * message, and the first field with a problem gets the focus.
   */
  public revealErrors(): void {
    this.showRequiredErrors.set(true);
    const first = this.resolvedFields().find((field) => this.fieldError(field) !== null);
    if (first) {
      queueMicrotask(() => this.focusField(first.id));
    }
  }

  /** The message under a field: what its `validate` refuses, else "required" for an empty required field. */
  protected fieldError(field: AppSheetField): string | null {
    const validate = field.validate as ((value: AppSheetFieldValue | undefined) => string | null) | undefined;
    const value = this.fieldValueState()[field.id];
    const custom = validate?.(value) ?? null;
    if (custom !== null) {
      return custom;
    }

    if (this.showRequiredErrors() && field.required && this.isFieldValueEmpty(field, value)) {
      return this.translateService.instant('form.required');
    }

    return null;
  }

  private focusField(fieldId: string): void {
    const target = this.host.nativeElement.querySelector<HTMLElement>(`[data-field-id="${fieldId}"]`);
    const focusable = target?.matches('input, button, [tabindex]')
      ? target
      : target?.querySelector<HTMLElement>('input, button, [tabindex]');
    focusable?.focus();
  }

  /** Enter in a text field confirms the modal, like a native form (the confirm button lives in the footer). */
  protected onEnter(event: Event): void {
    const target = event.target;
    const isComposing = event instanceof KeyboardEvent && event.isComposing;
    if (target instanceof HTMLInputElement && !target.disabled && !isComposing) {
      event.preventDefault();
      this.sheetData?.submit?.();
    }
  }

  protected onDateChange(field: AppSheetDatePickerField, value: Date | null): void {
    this.userChanged(field, value);
  }

  protected onComboboxChange(field: AppSheetComboboxField, value: string | string[] | null): void {
    this.userChanged(field, value);
  }

  protected onSelectChange(field: AppSheetSelectField, value: string | string[]): void {
    this.userChanged(field, value);
  }

  protected onCheckboxChange(field: AppSheetCheckboxField, value: boolean): void {
    this.userChanged(field, value);
  }

  protected onInputChange(field: AppSheetInputField, value: string): void {
    this.userChanged(field, value);
  }

  protected dateValue(field: AppSheetDatePickerField): Date | null {
    return this.normalizeDateValue(this.fieldValueState()[field.id]);
  }

  protected comboboxValue(field: AppSheetComboboxField): string | string[] | null {
    const currentValue = this.fieldValueState()[field.id];

    if (field.multiple) {
      if (Array.isArray(currentValue)) {
        return this.normalizeComboboxValues(currentValue);
      }

      if (typeof currentValue === 'string' && currentValue.trim().length > 0) {
        return [currentValue.trim()];
      }

      return [];
    }

    if (typeof currentValue !== 'string') {
      return null;
    }

    const normalizedValue = currentValue.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  protected checkboxValue(field: AppSheetCheckboxField): boolean {
    return Boolean(this.fieldValueState()[field.id]);
  }

  protected selectValue(field: AppSheetSelectField): string | string[] {
    const currentValue = this.fieldValueState()[field.id];
    if (field.multiple) {
      if (Array.isArray(currentValue)) {
        return this.normalizeComboboxValues(currentValue);
      }

      if (typeof currentValue === 'string' && currentValue.trim().length > 0) {
        return [currentValue.trim()];
      }

      return [];
    }

    if (typeof currentValue !== 'string') {
      return '';
    }

    return currentValue.trim();
  }

  protected inputValue(field: AppSheetInputField): string {
    const currentValue = this.fieldValueState()[field.id];
    if (typeof currentValue !== 'string') {
      return '';
    }

    return currentValue;
  }

  protected comboboxOptions(field: AppSheetComboboxField): ArcTechComboboxOption[] {
    const fieldTranslate = field.translate ?? false;
    return (field.options ?? []).map((option) => ({
      ...option,
      label: this.translateMaybe(option.label, option.translate ?? fieldTranslate),
    }));
  }

  protected comboboxGroups(field: AppSheetComboboxField): ArcTechComboboxGroup[] {
    const fieldTranslate = field.translate ?? false;
    return (field.groups ?? []).map((group) => ({
      label: group.label ? this.translateMaybe(group.label, group.translate ?? fieldTranslate) : undefined,
      options: group.options.map((option) => ({
        ...option,
        label: this.translateMaybe(option.label, option.translate ?? fieldTranslate),
      })),
    }));
  }

  protected selectOptions(field: AppSheetSelectField): AppSheetSelectOption[] {
    const fieldTranslate = field.translate ?? false;
    return (field.options ?? []).map((option) => ({
      ...option,
      label: this.translateMaybe(option.label, option.translate ?? fieldTranslate),
    }));
  }

  protected displayLabel(field: AppSheetField): string {
    return this.translateMaybe(field.label ?? '', field.translate ?? false);
  }

  protected displayDescription(field: AppSheetField): string {
    return this.translateMaybe(field.description ?? '', field.translate ?? false);
  }

  protected displayPlaceholder(field: AppSheetField): string {
    const placeholder = field.placeholder ?? this.defaultPlaceholder(field);
    return this.translateMaybe(placeholder, field.translate ?? false);
  }

  protected displaySearchPlaceholder(field: AppSheetComboboxField): string {
    return this.translateMaybe(field.searchPlaceholder ?? DEFAULT_SEARCH_PLACEHOLDER, field.translate ?? false);
  }

  protected displayEmptyText(field: AppSheetComboboxField): string {
    return this.translateMaybe(field.emptyText ?? DEFAULT_EMPTY_TEXT, field.translate ?? false);
  }

  protected checkboxLabel(field: AppSheetCheckboxField): string {
    const label = field.checkboxLabel ?? field.label ?? '';
    return this.translateMaybe(label, field.translate ?? false);
  }

  protected isDatePickerField(field: AppSheetField): field is AppSheetDatePickerField {
    return field.type === 'date-picker';
  }

  protected isComboboxField(field: AppSheetField): field is AppSheetComboboxField {
    return field.type === 'combobox';
  }

  protected isSelectField(field: AppSheetField): field is AppSheetSelectField {
    return field.type === 'select';
  }

  protected isCheckboxField(field: AppSheetField): field is AppSheetCheckboxField {
    return field.type === 'checkbox';
  }

  protected isInputField(field: AppSheetField): field is AppSheetInputField {
    return field.type === 'input';
  }

  protected minDate(field: AppSheetDatePickerField): Date | null {
    return this.normalizeDateValue(field.minDate);
  }

  protected maxDate(field: AppSheetDatePickerField): Date | null {
    return this.normalizeDateValue(field.maxDate);
  }

  /** The button inside an input was pressed: its result, when there is one, becomes the input's value. */
  protected async runInputAction(field: AppSheetInputField, action: AppSheetInputAction): Promise<void> {
    const value = await action.run(this);
    if (value !== null) {
      this.setValue(field.id, value);
    }
  }

  protected fieldWidthClass(field: AppSheetField): string {
    const span = this.resolveFieldSpan(field);
    return GRID_SPAN_CLASS_BY_VALUE[span as keyof typeof GRID_SPAN_CLASS_BY_VALUE] ?? 'col-span-12';
  }

  private defaultPlaceholder(field: AppSheetField): string {
    if (field.type === 'date-picker') {
      return DEFAULT_DATE_PLACEHOLDER;
    }

    if (field.type === 'combobox') {
      return DEFAULT_COMBOBOX_PLACEHOLDER;
    }

    if (field.type === 'select') {
      return DEFAULT_COMBOBOX_PLACEHOLDER;
    }

    if (field.type === 'input') {
      return '';
    }

    return '';
  }

  private resolveFieldSpan(field: AppSheetField): number {
    const width = field.width;
    if (!width || width === 'full') {
      return DEFAULT_GRID_COLUMNS;
    }

    const match = WIDTH_FRACTION_PATTERN.exec(width);
    if (!match) {
      return DEFAULT_GRID_COLUMNS;
    }

    const numerator = Number.parseInt(match[1], 10);
    const denominator = Number.parseInt(match[2], 10);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
      return DEFAULT_GRID_COLUMNS;
    }

    const ratio = numerator / denominator;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return DEFAULT_GRID_COLUMNS;
    }

    return Math.min(DEFAULT_GRID_COLUMNS, Math.max(1, Math.round(DEFAULT_GRID_COLUMNS * ratio)));
  }

  /** A change made by the user: stored, then reported to the form's owner (it may fill in other fields). */
  private userChanged(field: AppSheetField, value: unknown): void {
    const normalized = this.normalizeFieldValue(field, value);
    this.patchValue(field.id, normalized);
    this.sheetData?.onFieldChange?.(field.id, normalized, this);
  }

  private patchValue(fieldId: string, value: AppSheetFieldValue): void {
    this.fieldValueState.update((state) => ({
      ...state,
      [fieldId]: value,
    }));
  }

  private normalizeFieldValue(field: AppSheetField, value: unknown): AppSheetFieldValue {
    switch (field.type) {
      case 'date-picker':
        return this.normalizeDateValue(value);
      case 'combobox': {
        if (field.multiple) {
          if (Array.isArray(value)) {
            return this.normalizeComboboxValues(value);
          }

          if (typeof value === 'string') {
            const normalizedValue = value.trim();
            return normalizedValue.length > 0 ? [normalizedValue] : [];
          }

          return [];
        }

        if (typeof value !== 'string') {
          return null;
        }

        const normalizedValue = value.trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
      }
      case 'select': {
        if (field.multiple) {
          if (Array.isArray(value)) {
            return this.normalizeComboboxValues(value);
          }

          if (typeof value === 'string') {
            const normalizedValue = value.trim();
            return normalizedValue.length > 0 ? [normalizedValue] : [];
          }

          return [];
        }

        if (Array.isArray(value)) {
          if (value.length === 0) {
            return null;
          }

          const [firstValue] = this.normalizeComboboxValues(value);
          return firstValue ?? null;
        }

        if (typeof value !== 'string') {
          return null;
        }

        const normalizedValue = value.trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
      }
      case 'checkbox':
        return Boolean(value);
      case 'input': {
        if (typeof value !== 'string') {
          return null;
        }

        const normalizedValue = field.inputType === 'number'
          ? this.numberFormatService.normalizeInput(value)
          : value.trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
      }
      default:
        return null;
    }
  }

  private normalizeDateValue(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalizedMilliseconds = Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
      const date = new Date(normalizedMilliseconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsedMilliseconds = Date.parse(value);
      if (!Number.isNaN(parsedMilliseconds)) {
        return new Date(parsedMilliseconds);
      }
    }

    return null;
  }

  private isFieldValueEmpty(field: AppSheetField, value: AppSheetFieldValue | undefined): boolean {
    switch (field.type) {
      case 'checkbox':
        return value !== true;
      case 'combobox':
        if (field.multiple) {
          return !Array.isArray(value) || value.length === 0;
        }

        return typeof value !== 'string' || value.trim().length === 0;
      case 'select':
        if (field.multiple) {
          return !Array.isArray(value) || value.length === 0;
        }

        return typeof value !== 'string' || value.trim().length === 0;
      case 'date-picker':
        return !(value instanceof Date) || Number.isNaN(value.getTime());
      case 'input':
        return typeof value !== 'string' || value.trim().length === 0;
      default:
        return true;
    }
  }

  private normalizeComboboxValues(values: readonly unknown[]): string[] {
    const uniqueValues = new Set<string>();

    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }

      const normalizedValue = value.trim();
      if (normalizedValue.length > 0) {
        uniqueValues.add(normalizedValue);
      }
    }

    return Array.from(uniqueValues);
  }

  private translateMaybe(value: string, shouldTranslate: boolean): string {
    if (!shouldTranslate || value.trim().length === 0) {
      return value;
    }

    const translated = this.translateService.instant(value);
    return translated !== value ? translated : value;
  }
}
