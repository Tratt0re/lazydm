import type { ArcTechIcon } from '@/shared/components/icon';

export interface MenuItemConfig {
  readonly label: string;
  readonly icon: ArcTechIcon;
  readonly path: string;
  readonly exact?: boolean;
}

export interface MenuSectionConfig {
  readonly label: string;
  readonly items: readonly MenuItemConfig[];
  readonly placement?: 'top' | 'bottom';
}

export interface CampaignSectionConfig {
  /** Folder name of the section inside the campaign, also used as the route segment. */
  readonly key: string;
  readonly icon: ArcTechIcon;
}

/** Default folders of a campaign, in sidebar order (the Electron side creates the same folders). */
export const CAMPAIGN_SECTIONS: readonly CampaignSectionConfig[] = [
  { key: 'scenes', icon: 'clapperboard' },
  { key: 'characters', icon: 'users' },
  { key: 'monsters', icon: 'skull' },
  { key: 'encounters', icon: 'swords' },
  { key: 'sessions', icon: 'calendar' },
  { key: 'assets', icon: 'image' },
];

export class MenuConfiguration {
  /** Sidebar menu: the sections of the active campaign, then settings and the way back to the campaign list. */
  static forCampaign(campaignSlug: string | null): readonly MenuSectionConfig[] {
    const bottomSection: MenuSectionConfig = {
      label: '',
      placement: 'bottom',
      items: [
        { label: 'nav.items.settings', icon: 'settings', path: '/settings' },
        { label: 'nav.items.backToCampaigns', icon: 'arrow-left', path: '/campaigns', exact: true },
      ],
    };

    if (!campaignSlug) {
      return [bottomSection];
    }

    const campaignPath = `/campaigns/${campaignSlug}`;
    return [
      {
        label: 'nav.sections.campaign',
        items: [
          { label: 'nav.items.overview', icon: 'layout-dashboard', path: campaignPath, exact: true },
          ...CAMPAIGN_SECTIONS.map((section) => ({
            label: `nav.items.${section.key}`,
            icon: section.icon,
            path: `${campaignPath}/${section.key}`,
          })),
        ],
      },
      bottomSection,
    ];
  }

  static readonly sections: readonly MenuSectionConfig[] = MenuConfiguration.forCampaign(null);
}
