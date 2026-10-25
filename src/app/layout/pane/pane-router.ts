import { Injectable, signal } from '@angular/core';
import type { NavigationExtras, Router, UrlTree } from '@angular/router';

/** Router outlet of the first pane, and the name of the second pane's outlet. */
export const PRIMARY_PANE_OUTLET = 'primary';
export const SPLIT_PANE_OUTLET = 'split';

/** Which router outlet a pane shows its page in (set by the pane from its input). */
@Injectable()
export class PaneState {
  readonly outlet = signal<string>(PRIMARY_PANE_OUTLET);
}

/** The path of one outlet of a URL tree (`campaigns/x/npcs/bob`), as segments. */
export function outletSegments(tree: UrlTree, outlet: string): string[] {
  return (tree.root.children[outlet]?.segments ?? []).map((segment) => segment.path);
}

/**
 * The `Router` the pages of a pane inject. For the first pane it is the real router. For the second it keeps
 * every navigation in that pane's outlet — absolute links and `navigateByUrl` change the `split` outlet and
 * leave the others as they are — and reports the pane's own path as `url`; the rest passes through. Pages and
 * `routerLink`s need no change: they just ask for the `Router`.
 */
export function createPaneRouter(router: Router, state: PaneState): Router {
  const isFirstPane = () => state.outlet() === PRIMARY_PANE_OUTLET;

  const createUrlTree = (commands: readonly unknown[], extras: NavigationExtras = {}): UrlTree => {
    // `routerLink` always passes `relativeTo`; only relative commands need it (absolute ones are ours).
    const isAbsolute = typeof commands[0] === 'string' && commands[0].startsWith('/');
    if (isFirstPane() || (extras.relativeTo && !isAbsolute)) {
      return router.createUrlTree(commands, extras);
    }

    const segments = commands
      .filter((command): command is string => typeof command === 'string')
      .flatMap((command) => command.split('/'))
      .filter(Boolean);
    return router.createUrlTree(
      ['/', { outlets: { [state.outlet()]: segments.length ? segments : null } }],
      {
        queryParams: extras.queryParams,
        queryParamsHandling: extras.queryParams ? undefined : 'preserve',
        fragment: extras.fragment,
      },
    );
  };

  const navigateByUrl = (url: string | UrlTree, extras?: NavigationExtras) => {
    if (isFirstPane() || typeof url !== 'string') {
      return router.navigateByUrl(url, extras);
    }

    const target = router.parseUrl(url);
    return router.navigateByUrl(
      createUrlTree(outletSegments(target, PRIMARY_PANE_OUTLET), {
        queryParams: target.queryParams,
      }),
      extras,
    );
  };

  const overrides: Record<string, unknown> = {
    createUrlTree,
    navigateByUrl,
    navigate: (commands: readonly unknown[], extras: NavigationExtras = {}) =>
      navigateByUrl(createUrlTree(commands, extras), extras),
  };

  return new Proxy(router, {
    get(target, property) {
      if (property === 'url' && !isFirstPane()) {
        return '/' + outletSegments(target.parseUrl(target.url), state.outlet()).join('/');
      }

      if (typeof property === 'string' && property in overrides) {
        return overrides[property];
      }

      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
