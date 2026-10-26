import { computed, inject, Injectable, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, type UrlTree } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { APIChannel } from '@/config/api';
import type { WorkspacePane, WorkspaceTabDto } from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';

/** Router outlet of the first pane, and the name of the second pane's outlet. */
export const PRIMARY_PANE_OUTLET = 'primary';
export const SPLIT_PANE_OUTLET = 'split';

const CAMPAIGN_URL_PATTERN = /^\/campaigns\/([^/?#]+)/;
const WORKSPACE_MAX_TABS = 30;
const WORKSPACE_MAX_HISTORY = 50;
const WORKSPACE_SAVE_DELAY_MS = 400;

/** The path of one outlet of a URL tree (`campaigns/x/npcs/bob`), as segments. */
export function outletSegments(tree: UrlTree, outlet: string): string[] {
  return (tree.root.children[outlet]?.segments ?? []).map((segment) => segment.path);
}

/** Path of the main page: drops query, fragment and the other outlets (`/x(overlay:compendium)`). */
function toPath(url: string): string {
  return url.split(/[?#(]/)[0].replace(/\/$/, '') || '/';
}

/** The URL of the two panes: the first pane's page, and the second pane's in the `split` outlet. */
function composeUrl(left: string, right: string | null): string {
  return right ? `${left}(${SPLIT_PANE_OUTLET}:${right.replace(/^\//, '')})` : left;
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

/** A tab saved before the split screen has no side: it is in the first pane. */
function paneOf(tab: WorkspaceTabDto): WorkspacePane {
  return tab.pane ?? 'left';
}

function createTab(url: string, title = '', pane: WorkspacePane = 'left'): WorkspaceTabDto {
  return { id: crypto.randomUUID(), title, history: [url], historyIndex: 0, pane };
}

/**
 * Browser-like tabs of the active campaign, in two panes (the split screen). Each tab keeps its own
 * back/forward history; each pane has its own active tab, and one pane is focused (the shortcuts and the
 * menu act on it). The set is stored per campaign in the device-local vault index, never in the vault.
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
  private readonly activeTabIdsSignal = signal<Readonly<Record<WorkspacePane, string | null>>>({
    left: null,
    right: null,
  });
  private readonly focusedPaneSignal = signal<WorkspacePane>('left');
  /** Path of the first pane's page, and of the second pane's (null while there is no split). */
  private readonly currentUrlSignal = signal('');
  private readonly splitUrlSignal = signal<string | null>(null);
  /** Set while the service itself drives a navigation, so it is not recorded as a new history entry. */
  private isTabNavigation = false;
  private loadToken = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Every tab of both panes. */
  readonly tabs = this.tabsSignal.asReadonly();
  readonly focusedPane = this.focusedPaneSignal.asReadonly();
  /** The second pane is shown while it has tabs. */
  readonly hasSplit = computed(() => this.tabsSignal().some((tab) => paneOf(tab) === 'right'));
  /**
   * Goes up each time the second pane appears. Pages with a side panel (Links, On this map, the cemetery) close
   * it then, to leave each side the room it needs.
   */
  readonly splitOpenCount = signal(0);
  /** Active tab of the focused pane. */
  readonly activeTabId = computed(() => this.activeTabIdsSignal()[this.focusedPaneSignal()]);
  readonly activeTab = computed(
    () => this.tabsSignal().find((tab) => tab.id === this.activeTabId()) ?? null,
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
  readonly canGoBack = computed(() => this.canGoBackIn(this.focusedPaneSignal()));
  readonly canGoForward = computed(() => this.canGoForwardIn(this.focusedPaneSignal()));
  readonly canOpenTab = computed(() => this.tabsSignal().length < WORKSPACE_MAX_TABS);
  /** A campaign always keeps at least one open tab. */
  readonly canCloseTabs = computed(() => this.tabsSignal().length > 1);

  constructor() {
    super(APIChannel.WORKSPACE);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => void this.onNavigationEnd(event.urlAfterRedirects));
  }

  tabsOf(pane: WorkspacePane): readonly WorkspaceTabDto[] {
    return this.tabsSignal().filter((tab) => paneOf(tab) === pane);
  }

  activeTabIdOf(pane: WorkspacePane): string | null {
    return this.activeTabIdsSignal()[pane];
  }

  canGoBackIn(pane: WorkspacePane): boolean {
    return (this.activeTabOf(pane)?.historyIndex ?? 0) > 0;
  }

  canGoForwardIn(pane: WorkspacePane): boolean {
    const tab = this.activeTabOf(pane);
    return tab !== null && tab.historyIndex < tab.history.length - 1;
  }

  /** The window is too narrow for two panes: only the focused one is shown (set by the layout). */
  readonly isNarrowSplit = signal(false);

  /** The pane the user is working in: the shortcuts and the menu act on it. */
  focusPane(pane: WorkspacePane): void {
    if (this.focusedPaneSignal() !== pane && (pane === 'left' || this.hasSplit())) {
      this.focusedPaneSignal.set(pane);
    }
  }

  /** The page shown in a pane names its tab (the pane passes the title its toolbar shows). */
  reportTitle(title: string, pane: WorkspacePane): void {
    // Not tracked: the same note in both panes would otherwise rename each other's tabs forever (the page of a
    // pane shows its slug until the note is read, then its title).
    untracked(() => {
      const url = pane === 'left' ? this.currentUrlSignal() : this.splitUrlSignal();
      if (url) {
        this.setTitleForUrl(url, this.translateService.instant(title), pane);
      }
    });
  }

  /**
   * The page a link opens: its own path, without the other pane's page that links in a pane carry (the second
   * pane's links are `/<its page>`-less: the page they open is the one in the `split:` part).
   */
  pageOfLink(link: string, pane: WorkspacePane): string {
    if (!link.includes('(')) {
      return toPath(link);
    }

    // A link built in the second pane keeps the first pane's page in front and puts its own target in `split:`.
    const tree = this.router.parseUrl(link);
    const segments = outletSegments(
      tree,
      pane === 'right' ? SPLIT_PANE_OUTLET : PRIMARY_PANE_OUTLET,
    );
    return segments.length ? '/' + segments.map(encodeURIComponent).join('/') : toPath(link);
  }

  /**
   * A navigation that names only the first pane (a service's `navigateByUrl('/a/b')`) keeps the second pane's
   * page in that same navigation, so it is not rebuilt by a put-back after it. Null when nothing needs adding:
   * no split, the URL already names the second pane, or the workspace itself is driving the navigation.
   */
  urlKeepingSplit(url: string): string | null {
    const right = this.activeUrlOf('right');
    if (
      !this.hasSplit() ||
      this.isTabNavigation ||
      !right ||
      this.outletPath(url, SPLIT_PANE_OUTLET)
    ) {
      return null;
    }

    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    return composeUrl(toPath(url), right) + query;
  }

  /** Whether a URL belongs to the open campaign (tabs never leave it). */
  isCampaignUrl(url: string): boolean {
    const slug = this.campaignSlugSignal();
    return slug !== null && getCampaignSlug(url) === slug;
  }

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
      const tabs = (workspace?.tabs ?? []).filter((tab) => paneOf(tab) === 'left');
      const tab = tabs.find((item) => item.id === workspace?.activeTabId) ?? tabs[0];
      const url = tab ? getTabUrl(tab) : null;
      return url && toPath(url) !== `/campaigns/${encodeURIComponent(slug)}` ? url : null;
    } catch {
      return null;
    }
  }

  /**
   * Opens a tab in a pane (the focused one by default); in the background it is only added, otherwise it
   * becomes that pane's active tab. Opening in the second pane shows it.
   */
  async openTab(
    url = this.getCampaignRoot(),
    options: { background?: boolean; pane?: WorkspacePane } = {},
  ): Promise<void> {
    if (!this.isCampaignUrl(url) || !this.canOpenTab()) {
      return;
    }

    const pane = options.pane ?? this.focusedPaneSignal();
    const tab = createTab(toPath(url), '', pane);
    if (options.background) {
      this.insertAfterActive(tab);
      this.scheduleSave();
      return;
    }

    if (await this.navigate(pane, getTabUrl(tab))) {
      this.insertAfterActive(tab);
      this.setActive(pane, tab.id);
      this.focusedPaneSignal.set(pane);
      this.scheduleSave();
    }
  }

  /**
   * A note moved (rename): every tab and history entry pointing to the old URL now points to the new
   * one, and the pages shown on the old URL are replaced without adding a history entry.
   */
  async replaceUrl(oldUrl: string, newUrl: string): Promise<void> {
    const left = this.currentUrlSignal();
    const right = this.splitUrlSignal();
    this.tabsSignal.update((tabs) =>
      tabs.map((tab) =>
        tab.history.includes(oldUrl)
          ? { ...tab, history: tab.history.map((url) => (url === oldUrl ? newUrl : url)) }
          : tab,
      ),
    );
    this.scheduleSave();

    if (left === oldUrl || right === oldUrl) {
      await this.go(left === oldUrl ? newUrl : left, right === oldUrl ? newUrl : right, {
        replaceUrl: true,
      });
    }
  }

  /** A plain navigation of the focused pane's active tab (recorded in its history). */
  async openInActiveTab(
    url: string,
    pane: WorkspacePane = this.focusedPaneSignal(),
  ): Promise<void> {
    if (this.isCampaignUrl(url)) {
      await this.router.navigateByUrl(
        composeUrl(
          pane === 'left' ? toPath(url) : this.currentUrlSignal(),
          pane === 'right' ? toPath(url) : this.splitUrlSignal(),
        ),
      );
    }
  }

  async activateTab(tabId: string): Promise<void> {
    const tab = this.tabsSignal().find((item) => item.id === tabId);
    if (!tab) {
      return;
    }

    const pane = paneOf(tab);
    this.focusedPaneSignal.set(pane);
    if (tabId === this.activeTabIdOf(pane)) {
      return;
    }

    if (await this.navigate(pane, getTabUrl(tab))) {
      this.setActive(pane, tabId);
      this.scheduleSave();
    }
  }

  /** Drag-to-sort: moves a tab to another position of its pane's bar. */
  moveTab(pane: WorkspacePane, previousIndex: number, currentIndex: number): void {
    const paneTabs = this.tabsOf(pane);
    const moved = paneTabs[previousIndex];
    const anchor = paneTabs[currentIndex];
    if (previousIndex === currentIndex || !moved || !anchor) {
      return;
    }

    const rest = this.tabsSignal().filter((tab) => tab.id !== moved.id);
    const at =
      rest.findIndex((tab) => tab.id === anchor.id) + (currentIndex > previousIndex ? 1 : 0);
    this.tabsSignal.set([...rest.slice(0, at), moved, ...rest.slice(at)]);
    this.scheduleSave();
  }

  /** Opens a copy of a tab (same page and history) right after it, in the background. */
  duplicateTab(tabId: string): void {
    const tabs = this.tabsSignal();
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0 || !this.canOpenTab()) {
      return;
    }

    this.tabsSignal.set([
      ...tabs.slice(0, index + 1),
      { ...tabs[index], id: crypto.randomUUID() },
      ...tabs.slice(index + 1),
    ]);
    this.scheduleSave();
  }

  /** The side that is not focused: *Open to the side* puts a page there, the second pane appearing if needed. */
  get otherPane(): WorkspacePane {
    return this.focusedPaneSignal() === 'left' ? 'right' : 'left';
  }

  /** Opens a page in a new tab of the other pane (the second pane appears if it is not shown). */
  async openToSide(url: string): Promise<void> {
    await this.openTab(url, { pane: this.otherPane });
  }

  /**
   * Moves a tab to the other pane at a position of its bar (dragging it from one bar to the other), where it
   * becomes the active tab.
   */
  async moveTabToOtherPane(tabId: string, index?: number): Promise<void> {
    const tab = this.tabsSignal().find((item) => item.id === tabId);
    if (!tab) {
      return;
    }

    const from = paneOf(tab);
    const to: WorkspacePane = from === 'left' ? 'right' : 'left';
    const fromTabs = this.tabsOf(from);
    if (from === 'left' && fromTabs.length === 1) {
      return;
    }

    // The pane the tab leaves shows its neighbour when the tab was the active one.
    let fromActive = this.activeTabIdOf(from);
    if (fromActive === tabId) {
      const index = fromTabs.indexOf(tab);
      fromActive = (fromTabs[index + 1] ?? fromTabs[index - 1])?.id ?? null;
    }

    const rest = this.tabsSignal().filter((item) => item.id !== tabId);
    // At the dropped position of the other bar; without one, right after that bar's active tab.
    const target = index === undefined ? undefined : this.tabsOf(to)[index];
    const anchor =
      index === undefined
        ? rest.findIndex((item) => item.id === this.activeTabIdOf(to)) + 1 || rest.length
        : target
          ? rest.findIndex((item) => item.id === target.id)
          : rest.length;
    const at = Math.max(anchor, 0);
    const tabs = [...rest.slice(0, at), { ...tab, pane: to }, ...rest.slice(at)];
    const activeTabIds = { ...this.activeTabIdsSignal(), [from]: fromActive, [to]: tabId };
    const urlOf = (id: string | null) => {
      const found = tabs.find((item) => item.id === id);
      return found ? getTabUrl(found) : null;
    };

    const left = urlOf(activeTabIds.left);
    const right = urlOf(activeTabIds.right);
    if (!left || !(await this.go(left, right))) {
      return;
    }

    this.tabsSignal.set(tabs);
    this.activeTabIdsSignal.set(activeTabIds);
    this.focusedPaneSignal.set(to);
    this.scheduleSave();
  }

  async closeOtherTabs(tabId: string): Promise<void> {
    await this.keepTabs(tabId, (_tab, index, keptIndex) => index === keptIndex);
  }

  async closeTabsToRight(tabId: string): Promise<void> {
    await this.keepTabs(tabId, (_tab, index, keptIndex) => index <= keptIndex);
  }

  /**
   * Closes the tabs of a pane `keep` rejects; when the pane's active tab is among them, `tabId` becomes active
   * first. The other pane is left alone.
   */
  private async keepTabs(
    tabId: string,
    keep: (tab: WorkspaceTabDto, index: number, keptIndex: number) => boolean,
  ): Promise<void> {
    const kept = this.tabsSignal().find((tab) => tab.id === tabId);
    if (!kept) {
      return;
    }

    const pane = paneOf(kept);
    const paneTabs = this.tabsOf(pane);
    const keptIndex = paneTabs.indexOf(kept);
    const isActiveKept = paneTabs.some(
      (tab, index) => tab.id === this.activeTabIdOf(pane) && keep(tab, index, keptIndex),
    );
    if (!isActiveKept) {
      await this.activateTab(tabId);
      if (this.activeTabIdOf(pane) !== tabId) {
        return;
      }
    }

    this.tabsSignal.update((tabs) =>
      tabs.filter(
        (tab) =>
          paneOf(tab) !== pane ||
          keep(
            tab,
            paneTabs.findIndex((item) => item.id === tab.id),
            keptIndex,
          ),
      ),
    );
    this.scheduleSave();
  }

  async activateSibling(
    offset: 1 | -1,
    pane: WorkspacePane = this.focusedPaneSignal(),
  ): Promise<void> {
    const tabs = this.tabsOf(pane);
    const index = tabs.findIndex((tab) => tab.id === this.activeTabIdOf(pane));
    if (tabs.length < 2 || index < 0) {
      return;
    }

    await this.activateTab(tabs[(index + offset + tabs.length) % tabs.length].id);
  }

  /**
   * Closes a tab (the focused pane's active one by default). The last tab of a pane closes the pane: the
   * second pane disappears, or, when the first one is closed, the second pane's tabs take its place.
   */
  async closeTab(tabId: string | null = this.activeTabId()): Promise<void> {
    const closing = this.tabsSignal().find((tab) => tab.id === tabId);
    if (!closing || !this.canCloseTabs()) {
      return;
    }

    const pane = paneOf(closing);
    const tabs = this.tabsOf(pane);
    const index = tabs.indexOf(closing);
    if (tabs.length === 1) {
      await this.closePane(closing);
      return;
    }

    if (tabId !== this.activeTabIdOf(pane)) {
      this.tabsSignal.update((items) => items.filter((tab) => tab.id !== tabId));
      this.scheduleSave();
      return;
    }

    const nextTab = tabs[index + 1] ?? tabs[index - 1];
    if (!(await this.navigate(pane, getTabUrl(nextTab)))) {
      return;
    }

    this.tabsSignal.update((items) => items.filter((tab) => tab.id !== tabId));
    this.setActive(pane, nextTab.id);
    this.scheduleSave();
  }

  /** Closes the only tab of a pane, and with it the pane. */
  private async closePane(closing: WorkspaceTabDto): Promise<void> {
    const closedPane = paneOf(closing);
    const remaining = this.tabsSignal().filter((tab) => tab.id !== closing.id);
    // The pane that stays shows the page it had; when it is the second one it moves to the first.
    const staying: WorkspacePane = closedPane === 'left' ? 'right' : 'left';
    const stayingActive = remaining.find((tab) => tab.id === this.activeTabIdOf(staying));
    if (!stayingActive || !(await this.go(getTabUrl(stayingActive), null))) {
      return;
    }

    this.tabsSignal.set(remaining.map((tab) => ({ ...tab, pane: 'left' as const })));
    this.activeTabIdsSignal.set({ left: stayingActive.id, right: null });
    this.focusedPaneSignal.set('left');
    this.scheduleSave();
  }

  async goBack(pane: WorkspacePane = this.focusedPaneSignal()): Promise<void> {
    await this.moveInHistory(-1, pane);
  }

  async goForward(pane: WorkspacePane = this.focusedPaneSignal()): Promise<void> {
    await this.moveInHistory(1, pane);
  }

  private async moveInHistory(offset: 1 | -1, pane: WorkspacePane): Promise<void> {
    const tab = this.activeTabOf(pane);
    if (!tab) {
      return;
    }

    const historyIndex = tab.historyIndex + offset;
    if (historyIndex < 0 || historyIndex >= tab.history.length) {
      return;
    }

    if (await this.navigate(pane, tab.history[historyIndex])) {
      this.updateTab(tab.id, (item) => ({ ...item, historyIndex }));
      this.scheduleSave();
    }
  }

  private async onNavigationEnd(fullUrl: string): Promise<void> {
    const url = toPath(fullUrl);
    const splitUrl = this.outletPath(fullUrl, SPLIT_PANE_OUTLET);
    this.currentUrlSignal.set(url);
    this.splitUrlSignal.set(splitUrl);

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

    if (this.isTabNavigation) {
      return;
    }

    this.recordNavigation('left', url);
    if (splitUrl && !this.hasSplit()) {
      // A URL that opens the second pane (a typed or restored one) gives it its first tab.
      const tab = createTab(splitUrl, '', 'right');
      this.tabsSignal.update((tabs) => [...tabs, tab]);
      this.setActive('right', tab.id);
      this.scheduleSave();
    } else if (splitUrl) {
      this.recordNavigation('right', splitUrl);
    } else if (this.hasSplit()) {
      // A navigation made without knowing about the split (the root router) dropped it: put it back.
      void this.go(url, this.activeUrlOf('right'), { replaceUrl: true });
    }
  }

  /** Restores the saved tabs of a campaign; entering through the campaign root reopens the last active tab. */
  private async openCampaign(slug: string, url: string): Promise<void> {
    this.flushSave();
    this.resetState(slug);
    const token = ++this.loadToken;

    let savedTabs: readonly WorkspaceTabDto[] = [];
    let savedActiveTabId: string | null = null;
    let savedRightActiveTabId: string | null = null;
    try {
      const workspace = await this.ipcClient.get({ campaign: slug });
      savedTabs = workspace?.tabs ?? [];
      savedActiveTabId = workspace?.activeTabId ?? null;
      savedRightActiveTabId = workspace?.rightActiveTabId ?? null;
    } catch (error) {
      console.warn('[app] Failed to restore campaign tabs:', slug, error);
    }

    if (token !== this.loadToken) {
      return;
    }

    const currentUrl = this.currentUrlSignal();
    const currentSplitUrl = this.splitUrlSignal();
    if (savedTabs.length === 0) {
      const tabs = [createTab(currentUrl)];
      if (currentSplitUrl) {
        tabs.push(createTab(currentSplitUrl, '', 'right'));
      }
      this.tabsSignal.set(tabs);
      this.activeTabIdsSignal.set({ left: tabs[0].id, right: tabs[1]?.id ?? null });
      return;
    }

    // The first pane always has a tab: without one, the second pane's tabs take its place.
    const tabs = savedTabs.some((tab) => paneOf(tab) === 'left')
      ? savedTabs.map((tab) => ({ ...tab, pane: paneOf(tab) }))
      : savedTabs.map((tab) => ({ ...tab, pane: 'left' as const }));
    this.tabsSignal.set(tabs);

    const leftTabs = tabs.filter((tab) => tab.pane === 'left');
    const rightTabs = tabs.filter((tab) => tab.pane === 'right');
    const matchingTab = leftTabs.find((tab) => getTabUrl(tab) === currentUrl);
    const activeTab =
      matchingTab ?? leftTabs.find((tab) => tab.id === savedActiveTabId) ?? leftTabs[0];
    const matchingRightTab = currentSplitUrl
      ? rightTabs.find((tab) => getTabUrl(tab) === currentSplitUrl)
      : undefined;
    const activeRightTab =
      matchingRightTab ??
      rightTabs.find((tab) => tab.id === savedRightActiveTabId) ??
      rightTabs[0] ??
      null;
    this.activeTabIdsSignal.set({ left: activeTab.id, right: activeRightTab?.id ?? null });

    if (currentSplitUrl && !matchingRightTab) {
      if (activeRightTab) {
        this.recordNavigation('right', currentSplitUrl);
      } else {
        const tab = createTab(currentSplitUrl, '', 'right');
        this.tabsSignal.update((items) => [...items, tab]);
        this.setActive('right', tab.id);
      }
    }

    let wantLeft = currentUrl;
    if (!matchingTab) {
      if (currentUrl === this.getCampaignRoot() || url === this.getCampaignRoot()) {
        wantLeft = getTabUrl(activeTab);
      } else {
        this.recordNavigation('left', currentUrl);
      }
    }
    const wantRight = currentSplitUrl ?? (activeRightTab ? getTabUrl(activeRightTab) : null);
    if (wantLeft !== currentUrl || wantRight !== currentSplitUrl) {
      await this.go(wantLeft, wantRight, { replaceUrl: true });
    }
  }

  /** A navigation inside a pane's active tab: drops the forward entries and appends the new page. */
  private recordNavigation(pane: WorkspacePane, url: string): void {
    const tab = this.activeTabOf(pane);
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

  /** Names the tabs of a pane that show `url`. */
  private setTitleForUrl(url: string, title: string, pane: WorkspacePane): void {
    const isTarget = (tab: WorkspaceTabDto) => paneOf(tab) === pane && getTabUrl(tab) === url;
    const tabs = this.tabsSignal();
    if (!tabs.some((tab) => isTarget(tab) && tab.title !== title)) {
      return;
    }

    this.tabsSignal.set(tabs.map((tab) => (isTarget(tab) ? { ...tab, title } : tab)));
    this.scheduleSave();
  }

  /** Shows `url` in a pane, the other pane keeps its page. */
  private navigate(
    pane: WorkspacePane,
    url: string,
    extras: { replaceUrl?: boolean } = {},
  ): Promise<boolean> {
    const other = this.splitUrlSignal() ?? this.activeUrlOf('right');
    return pane === 'left'
      ? this.go(url, this.hasSplit() ? other : null, extras)
      : this.go(this.currentUrlSignal(), url, extras);
  }

  /** Shows the pages of both panes (`right` null = no second pane). */
  private async go(
    left: string,
    right: string | null,
    extras: { replaceUrl?: boolean } = {},
  ): Promise<boolean> {
    if (left === this.currentUrlSignal() && right === this.splitUrlSignal()) {
      return true;
    }

    if (right && !this.splitUrlSignal()) {
      this.splitOpenCount.update((count) => count + 1);
    }

    this.isTabNavigation = true;
    try {
      return await this.router.navigateByUrl(composeUrl(left, right), extras);
    } catch (error) {
      console.warn('[app] Tab navigation failed:', left, right, error);
      return false;
    } finally {
      this.isTabNavigation = false;
    }
  }

  /** Path of one outlet of a URL (`/campaigns/x/npcs/bob`), null when the outlet is empty. */
  private outletPath(url: string, outlet: string): string | null {
    const segments = outletSegments(this.router.parseUrl(url), outlet);
    return segments.length ? '/' + segments.map(encodeURIComponent).join('/') : null;
  }

  private activeTabOf(pane: WorkspacePane): WorkspaceTabDto | null {
    const id = this.activeTabIdOf(pane);
    return this.tabsSignal().find((tab) => tab.id === id) ?? null;
  }

  private activeUrlOf(pane: WorkspacePane): string | null {
    const tab = this.activeTabOf(pane);
    return tab ? getTabUrl(tab) : null;
  }

  private setActive(pane: WorkspacePane, tabId: string | null): void {
    this.activeTabIdsSignal.update((ids) => ({ ...ids, [pane]: tabId }));
  }

  /** A new tab goes right after its pane's active tab (at the end of the pane when there is none). */
  private insertAfterActive(tab: WorkspaceTabDto): void {
    const tabs = this.tabsSignal();
    const activeIndex = tabs.findIndex((item) => item.id === this.activeTabIdOf(paneOf(tab)));
    const at = activeIndex < 0 ? tabs.length : activeIndex + 1;
    this.tabsSignal.set([...tabs.slice(0, at), tab, ...tabs.slice(at)]);
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
    this.activeTabIdsSignal.set({ left: null, right: null });
    this.focusedPaneSignal.set('left');
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

    const activeTabIds = this.activeTabIdsSignal();
    this.ipcClient
      .save({
        campaign,
        tabs: this.tabsSignal(),
        activeTabId: activeTabIds.left,
        rightActiveTabId: activeTabIds.right,
      })
      .catch((error: unknown) =>
        console.warn('[app] Failed to save campaign tabs:', campaign, error),
      );
  }
}
