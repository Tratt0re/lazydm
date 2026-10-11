export type DocumentFileKind = 'md' | 'asset';

export interface DocumentFileListItemDto {
  /** Vault-relative path, e.g. `lost-mine-of-phandelver/monsters/goblin-boss.md`. */
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

export type DocumentLinkKind = 'wikilink' | 'embed' | 'markdown';

export interface DocumentLinkDto {
  /** Raw text between `[[` and `]]`, or the `(...)` target of a markdown link. */
  readonly raw: string;
  readonly kind: DocumentLinkKind;
  readonly targetName: string;
  readonly heading: string | null;
  /** Vault-relative path the link resolves to, or null when the target note isn't found. */
  readonly resolvedPath: string | null;
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
}

export type WriteDocumentResultDto =
  | { readonly status: 'saved'; readonly contentHash: string; readonly mtimeMs: number }
  | { readonly status: 'conflict'; readonly current: DocumentDto };
