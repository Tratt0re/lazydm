import { computed, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { APIChannel } from '@/config/api';
import type { WorkspaceTabDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';

const CAMPAIGN_URL_PATTERN = /^\/campaigns\/([^/?#]+)/;
const WORKSPACE_MAX_TABS = 30;
const WORKSPACE_MAX_HISTORY = 50;
const WORKSPACE_SAVE_DELAY_MS = 400;

/** Path of the main page: drops query, fragment and the sheet outlet (`/x(overlay:compendium)`). */
function toPath(url: string): string {
  return url.split(/[?#(]/)[0].replace(/\/$/, '') || '/';
}

function getCampaignSlug(url: string): string | null {
  const match = CAMPAIGN_URL_PATTERN.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

function getTabUrl(tab: WorkspaceTabDto): string {
  return tab.history[tab.historyIndex];
}

/** The URL without its query and fragment (`/campaigns/x/enemies?folder=humans` → `/campaigns/x/enemies`). */
function getTabPath(tab: WorkspaceTabDto): string {
  return getTabUrl(tab).split(/[?#]/)[0];
}

function createTab(url: string, title = ''): WorkspaceTabDto {
  return { id: crypto.randomUUID(), title, history: [url], historyIndex: 0 };
}

/**
 * Browser-like tabs of the active campaign. Each tab keeps its own back/forward history; the set is
 * stored per campaign in the device-local vault index, never in the vault.
 */
@Injectable({
  providedIn: 'root',
})
export class WorkspaceService extends BaseIpcService<APIChannel.WORKSPACE> {
  private readonly router = inject(Router);
  private readonly translateService = inject(TranslateService);
  private readonly sectionService = inject(SectionService);

  private readonly campaignSlugSignal = signal<string | null>(null);
  private readonly tabsSignal = signal<readonly WorkspaceTabDto[]>([]);
  private readonly activeTabIdSignal = signal<string | null>(null);
  private readonly currentUrlSignal = signal('');
  /** Set while the service itself drives a navigation, so it is not recorded as a new history entry. */
  private isTabNavigation = false;
  private loadToken = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly tabs = this.tabsSignal.asReadonly();
  readonly activeTabId = this.activeTabIdSignal.asReadonly();
  readonly activeTab = computed(
    () => this.tabsSignal().find((tab) => tab.id === this.activeTabIdSignal()) ?? null,
  );
  /** The tab bar is shown on campaign pages only (not on settings). */
  readonly isVisible = computed(() => {
    const slug = this.campaignSlugSignal();
    return (
      slug !== null &&
      getCampaignSlug(this.currentUrlSignal()) === slug &&
      this.tabsSignal().length > 0
    );
  });
  readonly canGoBack = computed(() => (this.activeTab()?.historyIndex ?? 0) > 0);
  readonly canGoForward = computed(() => {
    const tab = this.activeTab();
    return tab !== null && tab.historyIndex < tab.history.length - 1;
  });
  readonly canOpenTab = computed(() => this.tabsSignal().length < WORKSPACE_MAX_TABS);

  constructor() {
    super(APIChannel.WORKSPACE);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => void this.onNavigationEnd(toPath(event.urlAfterRedirects)));
  }

  /** The page shown in a pane names its tab (the pane passes the title its toolbar shows). */
  reportTitle(title: string): void {
    this.setTitleForUrl(toPath(this.router.url), this.translateService.instant(title));
  }

  /** Whether a URL belongs to the open campaign (tabs never leave it). */
  isCampaignUrl(url: string): boolean {
    const slug = this.campaignSlugSignal();
    return slug !== null && getCampaignSlug(url) === slug;
  }

  /** A campaign always keeps at least one open tab. */
  readonly canCloseTabs = computed(() => this.tabsSignal().length > 1);

  /** Section folder of the tab's current page (`enemies`…), null on the overview. */
  getTabSection(tab: WorkspaceTabDto): string | null {
    return getTabPath(tab).split('/')[3] ?? null;
  }

  /** Label of a tab that has not been shown yet: the section name, or the note file name. */
  getFallbackTitle(tab: WorkspaceTabDto): string {
    const segments = getTabPath(tab).split('/').filter(Boolean);
    if (segments.length === 3) {
      const folder = new URLSearchParams(getTabUrl(tab).split('?')[1] ?? '').get('folder');
      return folder ? toSubfolderLabel(folder) : this.sectionService.labelOfKey(segments[2]);
    }

    return segments.length > 3 ? decodeURIComponent(segments[segments.length - 1]) : '';
  }

  /**
   * Entering a campaign from outside it through its root: the URL of its saved active tab, so the router can go
   * there directly instead of showing the Overview first; null when it is the Overview or nothing was saved.
   */
  async getEntryUrl(slug: string): Promise<string | null> {
    if (slug === this.campaignSlugSignal()) {
      return null;
    }

    try {
      const workspace = await this.ipcClient.get({ campaign: slug });
      const tabs = workspace?.tabs ?? [];
      const tab = tabs.find((item) => item.id === workspace?.activeTabId) ?? tabs[0];
      const url = tab ? getTabUrl(tab) : null;
      return url && toPath(url) !== `/campaigns/${encodeURIComponent(slug)}` ? url : null;
    } catch {
      return null;
    }
  }

  /** Opens a tab; in the background it is only added, otherwise it becomes the active tab. */
  async openTab(
    url = this.getCampaignRoot(),
    options: { background?: boolean } = {},
  ): Promise<void> {
    if (!this.isCampaignUrl(url) || !this.canOpenTab()) {
      return;
    }

    const tab = createTab(toPath(url));
    if (options.background) {
      this.insertAfterActive(tab);
      this.scheduleSave();
      return;
    }

    if (await this.navigate(getTabUrl(tab))) {
      this.insertAfterActive(tab);
      this.activeTabIdSignal.set(tab.id);
      this.scheduleSave();
    }
  }

  /**
   * A note moved (rename): every tab and history entry pointing to the old URL now points to the new
   * one, and the page shown on the old URL is replaced without adding a history entry.
   */
  async replaceUrl(oldUrl: string, newUrl: string): Promise<void> {
    const isShown = toPath(this.router.url) === oldUrl;
    this.tabsSignal.update((tabs) =>
      tabs.map((tab) =>
        tab.history.includes(oldUrl)
          ? { ...tab, history: tab.history.map((url) => (url === oldUrl ? newUrl : url)) }
          : tab,
      ),
    );
    this.scheduleSave();

    if (isShown) {
      await this.navigate(newUrl, { replaceUrl: true });
    }
  }

  /** A plain navigation of the active tab (recorded in its history). */
  async openInActiveTab(url: string): Promise<void> {
    if (this.isCampaignUrl(url)) {
      await this.router.navigateByUrl(toPath(url));
    }
  }

  async activateTab(tabId: string): Promise<void> {
    const tab = this.tabsSignal().find((item) => item.id === tabId);
    if (!tab || tabId === this.activeTabIdSignal()) {
      return;
    }

    if (await this.navigate(getTabUrl(tab))) {
      this.activeTabIdSignal.set(tabId);
      this.scheduleSave();
    }
  }

  /** Drag-to-sort: moves a tab to another position of the bar. */
  moveTab(previousIndex: number, currentIndex: number): void {
    const tabs = [...this.tabsSignal()];
    if (
      previousIndex === currentIndex ||
      !tabs[previousIndex] ||
      currentIndex < 0 ||
      currentIndex >= tabs.length
    ) {
      return;
    }

    const [tab] = tabs.splice(previousIndex, 1);
    tabs.splice(currentIndex, 0, tab);
    this.tabsSignal.set(tabs);
    this.scheduleSave();
  }

  /** Opens a copy of a tab (same page and history) right after it, in the background. */
  duplicateTab(tabId: string): void {
    const tabs = [...this.tabsSignal()];
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0 || !this.canOpenTab()) {
      return;
    }

    tabs.splice(index + 1, 0, { ...tabs[index], id: crypto.randomUUID() });
    this.tabsSignal.set(tabs);
    this.scheduleSave();
  }

  async closeOtherTabs(tabId: string): Promise<void> {
    await this.keepTabs(tabId, (_tab, index, keptIndex) => index === keptIndex);
  }

  async closeTabsToRight(tabId: string): Promise<void> {
    await this.keepTabs(tabId, (_tab, index, keptIndex) => index <= keptIndex);
  }

  /** Closes the tabs `keep` rejects; when the active tab is among them, `tabId` becomes active first. */
  private async keepTabs(
    tabId: string,
    keep: (tab: WorkspaceTabDto, index: number, keptIndex: number) => boolean,
  ): Promise<void> {
    const keptIndex = this.tabsSignal().findIndex((tab) => tab.id === tabId);
    if (keptIndex < 0) {
      return;
    }

    const isActiveKept = this.tabsSignal().some(
      (tab, index) => tab.id === this.activeTabIdSignal() && keep(tab, index, keptIndex),
    );
    if (!isActiveKept) {
      await this.activateTab(tabId);
      if (this.activeTabIdSignal() !== tabId) {
        return;
      }
    }

    this.tabsSignal.update((tabs) => tabs.filter((tab, index) => keep(tab, index, keptIndex)));
    this.scheduleSave();
  }

  async activateSibling(offset: 1 | -1): Promise<void> {
    const tabs = this.tabsSignal();
    const index = tabs.findIndex((tab) => tab.id === this.activeTabIdSignal());
    if (tabs.length < 2 || index < 0) {
      return;
    }

    await this.activateTab(tabs[(index + offset + tabs.length) % tabs.length].id);
  }

  async closeTab(tabId: string | null = this.activeTabIdSignal()): Promise<void> {
    const tabs = this.tabsSignal();
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0 || !this.canCloseTabs()) {
      return;
    }

    if (tabId !== this.activeTabIdSignal()) {
      this.tabsSignal.set(tabs.filter((tab) => tab.id !== tabId));
      this.scheduleSave();
      return;
    }

    const nextTab = tabs[index + 1] ?? tabs[index - 1];
    if (!(await this.navigate(getTabUrl(nextTab)))) {
      return;
    }

    this.tabsSignal.update((items) => items.filter((tab) => tab.id !== tabId));
    this.activeTabIdSignal.set(nextTab.id);
    this.scheduleSave();
  }

  async goBack(): Promise<void> {
    await this.moveInHistory(-1);
  }

  async goForward(): Promise<void> {
    await this.moveInHistory(1);
  }

  private async moveInHistory(offset: 1 | -1): Promise<void> {
    const tab = this.activeTab();
    if (!tab) {
      return;
    }

    const historyIndex = tab.historyIndex + offset;
    if (historyIndex < 0 || historyIndex >= tab.history.length) {
      return;
    }

    if (await this.navigate(tab.history[historyIndex])) {
      this.updateTab(tab.id, (item) => ({ ...item, historyIndex }));
      this.scheduleSave();
    }
  }

  private async onNavigationEnd(url: string): Promise<void> {
    this.currentUrlSignal.set(url);

    const slug = getCampaignSlug(url);
    if (slug === null) {
      // Settings keeps the campaign open; the campaign list and setup close it.
      if (!url.startsWith('/settings')) {
        this.flushSave();
        this.resetState(null);
      }
      return;
    }

    if (slug !== this.campaignSlugSignal()) {
      await this.openCampaign(slug, url);
      return;
    }

    if (!this.isTabNavigation) {
      this.recordNavigation(url);
    }
  }

  /** Restores the saved tabs of a campaign; entering through the campaign root reopens the last active tab. */
  private async openCampaign(slug: string, url: string): Promise<void> {
    this.flushSave();
    this.resetState(slug);
    const token = ++this.loadToken;

    let savedTabs: readonly WorkspaceTabDto[] = [];
    let savedActiveTabId: string | null = null;
    try {
      const workspace = await this.ipcClient.get({ campaign: slug });
      savedTabs = workspace?.tabs ?? [];
      savedActiveTabId = workspace?.activeTabId ?? null;
    } catch (error) {
      console.warn('[app] Failed to restore campaign tabs:', slug, error);
    }

    if (token !== this.loadToken) {
      return;
    }

    if (savedTabs.length === 0) {
      this.tabsSignal.set([createTab(this.currentUrlSignal())]);
      this.activeTabIdSignal.set(this.tabsSignal()[0].id);
      return;
    }

    this.tabsSignal.set(savedTabs);
    const currentUrl = this.currentUrlSignal();
    const matchingTab = savedTabs.find((tab) => getTabUrl(tab) === currentUrl);
    const activeTab =
      matchingTab ?? savedTabs.find((tab) => tab.id === savedActiveTabId) ?? savedTabs[0];
    this.activeTabIdSignal.set(activeTab.id);

    if (matchingTab) {
      return;
    }

    if (currentUrl === this.getCampaignRoot() || url === this.getCampaignRoot()) {
      await this.navigate(getTabUrl(activeTab), { replaceUrl: true });
    } else {
      this.recordNavigation(currentUrl);
    }
  }

  /** A navigation inside the active tab: drops the forward entries and appends the new page. */
  private recordNavigation(url: string): void {
    const tab = this.activeTab();
    if (!tab || getTabUrl(tab) === url) {
      return;
    }

    this.updateTab(tab.id, (item) => {
      const history = [...item.history.slice(0, item.historyIndex + 1), url].slice(
        -WORKSPACE_MAX_HISTORY,
      );
      return { ...item, history, historyIndex: history.length - 1 };
    });
    this.scheduleSave();
  }

  private setTitleForUrl(url: string, title: string): void {
    const tabs = this.tabsSignal();
    if (!tabs.some((tab) => getTabUrl(tab) === url && tab.title !== title)) {
      return;
    }

    this.tabsSignal.set(tabs.map((tab) => (getTabUrl(tab) === url ? { ...tab, title } : tab)));
    this.scheduleSave();
  }

  private async navigate(url: string, extras: { replaceUrl?: boolean } = {}): Promise<boolean> {
    if (toPath(this.router.url) === url) {
      return true;
    }

    this.isTabNavigation = true;
    try {
      return await this.router.navigateByUrl(url, extras);
    } catch (error) {
      console.warn('[app] Tab navigation failed:', url, error);
      return false;
    } finally {
      this.isTabNavigation = false;
    }
  }

  private insertAfterActive(tab: WorkspaceTabDto): void {
    const tabs = [...this.tabsSignal()];
    const activeIndex = tabs.findIndex((item) => item.id === this.activeTabIdSignal());
    tabs.splice(activeIndex < 0 ? tabs.length : activeIndex + 1, 0, tab);
    this.tabsSignal.set(tabs);
  }

  private updateTab(tabId: string, update: (tab: WorkspaceTabDto) => WorkspaceTabDto): void {
    this.tabsSignal.update((tabs) => tabs.map((tab) => (tab.id === tabId ? update(tab) : tab)));
  }

  private getCampaignRoot(): string {
    const slug = this.campaignSlugSignal();
    return slug ? `/campaigns/${encodeURIComponent(slug)}` : '';
  }

  private resetState(slug: string | null): void {
    this.loadToken++;
    this.campaignSlugSignal.set(slug);
    this.tabsSignal.set([]);
    this.activeTabIdSignal.set(null);
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => this.flushSave(), WORKSPACE_SAVE_DELAY_MS);
  }

  private flushSave(): void {
    if (!this.saveTimer) {
      return;
    }

    clearTimeout(this.saveTimer);
    this.saveTimer = null;

    const campaign = this.campaignSlugSignal();
    if (!campaign || this.tabsSignal().length === 0) {
      return;
    }

    this.ipcClient
      .save({ campaign, tabs: this.tabsSignal(), activeTabId: this.activeTabIdSignal() })
      .catch((error: unknown) =>
        console.warn('[app] Failed to save campaign tabs:', campaign, error),
      );
  }
}
