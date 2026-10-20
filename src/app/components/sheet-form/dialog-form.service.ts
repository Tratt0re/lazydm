import { Injectable, inject } from '@angular/core';

import {
  type ArcTechDialogOptions,
  ArcTechDialogRef,
  ArcTechDialogService,
  type DialogOnClickCallback,
} from '@/shared/components/dialog';
import { AppSheetFormComponent } from './sheet-form.component';
import type { AppSheetField, AppSheetFieldValueMap, AppSheetFormData } from './sheet-form.types';

export interface AppDialogFormOpenOptions
  extends Omit<
    ArcTechDialogOptions<AppSheetFormComponent, AppSheetFormData>,
    'arcContent' | 'arcData' | 'arcOnOk'
  > {
  readonly fields: readonly AppSheetField[];
  readonly values?: AppSheetFieldValueMap;
  readonly validateBeforeSubmit?: boolean;
  readonly onFieldChange?: AppSheetFormData['onFieldChange'];
  /** Text of the confirm button for the current values; it is updated as the user changes fields. */
  readonly okTextFor?: (values: AppSheetFieldValueMap) => string;
  readonly onSubmit?: DialogOnClickCallback<AppSheetFormComponent>;
}

/**
 * Creates and edits go in a modal: the same form (fields, validation, confirm text that follows the values) as
 * the sheet form service used to host in a side sheet. Side sheets are for information.
 */
@Injectable({
  providedIn: 'root',
})
export class AppDialogFormService {
  private readonly dialogService = inject(ArcTechDialogService);

  open(options: AppDialogFormOpenOptions): ArcTechDialogRef<AppSheetFormComponent> {
    const {
      fields,
      values,
      validateBeforeSubmit = true,
      onFieldChange,
      okTextFor,
      onSubmit,
      ...dialogOptions
    } = options;

    let dialogRef: ArcTechDialogRef<AppSheetFormComponent> | null = null;
    const data: AppSheetFormData = {
      fields,
      values,
      onFieldChange: (fieldId, value, form) => {
        onFieldChange?.(fieldId, value, form);
        if (okTextFor) {
          dialogRef?.setOkText(okTextFor(form.getValues()));
        }
      },
    };

    dialogRef = this.dialogService.create<AppSheetFormComponent, AppSheetFormData>({
      arcCustomClasses: 'sm:max-w-lg',
      ...dialogOptions,
      arcContent: AppSheetFormComponent,
      arcData: data,
      arcOnOk: (component) => {
        if (validateBeforeSubmit && !component.isValid()) {
          return false;
        }

        if (onSubmit) {
          return onSubmit(component);
        }

        return component.getValues();
      },
    });
    return dialogRef;
  }
}
