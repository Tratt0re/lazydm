import { CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CAMPAIGN_SECTIONS } from '@/config/menu.config';
import type { WorkspaceTabDto } from '@/dtos';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import type { ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

const WORKSPACE_SHORTCUT_EVENT = 'workspace:shortcut';
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

type TabBarMenuTarget =
  | { readonly kind: 'tab'; readonly tabId: string }
  | { readonly kind: 'link'; readonly url: string };

@Component({
  selector: 'app-tab-bar',
  imports: [
    CdkDrag,
    CdkDropList,
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
    ArcTechTooltipImports,
  ],
  templateUrl: './tab-bar.html',
  host: {
    class: 'block shrink-0',
  },
})
export class TabBar {
  protected readonly workspace = inject(WorkspaceService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly contextMenuTrigger = viewChild.required(CdkContextMenuTrigger);

  protected readonly menuTarget = signal<TabBarMenuTarget | null>(null);
  protected readonly modifierLabel = isMac ? '⌘' : 'Ctrl+';

  /** Cmd/Ctrl+W is caught by the main process (the default menu would close the window). */
  private readonly handleShortcutEvent = (payload: unknown) => {
    if (
      payload &&
      typeof payload === 'object' &&
      'action' in payload &&
      payload.action === 'closeTab'
    ) {
      if (this.workspace.isVisible()) {
        void this.workspace.closeTab();
      }
    }
  };

  /** Cmd/Ctrl-click and middle-click on campaign links open them in a background tab. */
  private readonly handleLinkClick = (event: MouseEvent) => {
    // Releasing the right button fires an auxclick that the overlay would read as a click outside
    // the menu just opened (its trigger is a hidden element), closing it right away.
    if (event.type === 'auxclick' && event.button === 2 && this.contextMenuTrigger().isOpen()) {
      event.stopPropagation();
      return;
    }

    const isNewTabClick =
      event.type === 'auxclick'
        ? event.button === 1
        : event.button === 0 && (event.metaKey || event.ctrlKey);
    if (!isNewTabClick || !this.workspace.isVisible()) {
      return;
    }

    const route = this.getCampaignLinkRoute(event.target);
    if (!route) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.workspace.openTab(route, { background: true });
  };

  /** Right-click on a tab or on a campaign link opens the matching menu. */
  private readonly handleContextMenu = (event: MouseEvent) => {
    if (!this.workspace.isVisible()) {
      return;
    }

    const tabElement = (event.target as Element | null)?.closest?.('[data-tab-id]');
    const tabId =
      tabElement && this.elementRef.nativeElement.contains(tabElement)
        ? tabElement.getAttribute('data-tab-id')
        : null;
    const route = tabId ? null : this.getCampaignLinkRoute(event.target);
    const target: TabBarMenuTarget | null = tabId
      ? { kind: 'tab', tabId }
      : route
        ? { kind: 'link', url: route }
        : null;
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.openMenu(target, event.clientX, event.clientY);
  };

  constructor() {
    window.electronAPI?.onIpcEvent?.(WORKSPACE_SHORTCUT_EVENT, this.handleShortcutEvent);
    document.addEventListener('click', this.handleLinkClick, true);
    document.addEventListener('auxclick', this.handleLinkClick, true);
    document.addEventListener('contextmenu', this.handleContextMenu, true);

    inject(DestroyRef).onDestroy(() => {
      window.electronAPI?.offIpcEvent?.(WORKSPACE_SHORTCUT_EVENT, this.handleShortcutEvent);
      document.removeEventListener('click', this.handleLinkClick, true);
      document.removeEventListener('auxclick', this.handleLinkClick, true);
      document.removeEventListener('contextmenu', this.handleContextMenu, true);
    });
  }

  protected getTitle(tab: WorkspaceTabDto): string {
    return tab.title || this.workspace.getFallbackTitle(tab);
  }

  protected getIcon(tab: WorkspaceTabDto): ArcTechIcon {
    const sectionKey = this.workspace.getTabSection(tab);
    return (
      CAMPAIGN_SECTIONS.find((section) => section.key === sectionKey)?.icon ?? 'layout-dashboard'
    );
  }

  protected menuTab(): WorkspaceTabDto | null {
    const target = this.menuTarget();
    return target?.kind === 'tab'
      ? (this.workspace.tabs().find((tab) => tab.id === target.tabId) ?? null)
      : null;
  }

  protected menuTabIndex(): number {
    const tab = this.menuTab();
    return tab ? this.workspace.tabs().indexOf(tab) : -1;
  }

  protected menuLinkUrl(): string | null {
    const target = this.menuTarget();
    return target?.kind === 'link' ? target.url : null;
  }

  protected onDrop(event: CdkDragDrop<readonly WorkspaceTabDto[]>): void {
    this.workspace.moveTab(event.previousIndex, event.currentIndex);
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

  /** Tablist keys: arrows/Home/End move the focus, Enter/Space activate, the menu key opens the tab menu. */
  protected onTabKeyDown(event: KeyboardEvent, tab: WorkspaceTabDto): void {
    const tabButton = event.currentTarget as HTMLElement;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const rect = tabButton.getBoundingClientRect();
      this.openMenu({ kind: 'tab', tabId: tab.id }, rect.left, rect.bottom);
      return;
    }

    const tabButtons = [
      ...this.elementRef.nativeElement.querySelectorAll<HTMLElement>('[role="tab"]'),
    ];
    const index = tabButtons.indexOf(tabButton);
    const lastIndex = tabButtons.length - 1;
    const nextIndexByKey: Record<string, number> = {
      ArrowRight: index === lastIndex ? 0 : index + 1,
      ArrowLeft: index === 0 ? lastIndex : index - 1,
      Home: 0,
      End: lastIndex,
    };
    const nextIndex = nextIndexByKey[event.key];
    if (nextIndex !== undefined) {
      event.preventDefault();
      tabButtons[nextIndex]?.focus();
    }
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

  private openMenu(target: TabBarMenuTarget, x: number, y: number): void {
    const trigger = this.contextMenuTrigger();
    trigger.close();
    this.menuTarget.set(target);
    trigger.open({ x, y });
  }

  private getCampaignLinkRoute(target: EventTarget | null): string | null {
    const anchor = (target as Element | null)?.closest?.('a[data-route], a[href]');
    const route = (
      anchor?.getAttribute('data-route') ??
      anchor?.getAttribute('href') ??
      ''
    ).replace(/^#/, '');
    return this.workspace.isCampaignUrl(route) ? route : null;
  }
}
