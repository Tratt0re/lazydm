import { Injectable, computed, signal } from '@angular/core';

import type {
  ArcTechButtonShapeVariants,
  ArcTechButtonSizeVariants,
  ArcTechButtonTypeVariants,
} from '@/shared/components/button';
import type { ArcTechIcon } from '@/shared/components/icon';
import type { ArcTechSelectSizeVariants } from '@/shared/components/select';

type ToolbarActionHandler = () => void | Promise<void>;
type ToolbarActionDisabled = boolean | (() => boolean);
type ToolbarSegmentedChangeHandler = (value: string) => void | Promise<void>;
type ToolbarSelectChangeHandler = (value: string) => void | Promise<void>;
type ToolbarDynamicString = string | (() => string);
type ToolbarItemDisabled = boolean | (() => boolean);
export type ToolbarTitleMode = 'default' | 'breadcrumb';

export interface ToolbarTitleBreadcrumbItem {
  readonly label: string;
  readonly path?: string;
  /** Query of the link (a section page showing one of its sub-folders: `{ folder: 'humans' }`). */
  readonly queryParams?: Readonly<Record<string, string>>;
  readonly translate?: boolean;
}

export interface ToolbarSegmentedOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface ToolbarSegmentedItem {
  readonly id: string;
  readonly type: 'segmented';
  readonly ariaLabel?: string;
  readonly size?: 'sm' | 'default' | 'lg';
  readonly defaultValue?: string;
  readonly options: readonly ToolbarSegmentedOption[];
  readonly change: ToolbarSegmentedChangeHandler;
}

export interface ToolbarSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface ToolbarSelectItem {
  readonly id: string;
  readonly type: 'select';
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly size?: ArcTechSelectSizeVariants;
  readonly value: ToolbarDynamicString;
  readonly placeholder?: string;
  readonly class?: string;
  readonly disabled?: ToolbarItemDisabled;
  readonly options: readonly ToolbarSelectOption[];
  readonly change: ToolbarSelectChangeHandler;
}

/** One entry of a toolbar overflow menu. */
export interface ToolbarMenuEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: ArcTechIcon;
  /** Destructive operation (delete…): takes the danger colour and sits after a separator. */
  readonly destructive?: boolean;
  readonly disabled?: ToolbarItemDisabled;
  readonly action: ToolbarActionHandler;
}

/** The "…" button of the toolbar: the actions that are not worth a button of their own. */
export interface ToolbarMenuItem {
  readonly id: string;
  readonly type: 'menu';
  /** Accessible name and tooltip of the button. */
  readonly label: string;
  readonly entries: readonly ToolbarMenuEntry[];
}

export type ToolbarItem = ToolbarSegmentedItem | ToolbarToggleGroupItem | ToolbarSelectItem;
export type ToolbarItemAction = ToolbarAction | ToolbarSelectItem | ToolbarMenuItem;
/** One button of a toggle group: icon with its label as tooltip. */
export interface ToolbarToggleOption {
  readonly value: string;
  readonly label: string;
  readonly icon: ArcTechIcon;
}

/** Toggle buttons where exactly one is pressed (e.g. the note views). */
export interface ToolbarToggleGroupItem {
  readonly id: string;
  readonly type: 'toggles';
  readonly ariaLabel?: string;
  readonly options: readonly ToolbarToggleOption[];
  readonly value: () => string;
  readonly change: ToolbarSegmentedChangeHandler;
}

export type ToolbarItemNavigation = ToolbarSegmentedItem | ToolbarToggleGroupItem;

export interface ToolbarAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: ArcTechIcon;
  readonly buttonType?: ArcTechButtonTypeVariants;
  readonly buttonSize?: ArcTechButtonSizeVariants;
  readonly buttonShape?: ArcTechButtonShapeVariants;
  /** Square icon button: the label becomes its tooltip and accessible name. */
  readonly iconOnly?: boolean;
  /** Destructive operation (delete…): keeps its `buttonType` and takes the danger colour. */
  readonly destructive?: boolean;
  /** Id in `shortcuts.config.ts`: its keys follow the label in the tooltip. */
  readonly shortcut?: string;
  /** A small count on the button (links of a note…); nothing is shown for 0. */
  readonly badge?: number;
  readonly disabled?: ToolbarActionDisabled;
  readonly action: ToolbarActionHandler;
}

export interface ToolbarContextConfig {
  readonly title?: string | null;
  readonly titleMode?: ToolbarTitleMode;
  readonly titleBreadcrumbs?: readonly ToolbarTitleBreadcrumbItem[];
  readonly itemActions?: readonly ToolbarItemAction[];
  readonly itemNavigation?: ToolbarItemNavigation | null;
  /**
   * @deprecated Prefer `itemActions`.
   */
  readonly actions?: readonly ToolbarAction[];
  /**
   * @deprecated Prefer `itemActions` and `itemNavigation`.
   */
  readonly items?: readonly ToolbarItem[];
}

interface NormalizedToolbarContextConfig {
  readonly title: string | null;
  readonly titleMode: ToolbarTitleMode;
  readonly titleBreadcrumbs: readonly ToolbarTitleBreadcrumbItem[];
  readonly itemActions: readonly ToolbarItemAction[];
  readonly itemNavigation: ToolbarItemNavigation | null;
}

