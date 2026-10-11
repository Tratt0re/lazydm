import { ChangeDetectionStrategy, Component, computed, input, TemplateRef, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { ArcTechStringTemplateOutletDirective } from '@/shared/core/directives/string-template-outlet/string-template-outlet.directive';
import { mergeClasses } from '@/shared/utils/merge-classes';

import {
  alertDescriptionVariants,
  alertIconVariants,
  alertTitleVariants,
  alertVariants,
  type ArcTechAlertTypeVariants,
} from './alert.variants';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';
import type { ArcTechIcon } from '@/shared/components/icon/icons';

@Component({
  selector: 'arc-alert, [arc-alert]',
  imports: [ArcTechIconComponent, ArcTechStringTemplateOutletDirective],
  standalone: true,
  template: `
    @if (arcIcon() || iconName()) {
      <span [class]="iconClasses()" data-slot="alert-icon">
        <ng-container *arcStringTemplateOutlet="arcIcon()">
          <arc-icon [arcType]="iconName()!" />
        </ng-container>
      </span>
    }

    <div class="flex-1">
      @if (arcTitle()) {
        <div [class]="titleClasses()" data-slot="alert-title">
          <ng-container *arcStringTemplateOutlet="arcTitle()">{{ arcTitle() }}</ng-container>
        </div>
      }

      @if (arcDescription()) {
        <div [class]="descriptionClasses()" data-slot="alert-description">
          <ng-container *arcStringTemplateOutlet="arcDescription()">{{ arcDescription() }}</ng-container>
        </div>
      }
    </div>

    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    role: 'alert',
    '[class]': 'classes()',
    '[attr.data-slot]': '"alert"',
  },
  exportAs: 'arcAlert',
})
export class ArcTechAlertComponent {
  readonly class = input<ClassValue>('');
  readonly arcTitle = input<string | TemplateRef<void>>('');
  readonly arcDescription = input<string | TemplateRef<void>>('');
  readonly arcIcon = input<ArcTechIcon | TemplateRef<void>>();
  readonly arcType = input<ArcTechAlertTypeVariants>('default');

  protected readonly classes = computed(() => mergeClasses(alertVariants({ arcType: this.arcType() }), this.class()));

  protected readonly iconClasses = computed(() => alertIconVariants());

  protected readonly titleClasses = computed(() => alertTitleVariants());

  protected readonly descriptionClasses = computed(() => alertDescriptionVariants({ arcType: this.arcType() }));

  protected readonly iconName = computed((): ArcTechIcon | null => {
    const customIcon = this.arcIcon();
    if (customIcon && !(customIcon instanceof TemplateRef)) {
      return customIcon;
    }

    if (this.arcType() === 'destructive') {
      return 'circle-alert';
    }

    return null;
  });
}
