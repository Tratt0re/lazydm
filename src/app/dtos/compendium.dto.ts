/** A compendium system: a cross-campaign folder (`compendium/<slug>/`) with a `system.md` card. */
export interface CompendiumSystemDto {
  readonly slug: string;
  /** Vault path of the system folder, e.g. `compendium/my-system`. */
  readonly path: string;
  readonly name: string;
  readonly description: string | null;
  readonly created: string | null;
  /** Folders it currently has; they appear when something is created or copied into it. */
  readonly folders: readonly string[];
}

export interface CreateCompendiumSystemPayload {
  readonly name: string;
  readonly description?: string | null;
}

export interface CopyDocumentPayload {
  readonly path: string;
  /** A campaign slug (`lost-mine`) or a compendium system path (`compendium/my-system`). */
  readonly target: string;
  /** Other file name (without extension) when the original one is taken. */
  readonly fileName?: string | null;
}

export type CopyDocumentResultDto =
  | { readonly status: 'copied'; readonly path: string }
  | { readonly status: 'exists'; readonly path: string };
