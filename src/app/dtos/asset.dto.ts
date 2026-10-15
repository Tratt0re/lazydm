/** What a saved media file is (the editor shows each kind its own way). */
export type AssetKind = 'image' | 'pdf' | 'audio';

/**
 * Where media files go: the `assets/` folder of a note's scope (`sourcePath`, a paste in the editor), or a
 * folder of the Assets section (`folder`, an import or a drop on the section page).
 */
export type AssetTarget = { readonly sourcePath: string } | { readonly folder: string };

/** A media file pasted into a note or dropped on the Assets section, saved in its target. */
export type SaveAssetPayload = AssetTarget & {
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
};

export interface SavedAssetDto {
  readonly path: string;
  /** What `![[…]]` needs to resolve to it: the file name, or its scope-relative path when the name is taken. */
  readonly linkTarget: string;
  readonly kind: AssetKind;
  /** An identical file was already in the scope's assets: that one is linked, nothing was saved. */
  readonly isReused: boolean;
}
