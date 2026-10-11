export interface CampaignDto {
  /** Folder name of the campaign inside the vault, e.g. `lost-mine-of-phandelver`. */
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly created: string | null;
  readonly cover: string | null;
}

export interface CreateCampaignPayload {
  readonly name: string;
  readonly description?: string | null;
}
