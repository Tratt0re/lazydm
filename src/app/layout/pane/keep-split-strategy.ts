import { inject, Injectable, Injector } from '@angular/core';
import { UrlHandlingStrategy, UrlSegmentGroup, UrlSerializer, UrlTree } from '@angular/router';

import { SPLIT_PANE_OUTLET, WorkspaceService } from '@/services/workspace.service';

/**
 * Keeps the second pane through navigations that name only the first one (a service's `navigateByUrl('/a/b')`):
 * the URL the router processes already has the second pane's page, so it is one navigation and the second pane is
 * not rebuilt by a put-back after it. Everything else is the router's default (process every URL as it is).
 */
@Injectable()
export class KeepSplitUrlHandlingStrategy extends UrlHandlingStrategy {
  private readonly injector = inject(Injector);
  private readonly serializer = inject(UrlSerializer);

  shouldProcessUrl(): boolean {
    return true;
  }

  extract(url: UrlTree): UrlTree {
    // Looked up when used: the router (which needs this strategy) is what the workspace service depends on.
    const workspace = this.injector.get(WorkspaceService);
    const serialized = this.serializer.serialize(url);
    if (url.root.children[SPLIT_PANE_OUTLET] && workspace.leavesCampaign(serialized)) {
      // Back to campaigns: the list has no second pane, so the URL goes there without it.
      const { [SPLIT_PANE_OUTLET]: _split, ...children } = url.root.children;
      const root = new UrlSegmentGroup(url.root.segments, children);
      return new UrlTree(root, url.queryParams, url.fragment);
    }

    const kept = workspace.urlKeepingSplit(serialized);
    return kept ? this.serializer.parse(kept) : url;
  }

  merge(newUrlPart: UrlTree): UrlTree {
    return newUrlPart;
  }
}
