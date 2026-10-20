/** What a field of an entity row shows and edits; the battle rule picks one per field. */
export type BattleFieldComponent =
  'initiative' | 'text' | 'number' | 'healthbar' | 'statuses' | 'side' | 'note-link';

export interface BattleRuleFieldDto {
  /** Key the entities store their value under. */
  readonly key: string;
  readonly component: BattleFieldComponent;
  /** An i18n key or free text. */
  readonly label: string;
  /** `entity` (stored in the encounter) or `frontmatter:<key>` (read from the entity's linked note). */
  readonly source: string;
  /** Shown in the row; otherwise only in the entity's detail. */
  readonly showInRow: boolean;
  /** Choices of a `side` field. */
  readonly options?: readonly string[];
}

export interface BattleRuleDto {
  readonly version: number;
  readonly name: string;
  /** Template (path or `builtin:<type>`) whose frontmatter keys the rule can read; null for none. */
  readonly template: string | null;
  /** `roll`: a dice formula for the initiative (`1d20 + {dex}`); null means it is typed by hand. */
  readonly initiative: { readonly roll: string | null };
  readonly fields: readonly BattleRuleFieldDto[];
}

/** A rule file of the vault, a system or a campaign. */
export interface BattleRuleRowDto {
  readonly path: string;
  readonly name: string;
  readonly source: 'vault' | 'system' | 'campaign';
  readonly scope: string | null;
  readonly scopeName: string | null;
}

export interface BattleRuleListDto {
  readonly rows: readonly BattleRuleRowDto[];
  readonly builtIn: BattleRuleDto;
}

export interface BattleRuleFileDto {
  readonly path: string;
  readonly rule: BattleRuleDto;
  readonly parseError: string | null;
  readonly contentHash: string;
}

export type WriteBattleRuleResultDto =
  | { readonly status: 'saved'; readonly contentHash: string }
  | { readonly status: 'conflict'; readonly current: BattleRuleFileDto };

/** An entity of a battle: every field is optional, only the id is guaranteed. */
export interface EncounterEntityDto {
  readonly id: string;
  readonly name: string | null;
  /** Values by rule field key (a number, text, `{ current, max, temp }` of a health bar, statuses…). */
  readonly values: Readonly<Record<string, unknown>>;
  /** In the cemetery: out of the turn order, can be recovered. */
  readonly isDead: boolean;
}

export type EncounterBattleStatus = 'idle' | 'running';

export interface EncounterBattleDto {
  readonly status: EncounterBattleStatus;
  /** 0 while no battle runs. */
  readonly round: number;
  /** The entity whose turn it is. */
  readonly turnId: string | null;
}

export interface EncounterDto {
  readonly version: number;
  readonly name: string;
  readonly notes: string;
  /** Battle rule of this encounter (a path or `builtin`); null follows the campaign's choice. */
  readonly rule: string | null;
  readonly battle: EncounterBattleDto;
  readonly entities: readonly EncounterEntityDto[];
}

export interface EncounterFileDto {
  readonly path: string;
  readonly encounter: EncounterDto;
  /** The file is not valid JSON: it opens empty and saving would replace it. */
  readonly parseError: string | null;
  readonly contentHash: string;
  readonly mtimeMs: number;
}

export interface WriteEncounterPayload {
  readonly path: string;
  readonly encounter: EncounterDto;
  /** Hash of the file as loaded; null when the file is new. */
  readonly expectedHash: string | null;
}

export type WriteEncounterResultDto =
  | { readonly status: 'saved'; readonly contentHash: string; readonly mtimeMs: number }
  | { readonly status: 'conflict'; readonly current: EncounterFileDto };

export interface CreateEncounterPayload {
  readonly folder: string;
  readonly name: string;
}
