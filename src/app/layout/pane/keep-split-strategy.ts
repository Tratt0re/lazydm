import { inject, Injectable, Injector } from '@angular/core';
import { UrlHandlingStrategy, UrlSerializer, type UrlTree } from '@angular/router';

import { WorkspaceService } from '@/services/workspace.service';

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
    const kept = this.injector
      .get(WorkspaceService)
      .urlKeepingSplit(this.serializer.serialize(url));
    return kept ? this.serializer.parse(kept) : url;
  }

  merge(newUrlPart: UrlTree): UrlTree {
    return newUrlPart;
  }
}
