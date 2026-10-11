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

export class MenuConfiguration {
  static readonly sections: readonly MenuSectionConfig[] = [
    {
      label: 'nav.sections.main',
      items: [
        { label: 'nav.items.home', icon: 'home', path: '/', exact: true },
        { label: 'nav.items.campaigns', icon: 'book-open', path: '/campaigns' },
        { label: 'nav.items.characters', icon: 'users', path: '/characters' },
        { label: 'nav.items.encounters', icon: 'swords', path: '/encounters' },
      ],
    },
    {
      label: '',
      placement: 'bottom',
      items: [
        { label: 'nav.items.settings', icon: 'settings', path: '/settings' },
      ],
    },
  ];
}

// Made with Bob
