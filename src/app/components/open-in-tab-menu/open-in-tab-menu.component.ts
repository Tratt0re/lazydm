import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import {
  toInAppAssetRoute,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';

/**
 * The three ways to open a file in a tab, for the right-click menus of the explorer and of the folder pages: in
 * a new tab, in a background tab, to the side (the other pane). Works for notes, encounters, maps and images
 * alike; renders nothing for a file that has no page of its own (or lives outside the open campaign).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-open-in-tab-menu',
  imports: [TranslatePipe, ArcTechIconComponent, ArcTechMenuImports],
  host: { class: 'contents' },
  template: `
    @if (route(); as target) {
      <button
        type="button"
        arc-menu-item
        [arcDisabled]="!workspace.canOpenTab()"
        (click)="workspace.openTab(target)"
      >
        <arc-icon arcType="plus" />
        {{ 'tabs.menu.openInNewTab' | translate }}
      </button>
      <button
        type="button"
        arc-menu-item
        [arcDisabled]="!workspace.canOpenTab()"
        (click)="workspace.openTab(target, { background: true })"
      >
        <arc-icon arcType="copy-plus" />
        {{ 'tabs.menu.openInBackground' | translate }}
      </button>
      <button
        type="button"
        arc-menu-item
        [arcDisabled]="!workspace.canOpenTab()"
        (click)="workspace.openToSide(target)"
      >
        <arc-icon arcType="panel-right" />
        {{ 'tabs.menu.openToSide' | translate }}
      </button>
    }
  `,
})
export class AppOpenInTabMenuComponent {
  /** Vault-relative path of the file. */
  readonly path = input.required<string>();

  protected readonly workspace = inject(WorkspaceService);
  protected readonly route = computed(() => {
    const route = toInAppNoteRoute(this.path()) ?? toInAppAssetRoute(this.path());
    return route && this.workspace.isCampaignUrl(route) ? route : null;
  });
}
