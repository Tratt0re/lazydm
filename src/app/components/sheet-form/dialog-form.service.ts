import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import {
  type ArcTechDialogOptions,
  ArcTechDialogRef,
  ArcTechDialogService,
  type DialogOnClickCallback,
} from '@/shared/components/dialog';
import { AppSheetFormComponent } from './sheet-form.component';
import type { AppSheetField, AppSheetFieldValueMap, AppSheetFormData } from './sheet-form.types';

export interface AppDialogFormOpenOptions extends Omit<
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

/** One step of a wizard: what the modal shows and what confirming does. */
export interface AppDialogWizardStep {
  readonly title: string;
  readonly description?: string;
  readonly fields: readonly AppSheetField[];
  readonly values?: AppSheetFieldValueMap;
  /** Text of the confirm button (*Next* for a step that leads on). */
  readonly okText: string;
  /**
   * Confirming this step. Return another step to move on to it (the modal stays open and a *Back* button comes up),
   * `true` to close the modal, or `false` to stay where it is (a creation that failed).
   */
  readonly onSubmit: (
    form: AppSheetFormComponent,
  ) => AppDialogWizardStep | boolean | Promise<AppDialogWizardStep | boolean>;
  /** A field of this step changed (a map's image can be imported from disk, which refills the step). */
  readonly onFieldChange?: AppSheetFormData['onFieldChange'];
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
  private readonly translateService = inject(TranslateService);

  /**
   * A modal with steps: confirming a step shows the next one in the same modal (no close and reopen), with a *Back*
   * button that returns to the one before. The first step's `onSubmit` can return the second, and so on; `true`
   * closes the modal.
   */
  openWizard(
    first: AppDialogWizardStep,
    options: { readonly cancelText?: string; readonly customClasses?: string } = {},
  ): ArcTechDialogRef<AppSheetFormComponent> {
    const history: AppDialogWizardStep[] = [first];
    // What was typed in each step that led on, so *Back* finds it as it was left.
    const typed: AppSheetFieldValueMap[] = [];
    let isBusy = false;
    let dialogRef: ArcTechDialogRef<AppSheetFormComponent> | null = null;
    let formRef: AppSheetFormComponent | null = null;

    const show = (step: AppDialogWizardStep, values?: AppSheetFieldValueMap): void => {
      formRef?.setFields(step.fields, values ?? step.values);
      dialogRef?.setStep({
        title: step.title,
        description: step.description ?? null,
        okText: step.okText,
        backText: history.length > 1 ? this.translateService.instant('common.back') : null,
      });
    };

    dialogRef = this.open({
      arcTitle: first.title,
      arcDescription: first.description,
      arcOkText: first.okText,
      arcCancelText: options.cancelText ?? this.translateService.instant('common.cancel'),
      arcCustomClasses: options.customClasses,
      arcOnBack: () => {
        if (history.length > 1) {
          history.pop();
          show(history[history.length - 1], typed.pop());
        }
      },
      fields: first.fields,
      values: first.values,
      onFieldChange: (fieldId, value, form) =>
        history[history.length - 1].onFieldChange?.(fieldId, value, form),
      onSubmit: (form) => {
        formRef = form;
        if (isBusy) {
          return false;
        }

        isBusy = true;
        const current = history[history.length - 1];
        void Promise.resolve(current.onSubmit(form))
          .then((result) => {
            if (result === true) {
              dialogRef?.close();
            } else if (result !== false) {
              typed.push(form.getValues());
              history.push(result);
              show(result);
            }
          })
          .finally(() => {
            isBusy = false;
          });
        return false;
      },
    });
    return dialogRef;
  }

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
      submit: () => dialogRef?.confirm(),
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
          // Stay open, but say what is missing (red message under each empty required field).
          component.revealErrors();
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
