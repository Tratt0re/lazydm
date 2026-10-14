export type DocumentFileKind = 'md' | 'asset';

export interface DocumentFileListItemDto {
  /** Vault-relative path, e.g. `lost-mine-of-phandelver/enemies/goblin-boss.md`. */
  readonly path: string;
  /** File name without extension for notes, full file name for assets. */
  readonly name: string;
  readonly kind: DocumentFileKind;
  readonly type: string | null;
  readonly title: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly tags: readonly string[];
}

/** A file a note's links can point to (same campaign or system), offered by the editor's link suggestions. */
export interface LinkTargetDto {
  readonly path: string;
  /** Link name: file name without extension for notes, full file name for assets. */
  readonly name: string;
  readonly kind: DocumentFileKind;
  readonly type: string | null;
  readonly title: string;
}

export type DocumentLinkKind = 'wikilink' | 'embed' | 'markdown';

export interface DocumentLinkDto {
  /** Raw text between `[[` and `]]`, or the `(...)` target of a markdown link. */
  readonly raw: string;
  readonly kind: DocumentLinkKind;
  readonly targetName: string;
  readonly heading: string | null;
  /** Vault-relative path the link resolves to, or null when the target note isn't found. */
  readonly resolvedPath: string | null;
  /** Title of the file the link resolves to (null when broken). */
  readonly resolvedTitle?: string | null;
}

export interface DocumentDto {
  readonly path: string;
  readonly content: string;
  readonly contentHash: string;
  readonly mtimeMs: number;
  readonly title: string;
  readonly type: string | null;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly frontmatterError: string | null;
  readonly body: string;
  readonly links: readonly DocumentLinkDto[];
}

export interface ListDocumentsPayload {
  readonly folder: string;
}

export interface ReadDocumentPayload {
  readonly path: string;
}

export interface WriteDocumentPayload {
  readonly path: string;
  readonly content: string;
  /** Content hash the editor last loaded; a mismatch on disk is reported back as a conflict. */
  readonly expectedHash: string | null;
}

export interface SaveDocumentCopyPayload {
  readonly path: string;
  readonly content: string;
}

export interface CreateDocumentPayload {
  readonly folder: string;
  readonly title: string;
  readonly type: string;
  /** Display name of the folder, for the `{{section}}` template placeholder. */
  readonly section?: string;
}

export type WriteDocumentResultDto =
  | { readonly status: 'saved'; readonly contentHash: string; readonly mtimeMs: number }
  | { readonly status: 'conflict'; readonly current: DocumentDto };

/** A link from another note, with the text of the line that holds it. */
export interface BacklinkDto {
  readonly sourcePath: string;
  readonly sourceTitle: string | null;
  readonly raw: string;
  readonly kind: DocumentLinkKind;
  readonly line: number;
  readonly snippet: string;
}

/** Side panel data of a note: who links to it, what it links to, and its own unresolved links. */
export interface DocumentLinksDto {
  readonly backlinks: readonly BacklinkDto[];
  readonly outgoingLinks: readonly DocumentLinkDto[];
  readonly brokenLinks: readonly DocumentLinkDto[];
}

export interface UnlinkPayload {
  readonly path: string;
  /** Raw target of the link to remove (every occurrence in the note is replaced by its text). */
  readonly raw: string;
}

export interface CreateFromLinkPayload {
  readonly sourcePath: string;
  readonly raw: string;
  readonly folder: string;
  readonly title: string;
  readonly type: string;
  /** Display name of the folder, for the `{{section}}` template placeholder. */
  readonly section?: string;
}

/** An unresolved link written in a note of a campaign. */
export interface BrokenLinkDto {
  readonly sourcePath: string;
  readonly sourceTitle: string | null;
  readonly raw: string;
  readonly kind: DocumentLinkKind;
  readonly targetName: string;
  readonly heading: string | null;
  readonly line: number;
}

export interface RenameDocumentPayload {
  readonly path: string;
  readonly title: string;
  /** Rewrite the links of other notes pointing to this one (default true). */
  readonly updateLinks?: boolean;
}

export interface RenameDocumentResultDto {
  readonly path: string;
  readonly updatedPaths: readonly string[];
  /** Notes changed by someone else meanwhile: their links were left as they were. */
  readonly failedPaths: readonly string[];
  readonly linkCount: number;
}
