import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, NavigationEnd, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import type { WorkspaceDto, WorkspaceTabDto } from '@/dtos';
import { SectionService } from '@/services/section.service';
import { WorkspaceService } from './workspace.service';

const SLUG = 'lost-mine';
const GOBLIN = `/campaigns/${SLUG}/enemies/goblin`;
const BOB = `/campaigns/${SLUG}/npcs/bob`;
const ALICE = `/campaigns/${SLUG}/npcs/alice`;
/** The second pane's page as the URL writes it. */
const split = (page: string) => `(split:${page.slice(1)})`;

function tab(id: string, url: string, pane?: 'left' | 'right'): WorkspaceTabDto {
  return { id, title: '', history: [url], historyIndex: 0, ...(pane ? { pane } : {}) };
}

/** A router that records what it is asked to show and reports it back like the real one on success. */
class FakeRouter {
  readonly events = new Subject<unknown>();
  private readonly serializer = new DefaultUrlSerializer();
  url = '/';
  private count = 0;

  parseUrl(url: string) {
    return this.serializer.parse(url);
  }

  async navigateByUrl(url: string): Promise<boolean> {
    this.url = url;
    this.events.next(new NavigationEnd(++this.count, url, url));
    // Lets the service's async navigation handler finish before the test goes on.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return true;
  }
}

interface Setup {
  readonly service: WorkspaceService;
  readonly router: FakeRouter;
  readonly saved: unknown[];
}

/** The service with a saved workspace, at `url` (what the app does when a campaign page is reached). */
async function open(workspace: WorkspaceDto | null, url: string): Promise<Setup> {
  const saved: unknown[] = [];
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    ipcClient: {
      workspace: {
        get: async () => workspace,
        save: async (payload: unknown) => {
          saved.push(payload);
          return null;
        },
      },
    },
  };

  const router = new FakeRouter();
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: router },
      { provide: TranslateService, useValue: { instant: (key: string) => key } },
      { provide: SectionService, useValue: { labelOfKey: (key: string) => key } },
    ],
  });
  const service = TestBed.inject(WorkspaceService);
  await router.navigateByUrl(url);
  return { service, router, saved };
}

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  TestBed.resetTestingModule();
});

const TWO_PANES: WorkspaceDto = {
  tabs: [tab('l1', GOBLIN, 'left'), tab('l2', ALICE, 'left'), tab('r1', BOB, 'right')],
  activeTabId: 'l1',
  rightActiveTabId: 'r1',
  updatedAtMs: 1,
};
const TWO_PANES_URL = `${GOBLIN}${split(BOB)}`;

