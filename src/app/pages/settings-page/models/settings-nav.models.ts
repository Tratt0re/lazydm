export const SETTINGS_SECTION_KEYS = ['general'] as const;

export type SettingsSectionKey = typeof SETTINGS_SECTION_KEYS[number];

export interface SettingsNavItem {
  readonly key: SettingsSectionKey;
  readonly label: string;
  readonly description: string;
}

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = 'general';

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    key: 'general',
    label: 'settings.sections.general.title',
    description: 'settings.sections.general.description',
  },
] as const;

export function isSettingsSectionKey(value: string | null | undefined): value is SettingsSectionKey {
  return typeof value === 'string' && SETTINGS_SECTION_KEYS.includes(value as SettingsSectionKey);
}
