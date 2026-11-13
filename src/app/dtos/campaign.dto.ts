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