describe('WorkspaceService', () => {
  it('restores a saved workspace with a tab list for each side', async () => {
    const { service } = await open(TWO_PANES, TWO_PANES_URL);

    expect(service.tabsOf('left').map((item) => item.id)).toEqual(['l1', 'l2']);
    expect(service.tabsOf('right').map((item) => item.id)).toEqual(['r1']);
    expect(service.activeTabIdOf('left')).toBe('l1');
    expect(service.activeTabIdOf('right')).toBe('r1');
    expect(service.hasSplit()).toBe(true);
  });

  it('treats tabs saved before the split screen (no side) as left tabs', async () => {
    const legacy: WorkspaceDto = {
      tabs: [tab('a', GOBLIN), tab('b', BOB)],
      activeTabId: 'a',
      updatedAtMs: 1,
    };
    const { service } = await open(legacy, GOBLIN);

    expect(service.tabsOf('left')).toHaveLength(2);
    expect(service.tabsOf('right')).toHaveLength(0);
    expect(service.hasSplit()).toBe(false);
  });

  it('keeps a tab saved without a side on the left next to tabs saved on the right', async () => {
    const mixed: WorkspaceDto = {
      tabs: [tab('old', GOBLIN), tab('r1', BOB, 'right')],
      activeTabId: 'old',
      rightActiveTabId: 'r1',
      updatedAtMs: 1,
    };
    const { service } = await open(mixed, TWO_PANES_URL);

    expect(service.tabsOf('left').map((item) => item.id)).toEqual(['old']);
    expect(service.tabsOf('right').map((item) => item.id)).toEqual(['r1']);
  });

  it('moves the right tabs to the left when a saved workspace has no left tab', async () => {
    const onlyRight: WorkspaceDto = {
      tabs: [tab('r1', BOB, 'right'), tab('r2', ALICE, 'right')],
      activeTabId: null,
      rightActiveTabId: 'r2',
      updatedAtMs: 1,
    };
    const { service } = await open(onlyRight, BOB);

    expect(service.tabsOf('left').map((item) => item.id)).toEqual(['r1', 'r2']);
    expect(service.hasSplit()).toBe(false);
  });

  it('opens a tab on the other side and shows the second pane', async () => {
    const { service, router } = await open(null, GOBLIN);

    await service.openToSide(BOB);

    expect(service.tabsOf('right').map((item) => item.history[0])).toEqual([BOB]);
    expect(service.hasSplit()).toBe(true);
    expect(service.focusedPane()).toBe('right');
    expect(router.url).toBe(`${GOBLIN}${split(BOB)}`);
  });

  describe('opening a page to the side without duplicating it', () => {
    it('opens a new tab on the other side when no tab shows the page', async () => {
      const { service } = await open(null, GOBLIN);

      await service.openOrFocusToSide(BOB);

      expect(service.tabsOf('right').map((item) => item.history[0])).toEqual([BOB]);
    });

    it('focuses the background tab that already has the page', async () => {
      const { service, router } = await open(TWO_PANES, TWO_PANES_URL);

      await service.openOrFocusToSide(ALICE);

      expect(service.tabs()).toHaveLength(3);
      expect(service.activeTabIdOf('left')).toBe('l2');
      expect(service.focusedPane()).toBe('left');
      expect(router.url).toBe(`${ALICE}${split(BOB)}`);
    });

    it('focuses the tab of the other side that shows the page', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);
      await service.activateTab('l1');

      await service.openOrFocusToSide(BOB);

      expect(service.tabs()).toHaveLength(3);
      expect(service.focusedPane()).toBe('right');
      expect(service.activeTabIdOf('right')).toBe('r1');
    });

    it('ignores the query and the fragment when it looks for the page', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);

      await service.openOrFocusToSide(`${ALICE}?folder=allies#top`);

      expect(service.tabs()).toHaveLength(3);
      expect(service.activeTabIdOf('left')).toBe('l2');
    });
  });

  it('keeps each side on its own page when the other side switches tab', async () => {
    const { service, router } = await open(TWO_PANES, TWO_PANES_URL);

    await service.activateTab('l2');

    expect(router.url).toBe(`${ALICE}${split(BOB)}`);
    expect(service.activeTabIdOf('left')).toBe('l2');
    expect(service.activeTabIdOf('right')).toBe('r1');
  });

  it('closing the last tab of the second side closes the split', async () => {
    const { service, router } = await open(TWO_PANES, TWO_PANES_URL);

    await service.closeTab('r1');

    expect(service.hasSplit()).toBe(false);
    expect(service.tabsOf('left')).toHaveLength(2);
    expect(router.url).toBe(GOBLIN);
  });

  it('closing the last tab of the first side moves the second side over', async () => {
    const workspace: WorkspaceDto = {
      tabs: [tab('l1', GOBLIN, 'left'), tab('r1', BOB, 'right'), tab('r2', ALICE, 'right')],
      activeTabId: 'l1',
      rightActiveTabId: 'r1',
      updatedAtMs: 1,
    };
    const { service, router } = await open(workspace, TWO_PANES_URL);

    await service.closeTab('l1');

    expect(service.hasSplit()).toBe(false);
    expect(service.tabsOf('left').map((item) => item.id)).toEqual(['r1', 'r2']);
    expect(router.url).toBe(BOB);
  });

  describe('moving a tab to the other side', () => {
    it('puts it at the dropped position and makes it the active tab there', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);

      await service.moveTabToOtherPane('l2', 0);

      expect(service.tabsOf('right').map((item) => item.id)).toEqual(['l2', 'r1']);
      expect(service.activeTabIdOf('right')).toBe('l2');
      expect(service.focusedPane()).toBe('right');
      expect(service.activeTabIdOf('left')).toBe('l1');
    });

    it('never empties the first side', async () => {
      const workspace: WorkspaceDto = {
        tabs: [tab('l1', GOBLIN, 'left'), tab('r1', BOB, 'right')],
        activeTabId: 'l1',
        rightActiveTabId: 'r1',
        updatedAtMs: 1,
      };
      const { service, router } = await open(workspace, TWO_PANES_URL);

      await service.moveTabToOtherPane('l1');

      // The tab did not move and nothing was navigated. (Two checks stop it: the guard, and the empty side
      // having no page to show; the spec holds the behaviour, not which check does it.)
      expect(service.tabsOf('left').map((item) => item.id)).toEqual(['l1']);
      expect(service.tabsOf('right').map((item) => item.id)).toEqual(['r1']);
      expect(router.url).toBe(TWO_PANES_URL);
      expect(service.focusedPane()).toBe('left');
    });

    it('closes the split when the last tab of the second side moves back', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);

      await service.moveTabToOtherPane('r1');

      expect(service.hasSplit()).toBe(false);
      expect(service.tabsOf('left')).toHaveLength(3);
    });
  });

  describe('the page a link opens', () => {
    it('is the same page for a plain link', async () => {
      const { service } = await open(null, GOBLIN);

      expect(service.pageOfLink(BOB, 'left')).toBe(BOB);
    });

    it('is the page of the side the link is in when it carries both sides', async () => {
      const { service } = await open(null, GOBLIN);
      const link = `${GOBLIN}${split(BOB)}`;

      expect(service.pageOfLink(link, 'left')).toBe(GOBLIN);
      expect(service.pageOfLink(link, 'right')).toBe(BOB);
    });
  });

  describe('keeping the second side through a navigation that does not name it', () => {
    it('adds the second side to a plain URL, query included', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);

      expect(service.urlKeepingSplit(ALICE)).toBe(`${ALICE}${split(BOB)}`);
      expect(service.urlKeepingSplit(`${ALICE}?folder=humans`)).toBe(
        `${ALICE}${split(BOB)}?folder=humans`,
      );
    });

    it('leaves a URL that already names the second side alone', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);

      expect(service.urlKeepingSplit(`${ALICE}${split(GOBLIN)}`)).toBeNull();
    });

    it('keeps the sheet outlet of the URL (Settings sidebar) and adds the second side beside it', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);

      expect(service.urlKeepingSplit(`${ALICE}(overlay:settings/editor)`)).toBe(
        `${ALICE}(overlay:settings/editor//split:${BOB.slice(1)})`,
      );
    });

    it('leaves a URL outside the campaign alone (Back to campaigns)', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);

      expect(service.urlKeepingSplit('/campaigns')).toBeNull();
      expect(service.urlKeepingSplit('/campaigns/other-campaign/enemies/goblin')).toBeNull();
    });

    it('says which URLs leave the campaign: the list, another campaign, a sheet link', async () => {
      const { service } = await open(TWO_PANES, TWO_PANES_URL);

      expect(service.leavesCampaign('/campaigns')).toBe(true);
      expect(service.leavesCampaign('/campaigns/other/enemies/goblin')).toBe(true);
      expect(service.leavesCampaign('/settings/editor(overlay:settings/general)')).toBe(true);
      expect(service.leavesCampaign(ALICE)).toBe(false);
      expect(service.leavesCampaign(`${ALICE}(overlay:settings/general)`)).toBe(false);
    });

    it('does nothing without a split', async () => {
      const { service } = await open(null, GOBLIN);

      expect(service.urlKeepingSplit(ALICE)).toBeNull();
    });
  });

  it('saves the tabs of both sides and the active tab of each', async () => {
    const { service, saved } = await open(TWO_PANES, TWO_PANES_URL);

    await service.activateTab('l2');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const last = saved.at(-1) as {
      campaign: string;
      tabs: WorkspaceTabDto[];
      activeTabId: string;
      rightActiveTabId: string;
    };
    expect(last.campaign).toBe(SLUG);
    expect(last.activeTabId).toBe('l2');
    expect(last.rightActiveTabId).toBe('r1');
    expect(last.tabs.map((item) => `${item.id}:${item.pane}`)).toEqual([
      'l1:left',
      'l2:left',
      'r1:right',
    ]);
  });
});
