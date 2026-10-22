import type { AppSheetComboboxField } from '@/components/sheet-form/sheet-form.types';
import { ARCTECH_ICONS, type ArcTechIcon } from '@/shared/components/icon';

/** Icon of a campaign that has none of its own. */
export const DEFAULT_CAMPAIGN_ICON = 'book-open-text';

/** The icon to draw for a campaign: its own if it names a known icon (campaign.md can be edited by hand), else the default. */
export function toCampaignIcon(icon: string | null): ArcTechIcon {
  return icon && icon in ARCTECH_ICONS ? (icon as ArcTechIcon) : DEFAULT_CAMPAIGN_ICON;
}

/**
 * Searchable icon field over a curated list of icons (named in i18n under `labelPrefix`).
 * The value is the icon name that gets stored (`folder`, `book-open-text`…).
 */
export function buildIconPickerField(config: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly curated: readonly (ArcTechIcon & string)[];
  /** i18n prefix of the names: `<labelPrefix>.<icon>`. */
  readonly labelPrefix: string;
}): AppSheetComboboxField {
  return {
    id: config.id,
    type: 'combobox',
    label: config.label,
    value: config.value,
    required: true,
    translate: true,
    searchable: true,
    searchPlaceholder: 'iconPicker.search',
    emptyText: 'iconPicker.empty',
    options: config.curated.map((icon) => ({
      value: icon,
      label: `${config.labelPrefix}.${icon}`,
      icon,
      translate: true,
    })),
  };
}
