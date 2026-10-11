import { Component, DestroyRef, HostListener, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { WorkspaceTabDto } from '@/dtos';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

const WORKSPACE_SHORTCUT_EVENT = 'workspace:shortcut';
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

@Component({
  selector: 'app-tab-bar',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent, ArcTechTooltipImports],
  templateUrl: './tab-bar.html',
  host: {
    class: 'block shrink-0',
  },
})
export class TabBar {
  protected readonly workspace = inject(WorkspaceService);

  /** Cmd/Ctrl+W is caught by the main process (the default menu would close the window). */
  private readonly handleShortcutEvent = (payload: unknown) => {
    if (payload && typeof payload === 'object' && 'action' in payload && payload.action === 'closeTab') {
      if (this.workspace.isVisible()) {
        void this.workspace.closeTab();
      }
    }
  };

  /** Cmd/Ctrl-click and middle-click on campaign links open them in a background tab. */
  private readonly handleLinkClick = (event: MouseEvent) => {
    const isNewTabClick =
      event.type === 'auxclick' ? event.button === 1 : event.button === 0 && (event.metaKey || event.ctrlKey);
    if (!isNewTabClick || !this.workspace.isVisible()) {
      return;
    }

    const anchor = (event.target as Element | null)?.closest?.('a[data-route], a[href]');
    const route = (anchor?.getAttribute('data-route') ?? anchor?.getAttribute('href') ?? '').replace(/^#/, '');
    if (!this.workspace.isCampaignUrl(route)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.workspace.openTab(route, { background: true });
  };

  constructor() {
    window.electronAPI?.onIpcEvent?.(WORKSPACE_SHORTCUT_EVENT, this.handleShortcutEvent);
    document.addEventListener('click', this.handleLinkClick, true);
    document.addEventListener('auxclick', this.handleLinkClick, true);

    inject(DestroyRef).onDestroy(() => {
      window.electronAPI?.offIpcEvent?.(WORKSPACE_SHORTCUT_EVENT, this.handleShortcutEvent);
      document.removeEventListener('click', this.handleLinkClick, true);
      document.removeEventListener('auxclick', this.handleLinkClick, true);
    });
  }

  protected getTitle(tab: WorkspaceTabDto): string {
    return tab.title || this.workspace.getFallbackTitle(tab);
  }

  protected onTabAuxClick(event: MouseEvent, tab: WorkspaceTabDto): void {
    if (event.button === 1) {
      event.preventDefault();
      void this.workspace.closeTab(tab.id);
    }
  }

  protected onCloseClick(event: MouseEvent, tab: WorkspaceTabDto): void {
    event.stopPropagation();
    void this.workspace.closeTab(tab.id);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.workspace.isVisible() || event.altKey) {
      return;
    }

    const isModifierPressed = isMac ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();

    if (event.ctrlKey && key === 'tab') {
      event.preventDefault();
      void this.workspace.activateSibling(event.shiftKey ? -1 : 1);
    } else if (isModifierPressed && !event.shiftKey && key === 't') {
      event.preventDefault();
      void this.workspace.openTab();
    } else if (isModifierPressed && !event.shiftKey && key === '[') {
      event.preventDefault();
      void this.workspace.goBack();
    } else if (isModifierPressed && !event.shiftKey && key === ']') {
      event.preventDefault();
      void this.workspace.goForward();
    }
  }
}
