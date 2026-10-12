import { OverlayModule } from '@angular/cdk/overlay';
import { A11yModule } from '@angular/cdk/a11y';
import {
  BasePortalOutlet,
  CdkPortalOutlet,
  type ComponentPortal,
  PortalModule,
  type TemplatePortal,
} from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  ElementRef,
  type EmbeddedViewRef,
  type EventEmitter,
  inject,
  output,
  signal,
  type TemplateRef,
  type Type,
  viewChild,
  type ViewContainerRef,
} from '@angular/core';

import { mergeClasses, noopFn } from '@/shared/utils/merge-classes';

import type { ArcTechSheetRef } from './sheet-ref';
import { sheetVariants, type ArcTechSheetVariants } from './sheet.variants';
import { ArcTechButtonComponent } from '@/shared/components/button/button.component';
import type { ArcTechButtonTypeVariants } from '@/shared/components/button/button.variants';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';
import type { ArcTechIcon } from '@/shared/components/icon/icons';

export type OnClickCallback<T> = (instance: T) => false | void | object;
export class ArcTechSheetOptions<T, U> {
  arcCancelIcon?: ArcTechIcon;
  arcCancelText?: string | null;
  arcClosable?: boolean;
  arcContent?: string | TemplateRef<T> | Type<T>;
  arcCustomClasses?: string;
  arcData?: U;
  arcDescription?: string;
  arcHeight?: string;
  arcHideFooter?: boolean;
  arcMaskClosable?: boolean;
  arcMiddleDisabled?: boolean;
  arcMiddleIcon?: ArcTechIcon;
  arcMiddleText?: string | null;
  arcMiddleType?: ArcTechButtonTypeVariants;
  arcOkDestructive?: boolean;
  arcOkDisabled?: boolean;
  arcOkIcon?: ArcTechIcon;
  arcOkText?: string | null;
  arcOnCancel?: EventEmitter<T> | OnClickCallback<T> = noopFn;
  arcOnMiddle?: EventEmitter<T> | OnClickCallback<T> = noopFn;
  arcOnOk?: EventEmitter<T> | OnClickCallback<T> = noopFn;
  arcSide?: ArcTechSheetVariants['arcSide'] = 'left';
  arcSize?: ArcTechSheetVariants['arcSize'] = 'default';
  arcTitle?: string | TemplateRef<T>;
  arcViewContainerRef?: ViewContainerRef;
  arcWidth?: string;
}

