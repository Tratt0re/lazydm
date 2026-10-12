/** Where a template file lives: the vault's `_templates/`, a compendium system's or a campaign's. */
export type TemplateSource = 'vault' | 'system' | 'campaign';

export interface TemplateDto {
  /** Vault-relative path (`_templates/monster.md`, `compendium/dnd-5e/_templates/monster.md`…). */
  readonly path: string;
  readonly name: string;
  readonly source: TemplateSource;
  /** Campaign slug or `compendium/<system>`; null for vault-level templates. */
  readonly scope: string | null;
  readonly scopeName: string | null;
}

export interface TemplateListDto {
  readonly rows: readonly TemplateDto[];
  /** Note types that have a built-in template (every note type but encounters). */
  readonly types: readonly string[];
}

/** Template choice of a campaign for a note type: a template path or `builtin`; missing means automatic. */
export type TemplateRulesDto = Readonly<Record<string, string>>;

export interface SetTemplateRulePayload {
  readonly campaign: string;
  readonly type: string;
  /** Template path, `builtin`, or null to go back to automatic. */
  readonly template: string | null;
}

export interface CreateTemplatePayload {
  readonly name: string;
  /** Start from the built-in of this note type (empty template when missing). */
  readonly type?: string | null;
}
