import { type ComponentType, Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal, TemplatePortal } from '@angular/cdk/portal';
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, InjectionToken, Injector, PLATFORM_ID, TemplateRef } from '@angular/core';

import { ArcTechSheetRef } from './sheet-ref';
import { ArcTechSheetComponent, ArcTechSheetOptions } from './sheet.component';

type ContentType<T> = ComponentType<T> | TemplateRef<T> | string;
export const ARC_SHEET_DATA = new InjectionToken<any>('ARC_SHEET_DATA');

@Injectable({
  providedIn: 'root',
})
export class ArcTechSheetService {
  private overlay = inject(Overlay);
  private injector = inject(Injector);
  private platformId = inject(PLATFORM_ID);

  create<T, U>(config: ArcTechSheetOptions<T, U>): ArcTechSheetRef<T> {
    return this.open<T, U>(config.arcContent as ComponentType<T>, config);
  }

  private open<T, U>(componentOrTemplateRef: ContentType<T>, config: ArcTechSheetOptions<T, U>) {
    const overlayRef = this.createOverlay();

    if (!overlayRef) {
      // Return a mock sheet ref for SSR environments
      return new ArcTechSheetRef(undefined as any, config, undefined as any, this.platformId);
    }

    const sheetContainer = this.attachSheetContainer<T, U>(overlayRef, config);

    const sheetRef = this.attachSheetContent<T, U>(componentOrTemplateRef, sheetContainer, overlayRef, config);
    sheetContainer.sheetRef = sheetRef;

    return sheetRef;
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

  private attachSheetContainer<T, U>(overlayRef: OverlayRef, config: ArcTechSheetOptions<T, U>) {
    const injector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: OverlayRef, useValue: overlayRef },
        { provide: ArcTechSheetOptions, useValue: config },
      ],
    });

    const containerPortal = new ComponentPortal<ArcTechSheetComponent<T, U>>(
      ArcTechSheetComponent,
      config.arcViewContainerRef,
      injector,
    );
    const containerRef = overlayRef.attach<ArcTechSheetComponent<T, U>>(containerPortal);
    containerRef.instance.state.set('open');

    return containerRef.instance;
  }

  private attachSheetContent<T, U>(
    componentOrTemplateRef: ContentType<T>,
    sheetContainer: ArcTechSheetComponent<T, U>,
    overlayRef: OverlayRef,
    config: ArcTechSheetOptions<T, U>,
  ) {
    const sheetRef = new ArcTechSheetRef<T>(overlayRef, config, sheetContainer, this.platformId);

    if (componentOrTemplateRef instanceof TemplateRef) {
      sheetContainer.attachTemplatePortal(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        new TemplatePortal<T>(componentOrTemplateRef, null!, {
          sheetRef: sheetRef,
        } as any),
      );
    } else if (typeof componentOrTemplateRef !== 'string') {
      const injector = this.createInjector<T, U>(sheetRef, config);
      const contentRef = sheetContainer.attachComponentPortal<T>(
        new ComponentPortal(componentOrTemplateRef, config.arcViewContainerRef, injector),
      );
      sheetRef.componentInstance = contentRef.instance;
    }

    return sheetRef;
  }

  private createInjector<T, U>(sheetRef: ArcTechSheetRef<T>, config: ArcTechSheetOptions<T, U>) {
    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: ArcTechSheetRef, useValue: sheetRef },
        { provide: ARC_SHEET_DATA, useValue: config.arcData },
      ],
    });
  }
}
