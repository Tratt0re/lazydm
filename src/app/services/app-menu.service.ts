import { effect, inject, Injectable, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';

import { APIChannel } from '@/config/api';
import { AppSheetService } from '@/services/app-sheet.service';
import { BaseIpcService } from '@/services/base-ipc.service';
import { FileActionsService } from '@/services/file-actions.service';
import { listenToIpcEvent } from '@/services/ipc-events';
import { ShortcutsSheetService } from '@/services/shortcuts-sheet.service';
import { VaultService } from '@/services/vault.service';
import { WorkspaceService } from '@/services/workspace.service';

const MENU_ACTION_EVENT = 'menu:action';

/** Entries of the macOS menu, with their text (`menu.items.<id>`); Electron owns the roles (copy, quit…). */
const LABELLED_ENTRIES = [
  'settings', 'newTab', 'closeTab', 'save', 'revealVault', 'search', 'toggleSidebar', 'compendium',
  'templates', 'battleRules', 'back', 'forward', 'nextTab', 'previousTab', 'shortcuts',
] as const;
const MENU_TITLES = [
  'file', 'closeWindow', 'edit', 'view', 'go', 'window', 'help', 'about', 'services', 'hide', 'hideOthers', 'unhide',
  'quit', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'resetZoom', 'zoomIn', 'zoomOut', 'fullscreen',
] as const;

/**
 * The macOS application menu: sends Electron its translated labels and which entries are usable now, and
 * runs the entries chosen in it. Other platforms have no application menu (the call does nothing there).
 */
@Injectable({ providedIn: 'root' })
export class AppMenuService extends BaseIpcService<APIChannel.MENU> {
  private readonly translateService = inject(TranslateService);
  private readonly vault = inject(VaultService).currentVault;
  private readonly workspace = inject(WorkspaceService);
  private readonly sheets = inject(AppSheetService);
  private readonly shortcutsSheet = inject(ShortcutsSheetService);
  private readonly fileActions = inject(FileActionsService);
  private readonly router = inject(Router);
  private readonly language = toSignal(
    this.translateService.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.translateService.getCurrentLang() ?? 'en'),
    ),
  );

  /** Entries that need the sidebar of the campaign shell are told to it through this hook. */
  onToggleSidebar: (() => void) | null = null;
  /** The search field opens itself on Cmd/Ctrl+K; the menu asks for the same through a key event. */
  private readonly openSearch = () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }),
    );

  constructor() {
    super(APIChannel.MENU);
    if (!window.electronAPI?.ipcClient?.menu || window.electronAPI.platform !== 'darwin') {
      return;
    }

    listenToIpcEvent(MENU_ACTION_EVENT, (payload) => {
      const id = (payload as { id?: string } | null)?.id;
      if (id) {
        this.perform(id);
      }
    });

    effect(() => {
      this.language();
      const hasVault = this.vault() !== null;
      const inCampaign = this.workspace.isVisible();
      const enabled: Record<string, boolean> = {
        settings: hasVault,
        compendium: hasVault,
        templates: hasVault,
        battleRules: hasVault,
        shortcuts: hasVault,
        revealVault: hasVault,
        newTab: inCampaign && this.workspace.canOpenTab(),
        closeTab: inCampaign && this.workspace.canCloseTabs(),
        save: inCampaign,
        search: inCampaign,
        toggleSidebar: inCampaign,
        back: inCampaign && this.workspace.canGoBack(),
        forward: inCampaign && this.workspace.canGoForward(),
        nextTab: inCampaign && this.workspace.tabs().length > 1,
        previousTab: inCampaign && this.workspace.tabs().length > 1,
      };
      untracked(() => void this.push(enabled));
    });
  }

  private async push(enabled: Record<string, boolean>): Promise<void> {
    const labels: Record<string, string> = {};
    for (const id of LABELLED_ENTRIES) {
      labels[id] = this.translateService.instant(`menu.items.${id}`);
    }
    for (const id of MENU_TITLES) {
      labels[id] = this.translateService.instant(`menu.titles.${id}`);
    }

    try {
      await this.ipcClient.update({ labels, enabled });
    } catch (error) {
      console.warn('[app] Failed to update the application menu:', error);
    }
  }

  private perform(id: string): void {
    switch (id) {
      case 'settings':
        void this.sheets.open('settings');
        break;
      case 'compendium':
        void this.sheets.toggle('compendium');
        break;
      case 'templates':
        void this.sheets.toggle('templates');
        break;
      case 'battleRules':
        void this.sheets.toggle('battle-rules');
        break;
      case 'shortcuts':
        this.shortcutsSheet.toggle();
        break;
      case 'newTab':
        void this.workspace.openTab();
        break;
      case 'closeTab':
        void this.workspace.closeTab();
        break;
      case 'back':
        void this.workspace.goBack();
        break;
      case 'forward':
        void this.workspace.goForward();
        break;
      case 'nextTab':
        void this.workspace.activateSibling(1);
        break;
      case 'previousTab':
        void this.workspace.activateSibling(-1);
        break;
      case 'save':
        void this.fileActions.saveOpenNotes();
        break;
      case 'search':
        this.openSearch();
        break;
      case 'toggleSidebar':
        this.onToggleSidebar?.();
        break;
    }
  }
}
