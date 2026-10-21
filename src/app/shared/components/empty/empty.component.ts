import { NgOptimizedImage } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  type TemplateRef,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { ArcTechStringTemplateOutletDirective } from '@/shared/core/directives/string-template-outlet/string-template-outlet.directive';
import { mergeClasses } from '@/shared/utils/merge-classes';

import {
  emptyActionsVariants,
  emptyDescriptionVariants,
  emptyHeaderVariants,
  emptyIconVariants,
  emptyImageVariants,
  emptyTitleVariants,
  emptyVariants,
} from './empty.variants';
import { ArcTechIconComponent } from '@/shared/components/icon/icon.component';
import { type ArcTechIcon } from '@/shared/components/icon/icons';

@Component({
  selector: 'arc-empty',
  imports: [
    NgOptimizedImage,
    ArcTechIconComponent,
    ArcTechStringTemplateOutletDirective,
    TranslatePipe,
  ],
  template: `
    @let image = arcImage();
    @let icon = arcIcon();
    @let title = arcTitle();
    @let description = arcDescription();
    @let actions = arcActions();

    <div [class]="headerClasses()">
      @if (image) {
        <div [class]="imageClasses()">
          <ng-container *arcStringTemplateOutlet="image">
            <img [ngSrc]="image" width="64" height="64" [alt]="'common.empty' | translate" class="mx-auto" />
          </ng-container>
        </div>
      } @else if (icon) {
        <div [class]="iconClasses()" data-testid="icon">
          <arc-icon [arcType]="icon" arcSize="xl" />
        </div>
      }

      @if (title) {
        <div [class]="titleClasses()">
          <ng-container *arcStringTemplateOutlet="title">{{ title }}</ng-container>
        </div>
      }

      @if (description) {
        <div [class]="descriptionClasses()">
          <ng-container *arcStringTemplateOutlet="description">{{ description }}</ng-container>
        </div>
      }
    </div>

    @if (actions.length) {
      <div [class]="actionsClasses()">
        @for (action of actions; track $index) {
          <ng-container *arcStringTemplateOutlet="action" />
        }
      </div>
    }

    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'arcEmpty',
})
export class ArcTechEmptyComponent {
  readonly arcActions = input<TemplateRef<void>[]>([]);
  readonly arcIcon = input<ArcTechIcon>();
  readonly arcImage = input<string | TemplateRef<void>>();
  readonly arcTitle = input<string | TemplateRef<void>>();
  readonly arcDescription = input<string | TemplateRef<void>>();
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(emptyVariants(), this.class()));
  protected readonly headerClasses = computed(() => emptyHeaderVariants());
  protected readonly imageClasses = computed(() => emptyImageVariants());
  protected readonly iconClasses = computed(() => emptyIconVariants());
  protected readonly titleClasses = computed(() => emptyTitleVariants());
  protected readonly descriptionClasses = computed(() => emptyDescriptionVariants());
  protected readonly actionsClasses = computed(() => emptyActionsVariants());
}