@Component({
  selector: 'arc-sheet',
  imports: [OverlayModule, PortalModule, A11yModule, ArcTechButtonComponent, ArcTechIconComponent],
  template: `
    <div cdkTrapFocus [cdkTrapFocusAutoCapture]="true" tabindex="-1" class="flex h-full min-h-0 flex-col">
      @if (config.arcClosable || config.arcClosable === undefined) {
        <button
          type="button"
          data-testid="arc-close-header-button"
          arc-button
          arcType="ghost"
          arcSize="sm"
          class="absolute top-4 right-4 z-10 cursor-pointer border border-input"
          (click)="onCloseClick()"
        >
          <arc-icon arcType="x" />
        </button>
      }

      @if (config.arcTitle || config.arcDescription) {
        <header data-slot="sheet-header" class="flex flex-col gap-1.5 px-6 pt-6 pb-4 pr-16">
          @if (config.arcTitle) {
            <h4
              data-testid="arc-title"
              data-slot="sheet-title"
              class="font-display text-[35px] leading-none font-extrabold tracking-[0.025em] text-foreground-strong uppercase"
            >
              {{ config.arcTitle }}
            </h4>
            <div class="arc-engraved-divider mt-2" aria-hidden="true"><span></span></div>

            @if (config.arcDescription) {
              <p data-testid="arc-description" data-slot="sheet-description" class="text-muted-foreground text-sm">
                {{ config.arcDescription }}
              </p>
            }
          }
        </header>
      }

      <main class="flex min-h-0 w-full flex-1 flex-col space-y-4 overflow-y-auto">
        <ng-template cdkPortalOutlet />

        @if (isStringContent) {
          <div data-testid="arc-content" data-slot="sheet-content" [innerHTML]="config.arcContent"></div>
        }
      </main>

      @if (!config.arcHideFooter) {
        <footer data-slot="sheet-footer" class="mt-auto flex flex-col gap-2 border-t border-border p-4">
          @if (config.arcOkText !== null) {
            <button
              type="button"
              data-testid="arc-ok-button"
              class="cursor-pointer"
              arc-button
              [arcType]="config.arcOkDestructive ? 'destructive' : 'default'"
              [disabled]="config.arcOkDisabled"
              (click)="onOkClick()"
            >
              @if (config.arcOkIcon) {
                <arc-icon [arcType]="config.arcOkIcon" />
              }

              {{ config.arcOkText ?? 'OK' }}
            </button>
          }

          @if (config.arcMiddleText !== null && config.arcMiddleText !== undefined) {
            <button
              type="button"
              data-testid="arc-middle-button"
              class="cursor-pointer"
              arc-button
              [arcType]="config.arcMiddleType ?? 'outline'"
              [disabled]="config.arcMiddleDisabled"
              (click)="onMiddleClick()"
            >
              @if (config.arcMiddleIcon) {
                <arc-icon [arcType]="config.arcMiddleIcon" />
              }

              {{ config.arcMiddleText }}
            </button>
          }

          @if (config.arcCancelText !== null) {
            <button
              type="button"
              data-testid="arc-cancel-button"
              class="cursor-pointer"
              arc-button
              arcType="outline"
              (click)="onCloseClick()"
            >
              @if (config.arcCancelIcon) {
                <arc-icon [arcType]="config.arcCancelIcon" />
              }

              {{ config.arcCancelText ?? 'Cancel' }}
            </button>
          }
        </footer>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-slot': 'sheet',
    '[class]': 'classes()',
    '[attr.data-state]': 'state()',
    '[style.width]': 'config.arcWidth ? config.arcWidth + " !important" : null',
    '[style.height]': 'config.arcHeight ? config.arcHeight + " !important" : null',
  },
  exportAs: 'arcSheet',
})
export class ArcTechSheetComponent<T, U> extends BasePortalOutlet {
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly config = inject(ArcTechSheetOptions<T, U>);

  protected readonly classes = computed(() => {
    const arcSize = this.config.arcWidth || this.config.arcHeight ? 'custom' : this.config.arcSize;

    return mergeClasses(
      sheetVariants({
        arcSide: this.config.arcSide,
        arcSize,
      }),
      this.config.arcCustomClasses,
    );
  });

  sheetRef?: ArcTechSheetRef<T>;

  protected readonly isStringContent = typeof this.config.arcContent === 'string';

  readonly portalOutlet = viewChild.required(CdkPortalOutlet);

  readonly okTriggered = output<void>();
  readonly middleTriggered = output<void>();
  readonly cancelTriggered = output<void>();
  readonly state = signal<'closed' | 'open'>('closed');

  constructor() {
    super();
  }

  getNativeElement(): HTMLElement {
    return this.host.nativeElement;
  }

  attachComponentPortal<T>(portal: ComponentPortal<T>): ComponentRef<T> {
    if (this.portalOutlet()?.hasAttached()) {
      throw new Error('Attempting to attach modal content after content is already attached');
    }
    return this.portalOutlet()?.attachComponentPortal(portal);
  }

  attachTemplatePortal<C>(portal: TemplatePortal<C>): EmbeddedViewRef<C> {
    if (this.portalOutlet()?.hasAttached()) {
      throw new Error('Attempting to attach modal content after content is already attached');
    }

    return this.portalOutlet()?.attachTemplatePortal(portal);
  }

  onOkClick() {
    this.okTriggered.emit();
  }

  onMiddleClick() {
    this.middleTriggered.emit();
  }

  onCloseClick() {
    this.cancelTriggered.emit();
  }
}
