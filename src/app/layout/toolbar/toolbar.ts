import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';

import { withShortcut } from '@/config/shortcuts.config';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import {
  ArcTechSegmentedComponent,
  ArcTechSegmentedItemComponent,
} from '@/shared/components/segmented';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { HeaderComponent } from '@/shared/components/layout/header.component';
import type {
  ToolbarAction,
  ToolbarItemAction,
  ToolbarItemNavigation,
  ToolbarMenuEntry,
  ToolbarMenuItem,
  ToolbarTitleBreadcrumbItem,
  ToolbarTitleMode,
  ToolbarSelectItem,
} from '@/services/toolbar-context.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-toolbar',
  imports: [
    HeaderComponent,
    TranslatePipe,
    RouterLink,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ...ArcTechMenuImports,
    ArcTechSegmentedComponent,
    ArcTechSegmentedItemComponent,
    ...ArcTechSelectImports,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './toolbar.html',
  encapsulation: ViewEncapsulation.None,
})
export class Toolbar {
  protected readonly withShortcut = withShortcut;

  readonly title = input<string | null>(null);
  readonly titleMode = input<ToolbarTitleMode>('default');
  readonly titleBreadcrumbs = input<readonly ToolbarTitleBreadcrumbItem[]>([]);
  readonly itemActions = input<readonly ToolbarItemAction[]>([]);
  readonly itemNavigation = input<ToolbarItemNavigation | null>(null);
  protected isActionDisabled(action: ToolbarAction): boolean {
    if (typeof action.disabled === 'function') {
      return action.disabled();
    }

    return action.disabled ?? false;
  }

  protected onActionClick(action: ToolbarAction): void {
    if (this.isActionDisabled(action)) {
      return;
    }

    try {
      const result = action.action();
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          console.error('[toolbar] Toolbar action failed:', error);
        });
      }
    } catch (error) {
      console.error('[toolbar] Toolbar action failed:', error);
    }
  }

  protected isToolbarAction(item: ToolbarItemAction): item is ToolbarAction {
    return 'action' in item;
  }

  protected isSelectAction(item: ToolbarItemAction): item is ToolbarSelectItem {
    return 'type' in item && item.type === 'select';
  }

  protected isMenuAction(item: ToolbarItemAction): item is ToolbarMenuItem {
    return 'type' in item && item.type === 'menu';
  }

  protected onMenuEntryClick(entry: ToolbarMenuEntry): void {
    if (this.isToolbarItemDisabled(entry)) {
      return;
    }

    try {
      const result = entry.action();
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          console.error('[toolbar] Toolbar menu action failed:', error);
        });
      }
    } catch (error) {
      console.error('[toolbar] Toolbar menu action failed:', error);
    }
  }

  protected hasTitleBreadcrumbs(): boolean {
    return this.titleMode() === 'breadcrumb' && this.titleBreadcrumbs().length > 0;
  }

  protected isBreadcrumbLabelTranslated(item: ToolbarTitleBreadcrumbItem): boolean {
    return item.translate !== false;
  }

  protected isToolbarItemDisabled(item: { disabled?: boolean | (() => boolean) }): boolean {
    if (typeof item.disabled === 'function') {
      return item.disabled();
    }

    return item.disabled ?? false;
  }

  protected resolveSelectItemValue(item: ToolbarSelectItem): string {
    const value = typeof item.value === 'function' ? item.value() : item.value;
    return typeof value === 'string' ? value : '';
  }

  protected onItemNavigationChange(item: ToolbarItemNavigation, value: string): void {
    try {
      const result = item.change(value);
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          console.error('[toolbar] Toolbar item change handler failed:', error);
        });
      }
    } catch (error) {
      console.error('[toolbar] Toolbar item change handler failed:', error);
    }
  }

  protected onSelectItemChange(item: ToolbarSelectItem, value: string | string[]): void {
    if (Array.isArray(value)) {
      return;
    }

    try {
      const result = item.change(value);
      if (result && typeof result.then === 'function') {
        void result.catch((error) => {
          console.error('[toolbar] Toolbar item change handler failed:', error);
        });
      }
    } catch (error) {
      console.error('[toolbar] Toolbar item change handler failed:', error);
    }
  }
}
