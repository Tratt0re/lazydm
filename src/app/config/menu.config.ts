import type { AppSection } from '@/services/section.service';
import type { ArcTechIcon } from '@/shared/components/icon';

export interface MenuItemConfig {
  /** i18n key, or the text itself when `translate` is false (a section's custom name). */
  readonly label: string;
  readonly translate?: boolean;
  readonly icon: ArcTechIcon;
  readonly path: string;
  readonly exact?: boolean;
  /** Set for a campaign section: lets the sidebar show it as a collapsible folder tree. */
  readonly sectionKey?: string;
}

export interface MenuSectionConfig {
  readonly label: string;
  readonly items: readonly MenuItemConfig[];
  readonly placement?: 'top' | 'bottom';
}

/** Menu item of a section: its custom name as written, else the translated default name. */
function toSectionMenuItem(section: AppSection, basePath: string): MenuItemConfig {
  return {
    label: section.customLabel ?? `nav.items.${section.key}`,
    translate: section.customLabel === null,
    icon: section.icon,
    path: `${basePath}/${section.key}`,
    sectionKey: section.key,
  };
}

export class MenuConfiguration {
  /** Sidebar menu: the overview and the shown sections of the active campaign, then the way back to the list. */
  static forCampaign(
    campaignSlug: string | null,
    sections: readonly AppSection[],
  ): readonly MenuSectionConfig[] {
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
          ...sections.map((section) => toSectionMenuItem(section, campaignPath)),
        ],
      },
      bottomSection,
    ];
  }

  static readonly sections: readonly MenuSectionConfig[] = MenuConfiguration.forCampaign(null, []);
}
