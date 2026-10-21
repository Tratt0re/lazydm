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
  /** Also copy the linked files the target is missing (see `CopyPlanDto`). */
  readonly includeLinked?: boolean;
  /** Sub-folder of the file's section it goes into; none (or null) puts it in the section itself. */
  readonly subfolder?: string | null;
}

/** Files a copy would also need: what the file links to (transitively) that the target does not have. */
export interface CopyPlanDto {
  readonly linked: readonly { readonly path: string; readonly title: string }[];
  /** The sub-folder the file sits in at the source (null when it is in the section itself). */
  readonly subfolder: CopySubfolderDto | null;
}

/** The source sub-folder of a copy and what the target already has of it. */
export interface CopySubfolderDto {
  readonly name: string;
  /** Section folder it belongs to (`enemies`, `assets`, `encounters`…). */
  readonly section: string;
  /** The target already has a sub-folder of that name. */
  readonly exists: boolean;
  /** …and a file of the same name is already in it. */
  readonly fileExists: boolean;
}

export type CopyDocumentResultDto =
  | { readonly status: 'copied'; readonly path: string; readonly linkedPaths: readonly string[] }
  | { readonly status: 'exists'; readonly path: string; readonly linkedPaths: readonly string[] };
