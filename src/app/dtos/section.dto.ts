/** A default section: folder (also the route segment), note type (null for assets), icon name. */
export interface DefaultSectionDto {
  readonly key: string;
  readonly type: string | null;
  readonly icon: string;
  /** Assets and encounters: no plain notes; their sub-folders only organise files (not sub-types). */
  readonly isSpecial?: boolean;
}

/** A section of a campaign with its settings applied (`.lazydm/vault.json` → `sections.campaigns.<slug>`). */
export interface SectionDto extends DefaultSectionDto {
  /** Custom name (a custom section's name, or a default section renamed); null keeps the translated name. */
  readonly label: string | null;
  readonly isCustom: boolean;
  readonly isHidden: boolean;
  /** Files in the section folder (from the vault index). */
  readonly fileCount: number;
}

export interface SectionDefaultsDto {
  readonly campaign: readonly DefaultSectionDto[];
  /** Default sections plus the folders only a compendium system has (`notes/`). */
  readonly compendium: readonly DefaultSectionDto[];
}

/** A custom section to save: an existing one keeps its `key` (folder) and type; a new one has no key. */
export interface CustomSectionPayload {
  readonly key?: string;
  readonly label: string;
  readonly type?: string;
  readonly icon: string;
}

export interface SectionSettingsPayload {
  readonly hidden: readonly string[];
  readonly order: readonly string[];
  readonly labels: Readonly<Record<string, string>>;
  readonly custom: readonly CustomSectionPayload[];
}
