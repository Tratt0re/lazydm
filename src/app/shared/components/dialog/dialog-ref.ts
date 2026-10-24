import type { OverlayRef } from '@angular/cdk/overlay';
import { isPlatformBrowser } from '@angular/common';
import { EventEmitter, Inject, PLATFORM_ID } from '@angular/core';

import { filter, fromEvent, Subject, takeUntil } from 'rxjs';

import type { ArcTechDialogComponent, ArcTechDialogOptions } from './dialog.component';

const enum eTriggerAction {
  CANCEL = 'cancel',
  MIDDLE = 'middle',
  OK = 'ok',
}

export class ArcTechDialogRef<T = any, R = any, U = any> {
  private destroy$ = new Subject<void>();
  private isClosing = false;
  protected result?: R;
  componentInstance: T | null = null;

  constructor(
    private overlayRef: OverlayRef,
    private config: ArcTechDialogOptions<T, U>,
    private containerInstance: ArcTechDialogComponent<T, U>,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    this.containerInstance.cancelTriggered.subscribe(() => this.trigger(eTriggerAction.CANCEL));
    this.containerInstance.middleTriggered.subscribe(() => this.trigger(eTriggerAction.MIDDLE));
    this.containerInstance.okTriggered.subscribe(() => this.trigger(eTriggerAction.OK));
    this.containerInstance.backTriggered.subscribe(() => this.config.arcOnBack?.());

    if ((this.config.arcMaskClosable ?? true) && isPlatformBrowser(this.platformId)) {
      this.overlayRef
        .outsidePointerEvents()
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.close());
    }

    if (isPlatformBrowser(this.platformId)) {
      fromEvent<KeyboardEvent>(document, 'keydown')
        .pipe(
          filter((event) => event.key === 'Escape'),
          takeUntil(this.destroy$),
        )
        .subscribe(() => this.close());
    }
  }

  /** Does what the confirm button does (the form's Enter key). */
  confirm(): void {
    this.trigger(eTriggerAction.OK);
  }

  /** Changes the text of the confirm button while the dialog is open. */
  setOkText(text: string): void {
    this.containerInstance.okText.set(text);
  }

  /**
   * Moves a multi-step dialog to another step without closing it: a new header, confirm text and, when `backText`
   * is given, a *Back* button (null removes it). The content component swaps its own fields.
   */
  setStep(step: {
    title?: string;
    description?: string | null;
    okText?: string;
    backText?: string | null;
  }): void {
    this.containerInstance.setStep(step);
  }

  close(result?: R) {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.result = result;

    if (isPlatformBrowser(this.platformId)) {
      const hostElement = this.containerInstance.getNativeElement();
      hostElement.classList.add('dialog-leave');
    }

    setTimeout(() => {
      if (this.overlayRef) {
        if (this.overlayRef.hasAttached()) {
          this.overlayRef.detachBackdrop();
        }
        this.overlayRef.dispose();
      }

      this.containerInstance.restoreFocus();

      if (!this.destroy$.closed) {
        this.destroy$.next();
        this.destroy$.complete();
      }
    }, 150);
  }

  private trigger(action: eTriggerAction) {
    const trigger = {
      ok: this.config.arcOnOk,
      middle: this.config.arcOnMiddle,
      cancel: this.config.arcOnCancel,
    }[action];

    if (trigger instanceof EventEmitter) {
      trigger.emit(this.getContentComponent());
    } else if (typeof trigger === 'function') {
      const result = trigger(this.getContentComponent()) as R;
      this.closeWithResult(result);
    } else {
      this.close();
    }
  }

  private getContentComponent(): T {
    return this.componentInstance as T;
  }

  private closeWithResult(result: R): void {
    if (result !== false) {
      this.close(result);
    }
  }
}
