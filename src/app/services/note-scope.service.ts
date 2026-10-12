import { computed, inject, Injectable, type Signal } from '@angular/core';
import type { ActivatedRoute } from '@angular/router';

import { CampaignService } from '@/services/campaign.service';
import { CompendiumService } from '@/services/compendium.service';

export type NoteScopeKind = 'campaign' | 'system';

/** Route data key the compendium routes set, so shared pages know they show a system. */
export const NOTE_SCOPE_ROUTE_DATA = 'noteScope';

/** What section and note pages show: a campaign, or a system of the compendium. */
export interface NoteScope {
  readonly kind: NoteScopeKind;
  readonly slug: string;
  readonly name: string;
  /** Vault folder: `lost-mine` or `compendium/my-system`. */
  readonly rootPath: string;
  /** In-app route of its overview: `/campaigns/lost-mine` or `/compendium/my-system`. */
  readonly routeBase: string;
}

export function getNoteScopeKind(route: ActivatedRoute): NoteScopeKind {
  return route.snapshot.data[NOTE_SCOPE_ROUTE_DATA] === 'system' ? 'system' : 'campaign';
}

@Injectable({
  providedIn: 'root',
})
export class NoteScopeService {
  private readonly campaignService = inject(CampaignService);
  private readonly compendiumService = inject(CompendiumService);

  private readonly campaignScope = computed<NoteScope | null>(() => {
    const campaign = this.campaignService.activeCampaign();
    return campaign
      ? {
          kind: 'campaign',
          slug: campaign.slug,
          name: campaign.name,
          rootPath: campaign.slug,
          routeBase: `/campaigns/${campaign.slug}`,
        }
      : null;
  });

  private readonly systemScope = computed<NoteScope | null>(() => {
    const system = this.compendiumService.activeSystem();
    return system
      ? {
          kind: 'system',
          slug: system.slug,
          name: system.name,
          rootPath: system.path,
          routeBase: `/compendium/${system.slug}`,
        }
      : null;
  });

  /** The active scope of a kind (pages read the kind from their route data). */
  scopeOf(kind: NoteScopeKind): Signal<NoteScope | null> {
    return kind === 'system' ? this.systemScope : this.campaignScope;
  }
}
