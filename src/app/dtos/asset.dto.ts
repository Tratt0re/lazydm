/** What a saved media file is (the editor shows each kind its own way). */
export type AssetKind = 'image' | 'pdf' | 'audio';

/** A media file pasted into a note, saved in the `assets/` folder of the note's scope. */
export interface SaveAssetPayload {
  /** The note it was pasted into: decides the campaign or system it is saved in. */
  readonly sourcePath: string;
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface SavedAssetDto {
  readonly path: string;
  /** What `![[…]]` needs to resolve to it: the file name, or its scope-relative path when the name is taken. */
  readonly linkTarget: string;
  readonly kind: AssetKind;
}
