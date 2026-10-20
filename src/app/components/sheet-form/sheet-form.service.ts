import { Injectable } from '@angular/core';

import {
  type SheetOnClickCallback,
  type ArcTechSheetOptions,
  ArcTechSheetRef,
  ArcTechSheetService,
} from '@/shared/components/sheet';
import { AppSheetFormComponent } from './sheet-form.component';
import type { AppSheetField, AppSheetFieldValueMap, AppSheetFormData } from './sheet-form.types';

export interface AppSheetFormOpenOptions
  extends Omit<ArcTechSheetOptions<AppSheetFormComponent, AppSheetFormData>, 'arcContent' | 'arcData' | 'arcOnOk'> {
  readonly fields: readonly AppSheetField[];
  readonly values?: AppSheetFieldValueMap;
  readonly validateBeforeSubmit?: boolean;
  readonly onFieldChange?: AppSheetFormData['onFieldChange'];
  readonly onSubmit?: SheetOnClickCallback<AppSheetFormComponent>;
}

@Injectable({
  providedIn: 'root',
})
export class AppSheetFormService {
  constructor(private readonly arcTechSheetService: ArcTechSheetService) {}

  open(options: AppSheetFormOpenOptions): ArcTechSheetRef<AppSheetFormComponent> {
    const {
      fields,
      values,
      validateBeforeSubmit = true,
      onFieldChange,
      onSubmit,
      ...sheetOptions
    } = options;

    const data: AppSheetFormData = {
      fields,
      values,
      onFieldChange,
    };

    return this.arcTechSheetService.create<AppSheetFormComponent, AppSheetFormData>({
      ...sheetOptions,
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
  }
}
