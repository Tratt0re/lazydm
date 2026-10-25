import { A11yModule } from '@angular/cdk/a11y';
import { TranslatePipe } from '@ngx-translate/core';
import { OverlayModule } from '@angular/cdk/overlay';
import {
  BasePortalOutlet,
  CdkPortalOutlet,
  type ComponentPortal,
  PortalModule,
  type TemplatePortal,
} from '@angular/cdk/portal';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  ElementRef,
  type EmbeddedViewRef,
  type EventEmitter,
  inject,
  Injector,
  NgModule,
  output,
  signal,
  type TemplateRef,
  type Type,
  viewChild,
  type ViewContainerRef,
} from '@angular/core';

import { mergeClasses, noopFn } from '@/shared/utils/merge-classes';

import type { ArcTechDialogRef } from './dialog-ref';
import { ArcTechDialogService } from './dialog.service';
import { dialogVariants } from './dialog.variants';
import { ArcTechButtonComponent } from '@/shared/components/button/button.component';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';
import type { ArcTechIcon } from '@/shared/components/icon/icons';
import type { ArcTechButtonTypeVariants } from '@/shared/components/button/button.variants';

// Used by the NgModule provider definition
let nextDialogInstanceId = 0;

export type OnClickCallback<T> = (instance: T) => false | void | object;
export class ArcTechDialogOptions<T, U> {
  arcCancelIcon?: ArcTechIcon;
  arcCancelText?: string | null;
  arcClosable?: boolean;
  arcContent?: string | TemplateRef<T> | Type<T>;
  arcCustomClasses?: string;
  arcData?: U;
  arcDescription?: string;
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
  /** Runs when the *Back* button of a multi-step dialog is pressed (it shows while the step has a back label). */
  arcOnBack?: () => void;
  arcOnCancel?: EventEmitter<T> | OnClickCallback<T> = noopFn;
  arcOnMiddle?: EventEmitter<T> | OnClickCallback<T> = noopFn;
  arcOnOk?: EventEmitter<T> | OnClickCallback<T> = noopFn;
  arcTitle?: string | TemplateRef<T>;
  arcViewContainerRef?: ViewContainerRef;
  arcWidth?: string;
}

