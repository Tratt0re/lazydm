import { CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { SidebarToggleComponent } from '@/components/sidebar-toggle/sidebar-toggle.component';
import type { WorkspacePane, WorkspaceTabDto } from '@/dtos';
import { matchesShortcut, withShortcut } from '@/config/shortcuts.config';
import { REVIEW_ROUTE_SEGMENT } from '@/pages/review-page/review-page';
import { AppSheetService } from '@/services/app-sheet.service';
import { SectionService } from '@/services/section.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import type { ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { listenToIpcEvent } from '@/services/ipc-events';

const WORKSPACE_SHORTCUT_EVENT = 'workspace:shortcut';
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

type TabBarMenuTarget =
  | { readonly kind: 'tab'; readonly tabId: string }
  | { readonly kind: 'link'; readonly url: string; readonly pane: WorkspacePane };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tab-bar',
  imports: [
    CdkDrag,
    CdkDropList,
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
    ArcTechTooltipImports,
    SidebarToggleComponent,
  ],
  templateUrl: './tab-bar.html',
  host: {
    class: 'block shrink-0',
  },
})
export class TabBar {
  /** The side of the split screen this bar belongs to; it shows that side's tabs. */
  readonly pane = input<WorkspacePane>('left');
  readonly sidebarCollapsed = input(false);
  readonly sidebarToggle = output<void>();
  protected readonly workspace = inject(WorkspaceService);
  private readonly sheets = inject(AppSheetService);
  private readonly sectionService = inject(SectionService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly contextMenuTrigger = viewChild.required(CdkContextMenuTrigger);

  protected readonly menuTarget = signal<TabBarMenuTarget | null>(null);
  protected readonly withShortcut = withShortcut;
  protected readonly modifierLabel = isMac ? '⌘' : 'Ctrl+';

  /** Cmd/Ctrl+W is caught by the main process (the default menu would close the window). */
  private readonly handleShortcutEvent = (payload: unknown) => {
    if (
      this.pane() === 'left' &&
      payload &&
      typeof payload === 'object' &&
      'action' in payload &&
      payload.action === 'closeTab'
    ) {
      // Over a full-page sheet, Cmd/Ctrl+W closes the sheet, not the campaign tab underneath.
      if (this.sheets.isOpen()) {
        void this.sheets.close();
      } else if (this.workspace.isVisible()) {
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

    // The document-wide listeners of both bars would act twice: the left bar handles links.
    if (this.pane() !== 'left') {
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
    // The tab opens on the side the link was clicked in.
    void this.workspace.openTab(route, {
      background: true,
      pane: this.paneOf(event.target as Element | null),
    });
  };

  /** Right-click on a tab or on a campaign link opens the matching menu. */
  private readonly handleContextMenu = (event: MouseEvent) => {
    // Rows with their own right-click menu (explorer, section page) keep it.
    if (
      !this.workspace.isVisible() ||
      (event.target as Element | null)?.closest?.('[arc-context-menu]')
    ) {
      return;
    }

    const tabElement = (event.target as Element | null)?.closest?.('[data-tab-id]');
    const tabId =
      tabElement && this.elementRef.nativeElement.contains(tabElement)
        ? tabElement.getAttribute('data-tab-id')
        : null;
    // Only the left bar listens for links, for both sides; the menu opens for the side the link is in.
    const route = tabId || this.pane() !== 'left' ? null : this.getCampaignLinkRoute(event.target);
    const target: TabBarMenuTarget | null = tabId
      ? { kind: 'tab', tabId }
      : route
        ? { kind: 'link', url: route, pane: this.paneOf(event.target as Element | null) }
        : null;
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.openMenu(target, event.clientX, event.clientY);
  };

  constructor() {
    listenToIpcEvent(WORKSPACE_SHORTCUT_EVENT, this.handleShortcutEvent);
    document.addEventListener('click', this.handleLinkClick, true);
    document.addEventListener('auxclick', this.handleLinkClick, true);
    document.addEventListener('contextmenu', this.handleContextMenu, true);

    inject(DestroyRef).onDestroy(() => {
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
    if (sectionKey === REVIEW_ROUTE_SEGMENT) {
      return 'circle-alert';
    }

    return (
      (sectionKey && this.sectionService.findCampaignSection(sectionKey)?.icon) ||
      'layout-dashboard'
    );
  }

  protected menuTab(): WorkspaceTabDto | null {
    const target = this.menuTarget();
    return target?.kind === 'tab'
      ? (this.workspace.tabs().find((tab) => tab.id === target.tabId) ?? null)
      : null;
  }

  /** Position of the menu's tab among its pane's tabs (for *Close tabs to the right*). */
  protected menuTabIndex(): number {
    const tab = this.menuTab();
    return tab ? this.workspace.tabsOf(this.pane()).indexOf(tab) : -1;
  }

  protected menuLinkUrl(): string | null {
    const target = this.menuTarget();
    return target?.kind === 'link' ? target.url : null;
  }

  /** The side of the link the menu is open for. */
  protected menuLinkPane(): WorkspacePane {
    const target = this.menuTarget();
    return target?.kind === 'link' ? target.pane : 'left';
  }

  /** Dropped in this bar: a reorder when it came from here, a move to this side when it came from the other bar. */
  protected onDrop(event: CdkDragDrop<readonly WorkspaceTabDto[]>): void {
    if (event.previousContainer === event.container) {
      this.workspace.moveTab(this.pane(), event.previousIndex, event.currentIndex);
      return;
    }

    const tab = event.item.data as WorkspaceTabDto | undefined;
    if (tab) {
      void this.workspace.moveTabToOtherPane(tab.id, event.currentIndex);
    }
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
    // Both bars hear the document; the left one acts, on the focused pane.
    if (this.pane() !== 'left' || !this.workspace.isVisible() || this.sheets.isOpen()) {
      return;
    }

    if (event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'tab') {
      event.preventDefault();
      void this.workspace.activateSibling(event.shiftKey ? -1 : 1);
    } else if (matchesShortcut(event, 'nextTab')) {
      event.preventDefault();
      void this.workspace.activateSibling(1);
    } else if (matchesShortcut(event, 'previousTab')) {
      event.preventDefault();
      void this.workspace.activateSibling(-1);
    } else if (matchesShortcut(event, 'newTab')) {
      event.preventDefault();
      void this.workspace.openTab();
    } else if (matchesShortcut(event, 'closeTab')) {
      event.preventDefault();
      void this.workspace.closeTab();
    } else if (matchesShortcut(event, 'back')) {
      event.preventDefault();
      void this.workspace.goBack();
    } else if (matchesShortcut(event, 'forward')) {
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
    const raw = (anchor?.getAttribute('data-route') ?? anchor?.getAttribute('href') ?? '').replace(
      /^#/,
      '',
    );
    // A link in a pane carries the other pane too (`/a/b(split:c/d)`): the page it opens is the one before it,
    // or, in the second pane, the `split:` one.
    const route = this.workspace.pageOfLink(raw, this.paneOf(anchor));
    return this.workspace.isCampaignUrl(route) ? route : null;
  }

  /** The pane the element is in. */
  private paneOf(element: Element | null | undefined): WorkspacePane {
    return element?.closest('[data-pane="right"]') ? 'right' : 'left';
  }
}
