/** One result row from a full-text search. The `snippet` wraps matched words in `<m>…</m>` tags. */
export interface SearchResultDto {
  readonly path: string;
  readonly title: string;
  /** `'md'` for notes, `'image'` / `'pdf'` etc. for assets. */
  readonly kind: string;
  /** Type of the section the note's folder is (e.g. `'character'`); null for assets and notes outside a section. */
  readonly type: string | null;
  /** Body extract with matched words wrapped in `<m>…</m>`; empty when the match was title-only. */
  readonly snippet: string;
}
