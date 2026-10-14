/** A note of the Review page. */
export interface ReviewNoteDto {
  readonly path: string;
  readonly title: string;
  readonly type: string | null;
  readonly subtype: string | null;
}

/** A note in a section folder: where it is and the type that folder expects. */
export interface ReviewPlacedNoteDto extends ReviewNoteDto {
  readonly section: string;
  readonly subfolder: string | null;
  readonly sectionType: string;
}

/** A note whose type belongs to another section (`typeSection`, null when no section has that type). */
export interface ReviewMisplacedNoteDto extends ReviewPlacedNoteDto {
  readonly typeSection: string | null;
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

/** What disagrees with the sections of a campaign or system (see DESIGN_PRINCIPLES §2a, Review). */
export interface ReviewDto {
  readonly brokenLinkCount: number;
  readonly misplaced: readonly ReviewMisplacedNoteDto[];
  readonly wrongSubtype: readonly ReviewPlacedNoteDto[];
  readonly untyped: readonly ReviewPlacedNoteDto[];
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
