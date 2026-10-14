/** One result row from a full-text search. The `snippet` wraps matched words in `<m>…</m>` tags. */
export interface SearchResultDto {
  readonly path: string;
  readonly title: string;
  /** `'md'` for notes, `'image'` / `'pdf'` etc. for assets. */
  readonly kind: string;
  /** Note type (e.g. `'character'`); null for assets and un-typed notes. */
  readonly type: string | null;
  /** Body extract with matched words wrapped in `<m>…</m>`; empty when the match was title-only. */
  readonly snippet: string;
}
