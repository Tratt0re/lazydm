import type { OverlayRef } from '@angular/cdk/overlay';
import { isPlatformBrowser } from '@angular/common';
import { EventEmitter, Inject, PLATFORM_ID } from '@angular/core';

import { filter, fromEvent, Subject, takeUntil } from 'rxjs';

import type { ArcTechSheetComponent, ArcTechSheetOptions } from './sheet.component';

const enum eTriggerAction {
  CANCEL = 'cancel',
  MIDDLE = 'middle',
  OK = 'ok',
}

export class ArcTechSheetRef<T = any, R = any, U = any> {
  private destroy$ = new Subject<void>();
  private isClosing = false;
  protected result?: R;
  componentInstance: T | null = null;

  constructor(
    private overlayRef: OverlayRef,
    private config: ArcTechSheetOptions<T, U>,
    private containerInstance: ArcTechSheetComponent<T, U>,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    this.containerInstance.cancelTriggered.subscribe(() => this.trigger(eTriggerAction.CANCEL));
    this.containerInstance.middleTriggered.subscribe(() => this.trigger(eTriggerAction.MIDDLE));
    this.containerInstance.okTriggered.subscribe(() => this.trigger(eTriggerAction.OK));

    if ((this.config.arcMaskClosable ?? true) && isPlatformBrowser(this.platformId)) {
      this.overlayRef
        .outsidePointerEvents()
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.close());
    }

    if (isPlatformBrowser(this.platformId)) {
      fromEvent<KeyboardEvent>(document, 'keydown')
        .pipe(
          filter(event => event.key === 'Escape'),
          takeUntil(this.destroy$),
        )
        .subscribe(() => this.close());
    }
  }

  /** Changes the text of the confirm button while the sheet is open. */
  setOkText(text: string): void {
    this.containerInstance.okText.set(text);
  }

  close(result?: R) {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.result = result;
    this.containerInstance.state.set('closed');

    if (isPlatformBrowser(this.platformId)) {
      const element = this.containerInstance.getNativeElement();
      let cleanupCalled = false;

      const onAnimationEnd = () => {
        if (cleanupCalled) {
          return;
        }

        cleanupCalled = true;
        element.removeEventListener('animationend', onAnimationEnd);
        this.closeCleanup();
      };

      element.addEventListener('animationend', onAnimationEnd);
      setTimeout(onAnimationEnd, 300); // Fallback after expected animation duration
    } else {
      this.closeCleanup();
    }
  }

  private trigger(action: eTriggerAction) {
    const trigger = { ok: this.config.arcOnOk, middle: this.config.arcOnMiddle, cancel: this.config.arcOnCancel }[action];

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

  private closeCleanup(): void {
    if (this.overlayRef) {
      if (this.overlayRef.hasAttached()) {
        this.overlayRef.detachBackdrop();
      }
      this.overlayRef.dispose();
    }

    if (!this.destroy$.closed) {
      this.destroy$.next();
      this.destroy$.complete();
    }
  }
}
