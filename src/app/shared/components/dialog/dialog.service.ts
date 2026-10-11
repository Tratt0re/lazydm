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

import { ArcTechDialogRef } from './dialog-ref';
import { ArcTechDialogComponent, ArcTechDialogOptions } from './dialog.component';

type ContentType<T> = ComponentType<T> | TemplateRef<T> | string;

export const ARC_MODAL_DATA = new InjectionToken<any>('ARC_MODAL_DATA');

@Injectable({
  providedIn: 'root',
})
export class ArcTechDialogService {
  private overlay = inject(Overlay);
  private injector = inject(Injector);
  private platformId = inject(PLATFORM_ID);

  create<T, U>(config: ArcTechDialogOptions<T, U>): ArcTechDialogRef<T> {
    return this.open<T, U>(config.arcContent as ComponentType<T>, config);
  }

  private open<T, U>(componentOrTemplateRef: ContentType<T>, config: ArcTechDialogOptions<T, U>) {
    const overlayRef = this.createOverlay();

    if (!overlayRef) {
      return new ArcTechDialogRef(
        undefined as unknown as OverlayRef,
        config,
        undefined as unknown as ArcTechDialogComponent<T, U>,
        this.platformId,
      );
    }

    const dialogContainer = this.attachDialogContainer<T, U>(overlayRef, config);
    const dialogRef = this.attachDialogContent<T, U>(componentOrTemplateRef, dialogContainer, overlayRef, config);

    dialogContainer.dialogRef = dialogRef;

    return dialogRef;
  }

  private createOverlay(): OverlayRef | undefined {
    if (isPlatformBrowser(this.platformId)) {
      const overlayConfig = new OverlayConfig({
        hasBackdrop: true,
        positionStrategy: this.overlay.position().global(),
      });

      return this.overlay.create(overlayConfig);
    }

    return undefined;
  }

  private attachDialogContainer<T, U>(overlayRef: OverlayRef, config: ArcTechDialogOptions<T, U>) {
    const injector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: OverlayRef, useValue: overlayRef },
        { provide: ArcTechDialogOptions, useValue: config },
      ],
    });

    const containerPortal = new ComponentPortal<ArcTechDialogComponent<T, U>>(
      ArcTechDialogComponent,
      config.arcViewContainerRef,
      injector,
    );

    const containerRef = overlayRef.attach<ArcTechDialogComponent<T, U>>(containerPortal);

    return containerRef.instance;
  }

  private attachDialogContent<T, U>(
    componentOrTemplateRef: ContentType<T>,
    dialogContainer: ArcTechDialogComponent<T, U>,
    overlayRef: OverlayRef,
    config: ArcTechDialogOptions<T, U>,
  ) {
    const dialogRef = new ArcTechDialogRef<T>(overlayRef, config, dialogContainer, this.platformId);

    if (componentOrTemplateRef instanceof TemplateRef) {
      dialogContainer.attachTemplatePortal(
        new TemplatePortal<T>(
          componentOrTemplateRef,
          null as unknown as ViewContainerRef,
          {
            dialogRef,
          } as T,
        ),
      );
    } else if (typeof componentOrTemplateRef !== 'string') {
      const injector = this.createInjector<T, U>(dialogRef, config);
      const contentRef = dialogContainer.attachComponentPortal<T>(
        new ComponentPortal(componentOrTemplateRef, config.arcViewContainerRef, injector),
      );
      dialogRef.componentInstance = contentRef.instance;
    }

    return dialogRef;
  }

  private createInjector<T, U>(dialogRef: ArcTechDialogRef<T>, config: ArcTechDialogOptions<T, U>) {
    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: ArcTechDialogRef, useValue: dialogRef },
        { provide: ARC_MODAL_DATA, useValue: config.arcData },
      ],
    });
  }
}
