export interface CampaignDto {
  /** Folder name of the campaign inside the vault, e.g. `lost-mine-of-phandelver`. */
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  /** Icon name (of the Lucide set) from `campaign.md`; null = the default icon. */
  readonly icon: string | null;
  readonly created: string | null;
  readonly cover: string | null;
  /** Game system from `campaign.md` (`dnd5e`, `pf2e`…); null = generic. It picks the tracker layout and the templates. */
  readonly system: string | null;
  /** Notes in the campaign (its card excluded); only in the list, null while the index is not open. */
  readonly noteCount?: number | null;
}

export interface CreateCampaignPayload {
  readonly name: string;
  readonly description?: string | null;
  readonly icon?: string | null;
  /** Keys of the preset sections the campaign starts with; none given = all of them. */
  readonly presets?: readonly string[];
  /** Game system (`dnd5e`, `pf2e`, `generic`); none = generic. */
  readonly system?: string | null;
}

export interface UpdateCampaignPayload {
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null;
  readonly icon?: string | null;
  /** Left out: unchanged. `generic` or null: no system. A change resets the campaign's tracker layout choice. */
  readonly system?: string | null;
}

/** The campaign's AI Agents rules file (`<campaign>/agents.md`). */
export interface AgentRulesDto {
  /** Vault-relative path, `<campaign>/agents.md`. */
  readonly path: string;
  /** False until the user creates it. */
  readonly exists: boolean;
}

/** Why a campaign zip is refused as a whole; each code becomes a plain sentence in the user's language. */
export type ZipRefusalCode =
  | 'not-a-zip'
  | 'too-large-file'
  | 'too-many-entries'
  | 'too-many-bytes'
  | 'ratio'
  | 'encrypted'
  | 'unsupported-compression'
  | 'special-file'
  | 'unsafe-path'
  | 'duplicate'
  | 'corrupt'
  | 'empty'
  | 'no-folder'
  | 'multiple-folders'
  | 'newer-version';

/** A file of a zip that would be left out on import (`type`, `too-large`, `name`, `party`). */
export interface ImportSkippedFileDto {
  readonly path: string;
  readonly reason: string;
}

/** A thing in the zip's settings that was ignored: a `code` and the `field` it concerns. */
export interface ImportWarningDto {
  readonly code: string;
  readonly field: string;
}

/** What a campaign zip holds, shown before anything is written (design-principles §6g). */
export interface ImportPreviewDto {
  /** The top-level folder of the zip. */
  readonly folderName: string;
  readonly title: string;
  readonly description: string | null;
  /** `generic`, `dnd5e` or `pf2e`. */
  readonly system: string;
  readonly hasManifest: boolean;
  readonly counts: {
    readonly notes: number;
    readonly assets: number;
    readonly encounters: number;
    readonly maps: number;
    readonly templates: number;
  };
  readonly hasAgentRules: boolean;
  /** The first files left out, and how many there are in all. */
  readonly skipped: readonly ImportSkippedFileDto[];
  readonly skippedTotal: number;
  readonly warnings: readonly ImportWarningDto[];
  readonly files: number;
  readonly bytes: number;
}

/** The answer to looking into a zip: cancelled, refused with a code, or ready with a preview and the zip's path. */
export type ScanImportResultDto =
  | { readonly status: 'cancelled' }
  | { readonly status: 'refused'; readonly code: ZipRefusalCode }
  | { readonly status: 'ready'; readonly path: string; readonly preview: ImportPreviewDto };

/** What importing a campaign zip did: the new campaign's folder (slug) and name, and what was left out. */
export interface ImportedCampaignDto {
  readonly slug: string;
  readonly name: string;
  /** Files written, the campaign card included. */
  readonly files: number;
  readonly skipped: readonly ImportSkippedFileDto[];
  readonly skippedTotal: number;
  readonly warnings: readonly ImportWarningDto[];
  readonly counts: ImportPreviewDto['counts'];
}

/** The answer to importing a zip: the new campaign, or the code of why the zip was refused (nothing is written). */
export type ImportCampaignResultDto =
  | { readonly status: 'imported'; readonly result: ImportedCampaignDto }
  | { readonly status: 'refused'; readonly code: ZipRefusalCode };

/** A file of the campaign that is not in its zip, and why (`type`, `too-large`, `name`, `symlink`…). */
export interface ExportSkippedFileDto {
  readonly path: string;
  readonly reason: string;
}

/**
 * What exporting a campaign gave: nothing when the user cancelled the Save dialog, else where the zip is and what
 * went in (design-principles §6g).
 */
export type ExportCampaignResultDto =
  | { readonly cancelled: true }
  | {
      readonly cancelled: false;
      /** Absolute path of the zip. */
      readonly path: string;
      /** Files in the zip, the manifest included. */
      readonly files: number;
      readonly bytes: number;
      readonly skipped: readonly ExportSkippedFileDto[];
      /** Template choices left out because their file is gone. */
      readonly droppedTemplates: number;
    };
