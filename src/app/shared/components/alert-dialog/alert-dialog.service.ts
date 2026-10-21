import { TranslateService } from '@ngx-translate/core';
import { type ComponentType, Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal, TemplatePortal } from '@angular/cdk/portal';
import { isPlatformBrowser } from '@angular/common';
import {
  inject,
  Injectable,
  InjectionToken,
  Injector,
  PLATFORM_ID,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';

import { ArcTechAlertDialogRef } from './alert-dialog-ref';
import { ArcTechAlertDialogComponent, ArcTechAlertDialogOptions } from './alert-dialog.component';

type ContentType<T> = ComponentType<T> | TemplateRef<T> | string | undefined;

export const ARC_ALERT_MODAL_DATA = new InjectionToken<unknown>('ARC_ALERT_MODAL_DATA');

@Injectable({
  providedIn: 'root',
})
export class ArcTechAlertDialogService {
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly translate = inject(TranslateService);

  create<T>(config: ArcTechAlertDialogOptions<T>): ArcTechAlertDialogRef<T> {
    return this.open<T>(config.arcContent, config);
  }

  confirm<T>(
    config: Omit<ArcTechAlertDialogOptions<T>, 'arcOkText' | 'arcCancelText'> & {
      arcOkText?: string;
      arcCancelText?: string;
    },
  ): ArcTechAlertDialogRef<T> {
    const confirmConfig: ArcTechAlertDialogOptions<T> = {
      ...config,
      arcOkText: config.arcOkText ?? this.translate.instant('common.confirm'),
      arcCancelText: config.arcCancelText ?? this.translate.instant('common.cancel'),
      arcOkDestructive: config.arcOkDestructive ?? false,
    };
    return this.create(confirmConfig);
  }

  warning<T>(config: Omit<ArcTechAlertDialogOptions<T>, 'arcOkText'> & { arcOkText?: string }): ArcTechAlertDialogRef<T> {
    const warningConfig: ArcTechAlertDialogOptions<T> = {
      ...config,
      arcOkText: config.arcOkText ?? this.translate.instant('common.ok'),
      arcCancelText: null,
    };
    return this.create(warningConfig);
  }

  info<T>(config: Omit<ArcTechAlertDialogOptions<T>, 'arcOkText'> & { arcOkText?: string }): ArcTechAlertDialogRef<T> {
    const infoConfig: ArcTechAlertDialogOptions<T> = {
      ...config,
      arcOkText: config.arcOkText ?? this.translate.instant('common.ok'),
      arcCancelText: null,
    };
    return this.create(infoConfig);
  }

  private open<T>(componentOrTemplateRef: ContentType<T>, config: ArcTechAlertDialogOptions<T>) {
    const overlayRef = this.createOverlay();

    if (!overlayRef) {
      return new ArcTechAlertDialogRef(
        undefined as unknown as OverlayRef,
        config,
        undefined as unknown as ArcTechAlertDialogComponent<T>,
      );
    }

    const alertDialogContainer = this.attachAlertDialogContainer<T>(overlayRef, config);
    const alertDialogRef = this.attachAlertDialogContent<T>(
      componentOrTemplateRef,
      alertDialogContainer,
      overlayRef,
      config,
    );

    alertDialogContainer.alertDialogRef = alertDialogRef;

    return alertDialogRef;
  }

  private createOverlay(): OverlayRef | undefined {
    if (!isPlatformBrowser(this.platformId)) return undefined;

    const overlayConfig = new OverlayConfig({
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-dark-backdrop',
      positionStrategy: this.overlay.position().global(),
    });

    return this.overlay.create(overlayConfig);
  }

  private attachAlertDialogContainer<T>(overlayRef: OverlayRef, config: ArcTechAlertDialogOptions<T>) {
    const injector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: OverlayRef, useValue: overlayRef },
        { provide: ArcTechAlertDialogOptions, useValue: config },
      ],
    });

    const containerPortal = new ComponentPortal<ArcTechAlertDialogComponent<T>>(
      ArcTechAlertDialogComponent,
      config.arcViewContainerRef,
      injector,
    );

    const containerRef = overlayRef.attach(containerPortal);

    return containerRef.instance;
  }

  private attachAlertDialogContent<T>(
    componentOrTemplateRef: ContentType<T>,
    alertDialogContainer: ArcTechAlertDialogComponent<T>,
    overlayRef: OverlayRef,
    config: ArcTechAlertDialogOptions<T>,
  ) {
    const alertDialogRef = new ArcTechAlertDialogRef<T>(overlayRef, config, alertDialogContainer);

    if (componentOrTemplateRef instanceof TemplateRef) {
      alertDialogContainer.attachTemplatePortal(
        new TemplatePortal<T>(
          componentOrTemplateRef,
          null as unknown as ViewContainerRef,
          {
            alertDialogRef,
          } as T,
        ),
      );
    } else if (componentOrTemplateRef && typeof componentOrTemplateRef !== 'string') {
      const injector = this.createInjector<T>(alertDialogRef, config);
      const contentRef = alertDialogContainer.attachComponentPortal(
        new ComponentPortal(componentOrTemplateRef, config.arcViewContainerRef, injector),
      );
      alertDialogRef.componentInstance = contentRef.instance;
    }

    return alertDialogRef;
  }

  private createInjector<T>(alertDialogRef: ArcTechAlertDialogRef<T>, config: ArcTechAlertDialogOptions<T>) {
    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: ArcTechAlertDialogRef, useValue: alertDialogRef },
        { provide: ARC_ALERT_MODAL_DATA, useValue: config.arcData },
      ],
    });
  }
}