/** One per pane or sheet (each provides its own), so a page only ever fills the toolbar it is shown under. */
@Injectable()
export class ToolbarContextService {
  private readonly titleState = signal<string | null>(null);
  private readonly titleModeState = signal<ToolbarTitleMode>('default');
  private readonly titleBreadcrumbsState = signal<readonly ToolbarTitleBreadcrumbItem[]>([]);
  private readonly itemActionsState = signal<readonly ToolbarItemAction[]>([]);
  private readonly itemNavigationState = signal<ToolbarItemNavigation | null>(null);
  private nextContextId = 1;
  private activeContextId: number | null = null;

  readonly title = this.titleState.asReadonly();
  readonly titleMode = this.titleModeState.asReadonly();
  readonly titleBreadcrumbs = this.titleBreadcrumbsState.asReadonly();
  readonly itemActions = this.itemActionsState.asReadonly();
  readonly itemNavigation = this.itemNavigationState.asReadonly();
  /**
   * @deprecated Prefer `itemActions`.
   */
  readonly actions = computed<readonly ToolbarAction[]>(() =>
    this.itemActionsState().filter((item): item is ToolbarAction => this.isToolbarAction(item)),
  );
  /**
   * @deprecated Prefer `itemActions` and `itemNavigation`.
   */
  readonly items = computed<readonly ToolbarItem[]>(() => {
    const itemNavigation = this.itemNavigationState();
    return [
      ...(itemNavigation ? [itemNavigation] : []),
      ...this.itemActionsState().filter((item): item is ToolbarSelectItem =>
        this.isToolbarSelectItem(item),
      ),
    ];
  });

  activate(config: ToolbarContextConfig | readonly ToolbarAction[]): () => void {
    const contextId = this.nextContextId++;
    this.activeContextId = contextId;
    const normalizedConfig = this.normalizeConfig(config);

    this.titleState.set(normalizedConfig.title ?? null);
    this.titleModeState.set(normalizedConfig.titleMode);
    this.titleBreadcrumbsState.set([...(normalizedConfig.titleBreadcrumbs ?? [])]);
    this.itemActionsState.set([...(normalizedConfig.itemActions ?? [])]);
    this.itemNavigationState.set(normalizedConfig.itemNavigation ?? null);

    return () => {
      if (this.activeContextId !== contextId) {
        return;
      }

      this.activeContextId = null;
      this.titleState.set(null);
      this.titleModeState.set('default');
      this.titleBreadcrumbsState.set([]);
      this.itemActionsState.set([]);
      this.itemNavigationState.set(null);
    };
  }

  private normalizeConfig(
    config: ToolbarContextConfig | readonly ToolbarAction[],
  ): NormalizedToolbarContextConfig {
    if (this.isToolbarActionsConfig(config)) {
      return {
        title: null,
        titleMode: 'default',
        titleBreadcrumbs: [],
        itemActions: config,
        itemNavigation: null,
      };
    }

    const contextConfig = config as ToolbarContextConfig;
    const legacyItems = contextConfig.items ?? [];
    const legacyItemActions = legacyItems.filter((item): item is ToolbarSelectItem =>
      this.isToolbarSelectItem(item),
    );
    const legacyItemNavigations = legacyItems.filter((item): item is ToolbarSegmentedItem =>
      this.isToolbarNavigationItem(item),
    );

    if (legacyItemNavigations.length > 1) {
      console.warn(
        '[toolbar] Only one `itemNavigation` is supported. Extra segmented items are ignored.',
      );
    }

    const titleMode = contextConfig.titleMode ?? 'default';
    const titleBreadcrumbs = this.normalizeTitleBreadcrumbs(contextConfig.titleBreadcrumbs);
    const resolvedTitleMode: ToolbarTitleMode =
      titleMode === 'breadcrumb' && titleBreadcrumbs.length > 0 ? 'breadcrumb' : 'default';

    return {
      title: contextConfig.title ?? null,
      titleMode: resolvedTitleMode,
      titleBreadcrumbs,
      itemActions: contextConfig.itemActions ?? [
        ...(contextConfig.actions ?? []),
        ...legacyItemActions,
      ],
      itemNavigation: contextConfig.itemNavigation ?? legacyItemNavigations[0] ?? null,
    };
  }

  private isToolbarActionsConfig(
    config: ToolbarContextConfig | readonly ToolbarAction[],
  ): config is readonly ToolbarAction[] {
    return Array.isArray(config);
  }

  private isToolbarAction(item: ToolbarItemAction): item is ToolbarAction {
    return 'action' in item;
  }

  private isToolbarSelectItem(item: ToolbarItem | ToolbarItemAction): item is ToolbarSelectItem {
    return 'type' in item && item.type === 'select';
  }

  private isToolbarNavigationItem(item: ToolbarItem): item is ToolbarSegmentedItem {
    return item.type === 'segmented';
  }

  private normalizeTitleBreadcrumbs(
    items: readonly ToolbarTitleBreadcrumbItem[] | undefined,
  ): readonly ToolbarTitleBreadcrumbItem[] {
    if (!items || items.length === 0) {
      return [];
    }

    return items
      .filter((item) => item.label.trim().length > 0)
      .map((item) => ({
        label: item.label,
        path: item.path && item.path.trim().length > 0 ? item.path : undefined,
        queryParams: item.queryParams,
        translate: item.translate ?? true,
      }));
  }
}
