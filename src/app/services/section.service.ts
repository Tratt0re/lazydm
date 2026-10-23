import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';

import { APIChannel } from '@/config/api';
import type {
  CustomSectionPayload,
  DefaultSectionDto,
  SectionDefaultsDto,
  SectionDto,
  SectionSettingsPayload,
} from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import { CampaignService } from '@/services/campaign.service';
import { ARCTECH_ICONS } from '@/shared/components/icon';

/** Name of an icon of the ArcTechUI icon set (what the vault config stores). */
export type SectionIcon = keyof typeof ARCTECH_ICONS;

/** A section as the UI shows it: icon checked against the icon set, custom name if any. */
export interface AppSection {
  /** Folder name inside the campaign or system, also the route segment. */
  readonly key: string;
  /** `frontmatter.type` of its notes; null for assets (no notes). */
  readonly type: string | null;
  readonly icon: SectionIcon;
  /** Custom name, or null for the translated name of a default section (`nav.items.<key>`). */
  readonly customLabel: string | null;
  readonly isCustom: boolean;
  readonly isHidden: boolean;
  /** Assets and encounters: *New folder* and *Import* but no *New note*; sub-folders only organise files. */
  readonly isSpecial: boolean;
  readonly fileCount: number;
  /** Text of a custom section's overview tile, if the user wrote one. */
  readonly description: string | null;
}

/** Icons offered for a custom section (the first one is the default). */
export const CUSTOM_SECTION_ICONS: readonly SectionIcon[] = [
  'folder',
  'flag',
  'crown',
  'castle',
  'shield',
  'swords',
  'skull',
  'ghost',
  'users',
  'landmark',
  'globe',
  'mountain-snow',
  'ship',
  'gem',
  'book-open',
  'feather',
];

const FALLBACK_SECTION_ICON: SectionIcon = 'folder';

/** Settings payload that saves sections as they are listed (order, hidden, names, custom sections). */
export function toSectionSettings(rows: readonly AppSection[]): SectionSettingsPayload {
  return {
    hidden: rows.filter((row) => row.isHidden).map((row) => row.key),
    order: rows.map((row) => row.key),
    labels: Object.fromEntries(
      rows
        .filter((row) => !row.isCustom && row.customLabel)
        .map((row) => [row.key, row.customLabel!]),
    ),
    custom: rows
      .filter((row) => row.isCustom)
      .map((row) => ({
        key: row.key,
        label: row.customLabel ?? row.key,
        type: row.type ?? undefined,
        icon: row.icon,
        description: row.description ?? undefined,
      })),
  };
}

