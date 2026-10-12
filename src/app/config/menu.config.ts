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
  /** `frontmatter.type` given to notes created in this section; null for the assets section (no notes). */
  readonly noteType: string | null;
}

/** Default folders of a campaign, in sidebar order (the Electron side creates the same folders). */
export const CAMPAIGN_SECTIONS: readonly CampaignSectionConfig[] = [
  { key: 'scenes', icon: 'clapperboard', noteType: 'scene' },
  { key: 'characters', icon: 'users', noteType: 'character' },
  { key: 'monsters', icon: 'skull', noteType: 'monster' },
  { key: 'spells', icon: 'sparkles', noteType: 'spell' },
  { key: 'items', icon: 'backpack', noteType: 'item' },
  { key: 'quests', icon: 'scroll-text', noteType: 'quest' },
  { key: 'locations', icon: 'map-pin', noteType: 'location' },
  { key: 'world', icon: 'globe', noteType: 'world' },
  { key: 'encounters', icon: 'swords', noteType: 'encounter' },
  { key: 'handouts', icon: 'mail-open', noteType: 'handout' },
  { key: 'sessions', icon: 'calendar', noteType: 'session' },
  { key: 'assets', icon: 'image', noteType: null },
];

/**
 * Folders that can exist in a compendium system besides the campaign sections: notes whose type has no
 * section of its own are copied to `notes/`.
 */
export const COMPENDIUM_EXTRA_SECTIONS: readonly CampaignSectionConfig[] = [
  { key: 'notes', icon: 'file-text', noteType: null },
];

/** Every folder a campaign or a compendium system can show, by key. */
export function findSection(key: string): CampaignSectionConfig | null {
  return (
    CAMPAIGN_SECTIONS.find((section) => section.key === key) ??
    COMPENDIUM_EXTRA_SECTIONS.find((section) => section.key === key) ??
    null
  );
}

export class MenuConfiguration {
  /** Sidebar menu: the sections of the active campaign, then settings and the way back to the campaign list. */
  static forCampaign(campaignSlug: string | null): readonly MenuSectionConfig[] {
    const bottomSection: MenuSectionConfig = {
      label: '',
      placement: 'bottom',
      items: [
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
          {
            label: 'nav.items.overview',
            icon: 'layout-dashboard',
            path: campaignPath,
            exact: true,
          },
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

  /** Sidebar menu of a compendium system: its overview and the folders it currently has, in campaign order. */
  static forSystem(systemSlug: string, folders: readonly string[]): readonly MenuSectionConfig[] {
    const systemPath = `/compendium/${systemSlug}`;
    const sections = [...CAMPAIGN_SECTIONS, ...COMPENDIUM_EXTRA_SECTIONS].filter((section) =>
      folders.includes(section.key),
    );

    return [
      {
        label: 'nav.sections.system',
        items: [
          { label: 'nav.items.overview', icon: 'layout-dashboard', path: systemPath, exact: true },
          ...sections.map((section) => ({
            label: `nav.items.${section.key}`,
            icon: section.icon,
            path: `${systemPath}/${section.key}`,
          })),
        ],
      },
      {
        label: '',
        placement: 'bottom',
        items: [
          { label: 'nav.items.backToCompendium', icon: 'arrow-left', path: '/compendium', exact: true },
        ],
      },
    ];
  }

  static readonly sections: readonly MenuSectionConfig[] = MenuConfiguration.forCampaign(null);
}
