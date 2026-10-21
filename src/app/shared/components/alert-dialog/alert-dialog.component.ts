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
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  ElementRef,
  type EmbeddedViewRef,
  type EventEmitter,
  inject,
  NgModule,
  output,
  type TemplateRef,
  type Type,
  viewChild,
  type ViewContainerRef,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { ArcTechIdDirective } from '@/shared/core';
import { mergeClasses, noopFn } from '@/shared/utils/merge-classes';

import type { ArcTechAlertDialogRef } from './alert-dialog-ref';
import { ArcTechAlertDialogService } from './alert-dialog.service';
import { alertDialogVariants } from './alert-dialog.variants';
import { ArcTechButtonComponent } from '@/shared/components/button/button.component';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';

export type OnClickCallback<T> = (instance: T) => false | void | object;

export class ArcTechAlertDialogOptions<T> {
  arcCancelText?: string | null;
  arcClosable?: boolean;
  arcContent?: string | TemplateRef<T> | Type<T>;
  arcCustomClasses?: ClassValue;
  arcData?: object;
  arcDescription?: string;
  arcMaskClosable?: boolean;
  arcOkDestructive?: boolean;
  arcOkDisabled?: boolean;
  arcOkText?: string | null;
  arcOnCancel?: EventEmitter<T> | OnClickCallback<T> = noopFn;
  arcOnOk?: EventEmitter<T> | OnClickCallback<T> = noopFn;
  arcTitle?: string | TemplateRef<T>;
  arcViewContainerRef?: ViewContainerRef;
  arcWidth?: string;
}

@Component({
  selector: 'arc-alert-dialog',
  imports: [
    OverlayModule,
    PortalModule,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    A11yModule,
    ArcTechIdDirective,
    TranslatePipe,
  ],
  templateUrl: './alert-dialog.component.html',
  styles: `
    arc-alert-dialog {
      inset: 0;
      margin: auto;
      width: fit-content;
      height: fit-content;
      transform-origin: center center;
      opacity: 1;
      transform: scale(1);
      transition:
        opacity 150ms ease-out,
        transform 150ms ease-out;
    }

    @starting-style {
      arc-alert-dialog {
        opacity: 0;
        transform: scale(0.9);
      }
    }

    arc-alert-dialog.alert-dialog-leave {
      opacity: 0;
      transform: scale(0.9);
      transition:
        opacity 150ms ease-in,
        transform 150ms ease-in;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[style.width]': 'config.arcWidth ? config.arcWidth : null',
    role: 'alertdialog',
    '[attr.aria-modal]': 'true',
    '[attr.aria-labelledby]': 'titleId()',
    '[attr.aria-describedby]': 'descriptionId()',
    'animate.enter': 'alert-dialog-enter',
    'animate.leave': 'alert-dialog-leave',
  },
  exportAs: 'arcAlertDialog',
})
export class ArcTechAlertDialogComponent<T> extends BasePortalOutlet {
  protected readonly alertDialogId = viewChild<ArcTechIdDirective>('z');
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly config = inject(ArcTechAlertDialogOptions<T>);

  protected readonly classes = computed(() => mergeClasses(alertDialogVariants(), this.config.arcCustomClasses));

  protected readonly titleId = computed(() => {
    const baseId = this.alertDialogId()?.id();
    return this.config.arcTitle && baseId ? `${baseId}-title` : null;
  });

  protected readonly descriptionId = computed(() => {
    const baseId = this.alertDialogId()?.id();
    return this.config.arcDescription && baseId ? `${baseId}-description` : null;
  });

  alertDialogRef?: ArcTechAlertDialogRef<T>;

  protected readonly isStringContent = computed(() => typeof this.config.arcContent === 'string');

  readonly portalOutlet = viewChild.required(CdkPortalOutlet);

  okTriggered = output<void>();
  cancelTriggered = output<void>();

  constructor() {
    super();
  }

  getNativeElement(): HTMLElement {
    return this.host.nativeElement;
  }

  attachComponentPortal<T>(portal: ComponentPortal<T>): ComponentRef<T> {
    if (this.portalOutlet()?.hasAttached()) {
      throw new Error('Attempting to attach alert dialog content after content is already attached');
    }
    return this.portalOutlet()?.attachComponentPortal(portal);
  }

  attachTemplatePortal<C>(portal: TemplatePortal<C>): EmbeddedViewRef<C> {
    if (this.portalOutlet()?.hasAttached()) {
      throw new Error('Attempting to attach alert dialog content after content is already attached');
    }

    return this.portalOutlet()?.attachTemplatePortal(portal);
  }

  onOkClick() {
    this.okTriggered.emit();
  }

  onCancelClick() {
    this.cancelTriggered.emit();
  }
}

@NgModule({
  imports: [ArcTechButtonComponent, ArcTechAlertDialogComponent, OverlayModule, PortalModule, A11yModule],
  providers: [ArcTechAlertDialogService],
})
export class ArcTechAlertDialogModule {}