/** Display name of a sub-folder: `humans` → `Humans`, `fire-giants` → `Fire giants`. */
export function toSubfolderLabel(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

function toIcon(icon: string): SectionIcon {
  return icon in ARCTECH_ICONS ? (icon as SectionIcon) : FALLBACK_SECTION_ICON;
}

function toAppSection(section: DefaultSectionDto | SectionDto): AppSection {
  const settings = 'isCustom' in section ? section : null;
  return {
    key: section.key,
    type: section.type,
    icon: toIcon(section.icon),
    customLabel: settings?.label ?? null,
    isCustom: settings?.isCustom ?? false,
    isHidden: settings?.isHidden ?? false,
    isSpecial: section.isSpecial === true,
    fileCount: settings?.fileCount ?? 0,
    description: settings?.description ?? null,
  };
}

/**
 * The sections of the active campaign (its settings applied: hidden, order, names, custom sections) and the
 * default ones of compendium systems. Electron owns the lists; this service only shows them.
 */
@Injectable({
  providedIn: 'root',
})
export class SectionService extends BaseIpcService<APIChannel.SECTIONS> {
  private readonly campaignService = inject(CampaignService);
  private readonly translateService = inject(TranslateService);

  /** Changes with the UI language, so labels computed from it follow. */
  private readonly language = toSignal(
    this.translateService.onLangChange.pipe(map((event) => event.lang)),
    { initialValue: this.translateService.getCurrentLang() ?? 'en' },
  );
  private readonly defaultsSignal = signal<SectionDefaultsDto>({
    campaign: [],
    presets: [],
    compendium: [],
  });
  private readonly loadedSignal = signal<{ slug: string; rows: readonly SectionDto[] } | null>(
    null,
  );

  /** Every section of the active campaign (hidden ones included), in its sidebar order. */
  readonly campaignSections = computed<readonly AppSection[]>(() => {
    const slug = this.campaignService.activeCampaign()?.slug ?? null;
    const loaded = this.loadedSignal();
    return loaded && loaded.slug === slug
      ? loaded.rows.map(toAppSection)
      : this.defaultsSignal().campaign.map(toAppSection);
  });
  /** The sections the active campaign shows in its sidebar. */
  readonly visibleCampaignSections = computed(() =>
    this.campaignSections().filter((section) => !section.isHidden),
  );
  /** Sections a new campaign can start with. */
  readonly presetSections = computed<readonly AppSection[]>(() =>
    this.defaultsSignal().presets.map(toAppSection),
  );
  /** Folders a compendium system can have (default sections and `notes/`). */
  readonly systemSections = computed<readonly AppSection[]>(() =>
    this.defaultsSignal().compendium.map(toAppSection),
  );

  constructor() {
    super(APIChannel.SECTIONS);
    if (window.electronAPI?.ipcClient?.sections) {
      void this.loadDefaults();
    }

    effect(() => {
      const slug = this.campaignService.activeCampaign()?.slug;
      if (slug) {
        void this.loadCampaign(slug);
      }
    });
  }

  /** Sections of any campaign (hidden ones included), e.g. the one under the Settings sheet. */
  async list(campaign: string): Promise<readonly AppSection[]> {
    const { rows } = await this.ipcClient.list({ campaign });
    this.remember(campaign, rows);
    return rows.map(toAppSection);
  }

  /** Saves a campaign's section settings; the sidebar follows right away when it is the active one. */
  async save(campaign: string, settings: SectionSettingsPayload): Promise<readonly AppSection[]> {
    const { rows } = await this.ipcClient.save({ campaign, settings });
    this.remember(campaign, rows);
    return rows.map(toAppSection);
  }

  /** Adds a custom section to a campaign (an existing folder keeps its name as the section folder). */
  async addCustomSection(
    campaign: string,
    section: CustomSectionPayload,
  ): Promise<readonly AppSection[]> {
    const settings = toSectionSettings(await this.list(campaign));
    return this.save(campaign, { ...settings, custom: [...settings.custom, section] });
  }

  findCampaignSection(key: string): AppSection | null {
    return this.campaignSections().find((section) => section.key === key) ?? null;
  }

  findSystemSection(key: string): AppSection | null {
    return this.systemSections().find((section) => section.key === key) ?? null;
  }

  /** Display name of a section: its custom name, else the translated default name. */
  labelOf(section: Pick<AppSection, 'key' | 'customLabel'>): string {
    this.language();
    return section.customLabel ?? this.translateService.instant(`nav.items.${section.key}`);
  }

  /** Display name of a folder of the active campaign (or of a system) by key; unknown folders keep their name. */
  labelOfKey(key: string, scope: 'campaign' | 'system' = 'campaign'): string {
    const section =
      scope === 'campaign' ? this.findCampaignSection(key) : this.findSystemSection(key);
    return section ? this.labelOf(section) : key;
  }

  /** Display name of the section a vault file is in (`lost-mine/enemies/x.md`, `compendium/dnd/notes/y.md`). */
  labelOfPath(path: string): string {
    const segments = path.split('/');
    return segments[0] === 'compendium'
      ? this.labelOfKey(segments[2] ?? '', 'system')
      : this.labelOfKey(segments[1] ?? '');
  }

  private remember(campaign: string, rows: readonly SectionDto[]): void {
    if (campaign === this.campaignService.activeCampaign()?.slug) {
      this.loadedSignal.set({ slug: campaign, rows });
    }
  }

  private async loadDefaults(): Promise<void> {
    try {
      this.defaultsSignal.set(await this.ipcClient.defaults());
    } catch (error) {
      console.warn('[app] Failed to load the default sections:', error);
    }
  }

  private async loadCampaign(slug: string): Promise<void> {
    try {
      await this.list(slug);
    } catch (error) {
      console.warn('[app] Failed to load the campaign sections:', slug, error);
    }
  }
}
