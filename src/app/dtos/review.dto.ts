/** A note of the Review page. */
export interface ReviewNoteDto {
  readonly path: string;
  readonly title: string;
}

export interface ReviewFolderDto {
  readonly name: string;
  readonly fileCount: number;
}

export interface ReviewDeepFolderDto {
  /** Vault-relative folder, deeper than one sub-folder of a section. */
  readonly folder: string;
  readonly fileCount: number;
}

/** What disagrees with the folders of a campaign or system (see DESIGN_PRINCIPLES §2a, Review). */
export interface ReviewDto {
  readonly brokenLinkCount: number;
  readonly outside: readonly ReviewNoteDto[];
  /** Folders of a campaign that are not sections (campaigns only). */
  readonly unknownFolders: readonly ReviewFolderDto[];
  readonly tooDeep: readonly ReviewDeepFolderDto[];
}

export interface MoveDocumentResultDto {
  readonly path: string;
  readonly updatedPaths: readonly string[];
  readonly failedPaths: readonly string[];
  readonly linkCount: number;
}
