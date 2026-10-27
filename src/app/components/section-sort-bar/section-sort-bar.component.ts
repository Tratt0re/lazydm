import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { SECTION_SORT_MODES, type SectionSortMode } from '@/config/section-sort.config';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

const SORT_ICONS: Readonly<Record<SectionSortMode, ArcTechIcon>> = {
  'name-asc': 'arrow-down-a-z',
  'name-desc': 'arrow-down-z-a',
  modified: 'clock',
  size: 'arrow-down-wide-narrow',
  type: 'file-type',
};

/**
 * Slim bar over the file list of a section or folder: the entry count and the sort choice. Sticky, so the
 * sort stays in reach while a long list scrolls.
 */
@Component({
  selector: 'app-section-sort-bar',
  imports: [
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
    ArcTechTooltipImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The host is the sticky element: its parent is the whole page column, so it can travel with the scroll.
  // -top-6 cancels the content area's 24px padding, so the bar stops right under the toolbar.
  host: { class: 'sticky -top-6 z-10 block bg-background' },
  template: `
    <div class="flex items-center justify-between gap-3 border-b border-border py-2">
      <p class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
        {{ 'campaigns.sections.sort.entries' | translate: { count: count() } }}
      </p>

      <button
        type="button"
        arc-button
        arc-menu
        [arcMenuTriggerFor]="sortMenu"
        arcPlacement="bottomRight"
        arcType="ghost"
        arcSize="sm"
        class="h-7 gap-1.5 px-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase"
        [attr.aria-label]="'campaigns.sections.sort.ariaLabel' | translate"
        arcPosition="bottom"
        [arcTooltip]="'campaigns.sections.sort.ariaLabel' | translate"
      >
        <arc-icon [arcType]="currentIcon()" class="size-3.5" />
        {{ 'campaigns.sections.sort.' + mode() | translate }}
      </button>

      <ng-template #sortMenu>
        <div arc-menu-content class="w-56">
          @for (option of options; track option) {
            <button type="button" arc-menu-item (click)="changed.emit(option)">
              <arc-icon [arcType]="iconOf(option)" />
              {{ 'campaigns.sections.sort.' + option | translate }}
            </button>
          }
        </div>
      </ng-template>
    </div>
  `,
})
export class AppSectionSortBarComponent {
  /** Files shown in the list (the count the bar displays). */
  readonly count = input.required<number>();
  readonly mode = input.required<SectionSortMode>();
  readonly changed = output<SectionSortMode>();

  protected readonly options = SECTION_SORT_MODES;
  protected readonly currentIcon = computed(() => SORT_ICONS[this.mode()]);

  protected iconOf(mode: SectionSortMode): ArcTechIcon {
    return SORT_ICONS[mode];
  }
}