@Component({
  selector: 'arc-dialog',
  imports: [
    A11yModule,
    OverlayModule,
    PortalModule,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    TranslatePipe,
  ],
  template: `
    <div
      #dialogSurface
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      tabindex="-1"
      class="flex h-full min-h-0 flex-col"
    >
      @if (config.arcClosable || config.arcClosable === undefined) {
        <button
          type="button"
          data-testid="arc-close-header-button"
          arc-button
          arcType="ghost"
          arcSize="sm"
          class="absolute top-4 right-4 z-10 border border-input"
          [attr.aria-label]="'common.closeDialog' | translate"
          [attr.title]="'common.closeDialog' | translate"
          (click)="onCloseClick()"
        >
          <arc-icon arcType="x" />
        </button>
      }

      @if (title() || description()) {
        <header class="flex shrink-0 flex-col space-y-1.5 text-center sm:text-left pb-2">
          @if (title()) {
            <h4
              data-testid="arc-title"
              class="pr-12 text-left font-display text-[35px] leading-none font-extrabold tracking-[0.025em] text-foreground-strong uppercase"
              [attr.id]="titleId()"
            >
              {{ title() }}
            </h4>
            <div class="arc-engraved-divider mt-2" aria-hidden="true"><span></span></div>

            @if (description()) {
              <p
                data-testid="arc-description"
                class="text-muted-foreground text-sm"
                [attr.id]="descriptionId()"
              >
                {{ description() }}
              </p>
            }
          }
        </header>
      }

      <main class="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto pr-1">
        <ng-template cdkPortalOutlet />

        @if (isStringContent) {
          <div data-testid="arc-content" [innerHTML]="config.arcContent"></div>
        }
      </main>

      @if (!config.arcHideFooter) {
        <footer
          class="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2 pt-2"
        >
          @if (backText(); as back) {
            <!-- A later step of a multi-step dialog: back to the one before, on the left of the footer. -->
            <button
              type="button"
              data-testid="arc-back-button"
              arc-button
              arcType="ghost"
              class="sm:mr-auto"
              (click)="onBackClick()"
            >
              <arc-icon arcType="arrow-left" />
              {{ back }}
            </button>
          }

          @if (config.arcCancelText !== null) {
            <button
              type="button"
              data-testid="arc-cancel-button"
              arc-button
              arcType="outline"
              (click)="onCloseClick()"
            >
              @if (config.arcCancelIcon) {
                <arc-icon [arcType]="config.arcCancelIcon" />
              }

              {{ config.arcCancelText ?? ('common.cancel' | translate) }}
            </button>
          }

          @if (config.arcMiddleText !== null && config.arcMiddleText !== undefined) {
            <button
              type="button"
              data-testid="arc-middle-button"
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

          @if (config.arcOkText !== null) {
            <button
              type="button"
              data-testid="arc-ok-button"
              arc-button
              [arcType]="config.arcOkDestructive ? 'destructive' : 'default'"
              [disabled]="config.arcOkDisabled"
              (click)="onOkClick()"
            >
              @if (config.arcOkIcon) {
                <arc-icon [arcType]="config.arcOkIcon" />
              }

              {{ okText() ?? config.arcOkText ?? ('common.ok' | translate) }}
            </button>
          }
        </footer>
      }
    </div>
  `,
  styles: `
    :host {
      opacity: 1;
      transform: scale(1);
      transition:
        opacity 150ms ease-out,
        transform 150ms ease-out;
    }

    @starting-style {
      :host {
        opacity: 0;
        transform: scale(0.9);
      }
    }

    :host.dialog-leave {
      opacity: 0;
      transform: scale(0.9);
      transition:
        opacity 150ms ease-in,
        transform 150ms ease-in;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': 'titleId()',
    '[attr.aria-describedby]': 'descriptionId()',
    '[style.width]': 'config.arcWidth ? config.arcWidth : null',
    'animate.enter': 'dialog-enter',
    'animate.leave': 'dialog-leave',
  },
  exportAs: 'arcDialog',
})
export class ArcTechDialogComponent<T, U> extends BasePortalOutlet {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  protected readonly config = inject(ArcTechDialogOptions<T, U>);
  private readonly instanceId = ++nextDialogInstanceId;
  private readonly previouslyFocusedElement = this.getActiveElement();

  protected readonly classes = computed(() =>
    mergeClasses(dialogVariants(), this.config.arcCustomClasses),
  );
  dialogRef?: ArcTechDialogRef<T>;

  protected readonly isStringContent = typeof this.config.arcContent === 'string';
  /** What a multi-step dialog shows now; each is the option it was opened with until a step changes it. */
  protected readonly title = signal<string | TemplateRef<T> | undefined>(this.config.arcTitle);
  protected readonly description = signal<string | undefined>(this.config.arcDescription);
  protected readonly backText = signal<string | null>(null);
  protected readonly titleId = computed(() =>
    this.title() ? `arc-dialog-title-${this.instanceId}` : null,
  );
  protected readonly descriptionId = computed(() =>
    this.title() && this.description() ? `arc-dialog-description-${this.instanceId}` : null,
  );

  readonly dialogSurface = viewChild.required<ElementRef<HTMLElement>>('dialogSurface');
  readonly portalOutlet = viewChild.required(CdkPortalOutlet);

  okTriggered = output<void>();
  cancelTriggered = output<void>();
  middleTriggered = output<void>();
  backTriggered = output<void>();
  /** Text of the confirm button set while the dialog is open (it follows the form's values). */
  readonly okText = signal<string | null>(null);

  constructor() {
    super();

    afterNextRender(() => {
      this.dialogSurface().nativeElement.focus();
    });
  }

  getNativeElement(): HTMLElement {
    return this.host.nativeElement;
  }

  restoreFocus(): void {
    this.previouslyFocusedElement?.focus({ preventScroll: true });
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

  onBackClick() {
    this.backTriggered.emit();
  }

  /** Changes what the dialog shows while it is open (a step of a wizard): the header, the confirm and back buttons. */
  setStep(step: {
    title?: string;
    description?: string | null;
    okText?: string;
    backText?: string | null;
  }): void {
    const element = this.host.nativeElement as HTMLElement;
    const from = element.offsetHeight;

    if (step.title !== undefined) {
      this.title.set(step.title);
    }

    if (step.description !== undefined) {
      this.description.set(step.description ?? undefined);
    }

    if (step.okText !== undefined) {
      this.okText.set(step.okText);
    }

    if (step.backText !== undefined) {
      this.backText.set(step.backText);
    }

    // The steps differ in height: once the new one is rendered (before it paints), grow or shrink from the old height.
    afterNextRender(
      () => {
        const to = element.offsetHeight;
        if (
          from === to ||
          typeof element.animate !== 'function' ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
          return;
        }

        element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
          duration: 200,
          easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        });
      },
      { injector: this.injector },
    );
  }

  onCloseClick() {
    this.cancelTriggered.emit();
  }

  private getActiveElement(): HTMLElement | null {
    if (typeof document === 'undefined') {
      return null;
    }

    return document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
}

@NgModule({
  imports: [
    A11yModule,
    ArcTechButtonComponent,
    ArcTechDialogComponent,
    OverlayModule,
    PortalModule,
  ],
  providers: [ArcTechDialogService],
})
export class ArcTechDialogModule {}
