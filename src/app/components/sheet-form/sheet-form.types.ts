import type { ArcTechComboboxGroup, ArcTechComboboxOption } from '@/shared/components/combobox';
import type { ArcTechIcon } from '@/shared/components/icon';
import type { ArcTechPopoverPlacement } from '@/shared/components/popover/popover.component';
import type { ArcTechSelectSizeVariants } from '@/shared/components/select';

export type AppSheetFieldType = 'date-picker' | 'combobox' | 'select' | 'checkbox' | 'input';
export type AppSheetFieldWidth = `${number}/${number}` | 'full';
export type AppSheetInputType = 'text' | 'number' | 'email' | 'password' | 'search' | 'url';

export type AppSheetFieldValue = Date | string | readonly string[] | boolean | null;
export type AppSheetFieldValueMap = Record<string, AppSheetFieldValue>;

export interface AppSheetFieldBase<TType extends AppSheetFieldType, TValue extends AppSheetFieldValue> {
  readonly id: string;
  readonly type: TType;
  readonly value?: TValue;
  readonly label?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly width?: AppSheetFieldWidth;
  readonly translate?: boolean;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /** Returns an (already translated) error message while the value is not acceptable, else null. */
  readonly validate?: (value: TValue | undefined) => string | null;
}

export interface AppSheetDatePickerField extends AppSheetFieldBase<'date-picker', Date | string | null> {
  readonly arcFormat?: string;
  readonly arcIconPosition?: 'left' | 'right';
  readonly arcPopoverPlacement?: ArcTechPopoverPlacement;
  readonly arcPopoverAutoFlip?: boolean;
  readonly arcPopoverPush?: boolean;
  readonly arcPopoverViewportMargin?: number;
  readonly minDate?: Date | string | number | null;
  readonly maxDate?: Date | string | number | null;
}

export interface AppSheetComboboxOption extends Omit<ArcTechComboboxOption, 'label'> {
  readonly label: string;
  readonly translate?: boolean;
}

export interface AppSheetComboboxGroup extends Omit<ArcTechComboboxGroup, 'label' | 'options'> {
  readonly label?: string;
  readonly translate?: boolean;
  readonly options: readonly AppSheetComboboxOption[];
}

export interface AppSheetComboboxField
  extends AppSheetFieldBase<'combobox', string | readonly string[] | null> {
  readonly multiple?: boolean;
  readonly maxLabelCount?: number;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly emptyText?: string;
  readonly ariaLabel?: string;
  readonly options?: readonly AppSheetComboboxOption[];
  readonly groups?: readonly AppSheetComboboxGroup[];
}

export interface AppSheetSelectOption {
  readonly value: string;
  readonly label: string;
  readonly translate?: boolean;
  readonly icon?: ArcTechIcon;
  readonly colorHex?: string | null;
  readonly disabled?: boolean;
}

export interface AppSheetSelectField extends AppSheetFieldBase<'select', string | readonly string[] | null> {
  readonly multiple?: boolean;
  readonly maxLabelCount?: number;
  readonly showSelectedLabel?: boolean;
  readonly size?: ArcTechSelectSizeVariants;
  readonly options: readonly AppSheetSelectOption[];
}

export interface AppSheetCheckboxField extends AppSheetFieldBase<'checkbox', boolean> {
  readonly checkboxLabel?: string;
  readonly icon?: ArcTechIcon;
}

/** A button inside the input, on its right (a dice to roll its value, for instance). */
export interface AppSheetInputAction {
  readonly icon: ArcTechIcon;
  /** Accessible name and tooltip (already translated). */
  readonly label: string;
  /** Runs when pressed; a returned string becomes the value of the input. */
  readonly run: (form: import('./sheet-form.component').AppSheetFormComponent) => string | null | Promise<string | null>;
}

export interface AppSheetInputField extends AppSheetFieldBase<'input', string | null> {
  readonly inputType?: AppSheetInputType;
  readonly action?: AppSheetInputAction;
  /** A text area of a few lines instead of a one-line input (a note's text). */
  readonly multiline?: boolean;
}

export type AppSheetField =
  | AppSheetDatePickerField
  | AppSheetComboboxField
  | AppSheetSelectField
  | AppSheetCheckboxField
  | AppSheetInputField;

export interface AppSheetFormData {
  readonly fields: readonly AppSheetField[];
  readonly values?: AppSheetFieldValueMap;
  /** Confirms the modal that hosts the form (what Enter in a text field does). */
  readonly submit?: () => void;
  /** Called when the user changes a field; `form.setValue` can fill in the others. */
  readonly onFieldChange?: (
    fieldId: string,
    value: AppSheetFieldValue,
    form: import('./sheet-form.component').AppSheetFormComponent,
  ) => void;
}
