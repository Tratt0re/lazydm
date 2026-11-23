/** Game systems a quick reference can come from. */
export type QuickReferenceSystem = 'generic' | 'dnd5e' | 'pf2e';

export interface QuickReferenceCategoryDto {
  readonly id: string;
  readonly name: string;
}

export interface QuickReferenceRuleDto {
  readonly id: string;
  readonly title: string;
  /** One line, shown on the card. */
  readonly short: string;
  /** Markdown, shown in the detail panel. */
  readonly full: string;
  /** Name in the icon registry. */
  readonly icon: string;
  /** Category ids; a rule with none shows under Uncategorised. */
  readonly categories: readonly string[];
  /** Key of the built-in rule it came from (`dnd5e/dodge`); absent on the user's own rules. */
  readonly source?: string;
}

export interface QuickReferenceDto {
  readonly formatVersion: number;
  readonly system: QuickReferenceSystem;
  readonly categories: readonly QuickReferenceCategoryDto[];
  readonly rules: readonly QuickReferenceRuleDto[];
  /** The credit line of the text the rules come from. */
  readonly attribution: string;
}

/** Something the reader changed or could not use; shown as a notice, never an error. */
export interface QuickReferenceWarningDto {
  readonly code: string;
  readonly count?: number;
}

export interface QuickReferenceFileDto {
  readonly path: string;
  /** False for a campaign that has no file yet: the data is an empty sheet. */
  readonly exists: boolean;
  readonly data: QuickReferenceDto;
  readonly warnings: readonly QuickReferenceWarningDto[];
  /** Hash of the file as read; null when it does not exist. */
  readonly contentHash: string | null;
  readonly mtimeMs: number | null;
}

export interface WriteQuickReferencePayload {
  readonly campaign: string;
  readonly data: QuickReferenceDto;
  /** Hash of the file as loaded; null when the file is new. */
  readonly expectedHash: string | null;
}

export type WriteQuickReferenceResultDto =
  | {
      readonly status: 'saved';
      readonly data: QuickReferenceDto;
      readonly warnings: readonly QuickReferenceWarningDto[];
      readonly contentHash: string;
      readonly mtimeMs: number;
    }
  | { readonly status: 'conflict'; readonly current: QuickReferenceFileDto };

/** What the built-in rules need: the campaign, the language of the words and the hash the page loaded. */
export interface QuickReferenceBuiltinPayload {
  readonly campaign: string;
  readonly language: string;
  readonly expectedHash: string | null;
}
