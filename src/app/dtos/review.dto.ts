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

/** A file a sync client made next to (or instead of) another: `goblin 2.md` for `goblin.md`. */
export interface SyncCopyDto {
  readonly path: string;
  /** The name it should have: the file it copies, or used to be. */
  readonly originalPath: string;
  /** `pair`: both files exist; `orphan`: only the copy is left, and notes link to the missing name. */
  readonly kind: 'pair' | 'orphan';
}

export type CopyRepairAction = 'keep-original' | 'keep-both' | 'restore-name';

export interface CopySideDto {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly hash: string;
  /** Notes (and maps) linking to this file. */
  readonly linkCount: number;
  /** The text, only when there is no diff to show it with (a long note, or a diff that is too big). */
  readonly text: string | null;
}

export type CopyDiffOp =
  | { readonly type: 'same' | 'del' | 'add'; readonly text: string }
  | { readonly type: 'skip'; readonly count: number };

export interface CopyComparisonDto {
  readonly path: string;
  readonly originalPath: string;
  readonly kind: 'pair' | 'orphan';
  readonly isNote: boolean;
  readonly isIdentical: boolean;
  readonly copy: CopySideDto;
  readonly original: CopySideDto | null;
  /** Lines that differ (original to copy), with a little context; null for files that are not notes. */
  readonly diff: readonly CopyDiffOp[] | null;
  readonly actions: readonly CopyRepairAction[];
}

export interface ResolveCopyPayload {
  readonly path: string;
  readonly action: CopyRepairAction;
  /** Hashes shown by the comparison: the repair stops if either file changed since. */
  readonly copyHash: string;
  readonly originalHash: string | null;
}

export interface ResolveCopyResultDto {
  readonly path: string;
  readonly updatedPaths: readonly string[];
  readonly failedPaths: readonly string[];
  readonly linkCount: number;
}

/** What disagrees with the folders of a campaign or system (see DESIGN_PRINCIPLES §2a, Review). */
export interface ReviewDto {
  readonly brokenLinkCount: number;
  readonly outside: readonly ReviewNoteDto[];
  /** Folders of a campaign that are not sections (campaigns only). */
  readonly unknownFolders: readonly ReviewFolderDto[];
  readonly tooDeep: readonly ReviewDeepFolderDto[];
  /** Files a sync client made as copies (see `SyncCopyDto`). */
  readonly copies: readonly SyncCopyDto[];
}

export interface MoveDocumentResultDto {
  readonly path: string;
  readonly updatedPaths: readonly string[];
  readonly failedPaths: readonly string[];
  readonly linkCount: number;
}
