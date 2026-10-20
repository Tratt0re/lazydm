import { computed, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router, type UrlTree } from '@angular/router';
import { filter } from 'rxjs';

/** Router outlet of the full-page sheets (Compendium, Templates, Settings), drawn over the current page. */
export const APP_SHEET_OUTLET = 'overlay';

/** Route data key with the i18n key of the sheet title. */
export const APP_SHEET_TITLE_ROUTE_DATA = 'sheetTitle';

export type AppSheetKind = 'compendium' | 'templates' | 'battle-rules' | 'settings';

const APP_SHEET_KINDS: readonly AppSheetKind[] = ['compendium', 'templates', 'battle-rules', 'settings'];
/** Length of the closing slide (`.app-sheet-leave` in styles.css). */
const SHEET_CLOSE_ANIMATION_MS = 260;
const DEFAULT_SHEET_PATHS: Readonly<Record<AppSheetKind, string>> = {
  compendium: 'compendium',
  templates: 'templates',
  'battle-rules': 'battle-rules',
  settings: 'settings/general',
};

function getOutletPath(tree: UrlTree, outlet: string): string {
  return (tree.root.children[outlet]?.segments ?? []).map((segment) => segment.path).join('/');
}

/**
 * Full-page sheets over the current page, outside the campaign navigation: the campaign (and its tabs)
 * stays as it is underneath. Each sheet reopens where it was left (per session).
 */
@Injectable({
  providedIn: 'root',
})
export class AppSheetService {
  private readonly router = inject(Router);
  private readonly sheetPathSignal = signal('');
  private readonly isClosingSignal = signal(false);
  private readonly lastPaths: Partial<Record<AppSheetKind, string>> = {};

  /** Path inside the sheet outlet, e.g. `compendium/my-system/enemies`; empty when closed. */
  readonly sheetPath = this.sheetPathSignal.asReadonly();
  readonly activeKind = computed<AppSheetKind | null>(() => {
    const kind = this.sheetPathSignal().split('/')[0];
    return APP_SHEET_KINDS.find((item) => item === kind) ?? null;
  });
  readonly isOpen = computed(() => this.activeKind() !== null);
  /** True while the sheet slides back up, before its route is left. */
  readonly isClosing = this.isClosingSignal.asReadonly();

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const sheetPath = getOutletPath(
          this.router.parseUrl(event.urlAfterRedirects),
          APP_SHEET_OUTLET,
        );
        this.sheetPathSignal.set(sheetPath);
        const kind = this.activeKind();
        if (kind) {
          this.lastPaths[kind] = sheetPath;
        }
      });
  }

  /** Opens a sheet where it was left (or at `path`); the same sheet open already closes it. */
  async toggle(kind: AppSheetKind): Promise<void> {
    if (this.activeKind() === kind) {
      await this.close();
      return;
    }

    await this.open(kind);
  }

  async open(kind: AppSheetKind, path?: string): Promise<void> {
    const sheetPath = path ?? this.lastPaths[kind] ?? DEFAULT_SHEET_PATHS[kind];
    await this.router.navigate(['/', { outlets: { [APP_SHEET_OUTLET]: sheetPath.split('/') } }]);
  }

  /** Slides the sheet up like a gate, then leaves its route. */
  async close(): Promise<void> {
    if (!this.isOpen() || this.isClosingSignal()) {
      return;
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.isClosingSignal.set(true);
    try {
      if (!reduceMotion) {
        await new Promise((resolve) => setTimeout(resolve, SHEET_CLOSE_ANIMATION_MS));
      }
      await this.router.navigate(['/', { outlets: { [APP_SHEET_OUTLET]: null } }]);
    } finally {
      this.isClosingSignal.set(false);
    }
  }

  /**
   * In-app links still point to `/compendium/...` and `/settings/...`: they open in the sheet, over the
   * page that was shown (the campaign list when there was none).
   */
  /** Path of the page under the sheet (primary outlet), e.g. `campaigns/lost-mine/enemies`. */
  underlyingPath(): string {
    return getOutletPath(this.router.parseUrl(this.router.url), 'primary');
  }

  toSheetUrl(url: string): UrlTree {
    const target = this.router.parseUrl(url);
    const current = this.router.parseUrl(this.router.url);
    const primary = getOutletPath(current, 'primary');
    const primarySegments =
      primary && !APP_SHEET_KINDS.some((kind) => primary.startsWith(kind))
        ? primary.split('/')
        : ['campaigns'];

    return this.router.createUrlTree(
      [
        '/',
        {
          outlets: {
            primary: primarySegments,
            [APP_SHEET_OUTLET]: getOutletPath(target, 'primary').split('/'),
          },
        },
      ],
      { queryParams: target.queryParams },
    );
  }
}
