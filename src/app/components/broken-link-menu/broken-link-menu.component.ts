import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { BrokenLinkFixRequest } from '@/components/document-links-panel/document-links-panel.component';
import type { DocumentLinkDto } from '@/dtos';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';

/** "Create note… / Remove link" menu opened on a broken `[[link]]` (reading view and live editor). */
@Component({
  selector: 'app-broken-link-menu',
  imports: [TranslatePipe, ArcTechIconComponent, ArcTechMenuImports],
  template: `
    <span class="hidden" arc-context-menu [arcContextMenuTriggerFor]="brokenLinkMenu" aria-hidden="true"></span>

    <ng-template #brokenLinkMenu>
      <div arc-menu-content class="w-56">
        <button type="button" arc-menu-item (click)="emitFix('create')">
          <arc-icon arcType="plus" />
          {{ 'links.actions.create' | translate }}
        </button>
        <button type="button" arc-menu-item (click)="emitFix('remove')">
          <arc-icon arcType="unlink" />
          {{ 'links.actions.remove' | translate }}
        </button>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppBrokenLinkMenuComponent {
  private readonly trigger = viewChild.required(CdkContextMenuTrigger);
  private readonly link = signal<DocumentLinkDto | null>(null);

  readonly fixBrokenLink = output<BrokenLinkFixRequest>();

  /** Opens the menu at a screen position for a broken link (`raw` as written, `targetName`). */
  open(raw: string, targetName: string, x: number, y: number): void {
    this.link.set({ raw, kind: 'wikilink', targetName, heading: null, resolvedPath: null });
    const trigger = this.trigger();
    trigger.close();
    trigger.open({ x, y });
  }

  protected emitFix(action: BrokenLinkFixRequest['action']): void {
    const link = this.link();
    if (link) {
      this.fixBrokenLink.emit({ action, link });
    }
  }
}
