import type { BattleRuleDto, BattleRuleFieldDto, EncounterEntityDto } from '@/dtos';

/** Health points of an entity (`values[<healthbar field key>]`); each part is optional. */
export interface HealthValue {
  readonly current?: number;
  readonly max?: number;
  readonly temp?: number;
}

/** A status: a free tag the user types on an entity, with an optional number of rounds left. */
export interface StatusValue {
  readonly name: string;
  readonly rounds?: number;
}

/** Frontmatter of the linked notes already read, by note path. */
export type NoteFrontmatterMap = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

/** What reading a value of an entity needs: the key of the rule's note-link field and the notes read so far. */
export interface NoteContext {
  readonly noteKey: string | null;
  readonly frontmatter: NoteFrontmatterMap;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Whole number from a form field; null when empty or not a number. */
export function parseNumber(value: unknown): number | null {
  const text = String(value ?? '').trim();
  return text.length > 0 && Number.isFinite(Number(text)) ? Math.trunc(Number(text)) : null;
}

/** Key of the rule's note-link field (null when the rule has none). */
export function noteKeyOf(rule: BattleRuleDto | null): string | null {
  return rule?.fields.find((field) => field.component === 'note-link')?.key ?? null;
}

/** Vault path of the note an entity is linked to. */
export function noteOf(entity: EncounterEntityDto, context: NoteContext): string | null {
  const value = context.noteKey ? entity.values[context.noteKey] : undefined;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Value of a field read from the entity's linked note: the frontmatter key of a `frontmatter:<key>` source.
 * It only fills in what the entity has no value of its own for; nothing is copied into the file.
 */
export function noteValueOf(
  entity: EncounterEntityDto,
  field: { readonly source?: string },
  context: NoteContext,
): unknown {
  const prefix = 'frontmatter:';
  const notePath = noteOf(entity, context);
  return notePath && field.source?.startsWith(prefix)
    ? context.frontmatter.get(notePath)?.[field.source.slice(prefix.length)]
    : undefined;
}

export function numberOf(
  entity: EncounterEntityDto,
  field: BattleRuleFieldDto,
  context: NoteContext,
): number | null {
  return toNumber(entity.values[field.key]) ?? toNumber(noteValueOf(entity, field, context));
}

/** Text of a field: the combatant's own, else (for a field that reads from a note) what its note says. */
export function textOf(
  entity: EncounterEntityDto,
  field: { readonly key: string; readonly source?: string },
  context: NoteContext,
): string | null {
  const value = entity.values[field.key];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  const fromNote = noteValueOf(entity, field, context);
  if (typeof fromNote === 'string' && fromNote.trim().length > 0) {
    return fromNote.trim();
  }

  return typeof fromNote === 'number' ? String(fromNote) : null;
}

/** Statuses of an entity (`values[<statuses field key>]`); anything that is not a tag with a name is ignored. */
export function statusesOf(entity: EncounterEntityDto, field: BattleRuleFieldDto): readonly StatusValue[] {
  const value = entity.values[field.key];
  return Array.isArray(value)
    ? value.filter(
        (status): status is StatusValue => isRecord(status) && typeof status['name'] === 'string',
      )
    : [];
}

export function healthOf(
  entity: EncounterEntityDto,
  field: BattleRuleFieldDto,
  context: NoteContext,
): HealthValue {
  const value = entity.values[field.key];
  if (isRecord(value)) {
    return {
      current: toNumber(value['current']) ?? undefined,
      max: toNumber(value['max']) ?? undefined,
      temp: toNumber(value['temp']) ?? undefined,
    };
  }

  // Nothing of its own: a note that gives a number (`hp: 11`) is a full health bar.
  const fromNote = toNumber(noteValueOf(entity, field, context));
  return fromNote === null ? {} : { current: fromNote, max: fromNote };
}

/**
 * The entity's own value differs from a value its note gives: the mark and *Reset to note value* show only
 * then. A value typed where the note says nothing overrides nothing, and neither does the current HP of a
 * damaged monster (it changes all fight long): for a health bar only the maximum counts.
 */
export function isOverridden(
  entity: EncounterEntityDto,
  field: BattleRuleFieldDto,
  context: NoteContext,
): boolean {
  if (!field.source.startsWith('frontmatter:') || entity.values[field.key] === undefined) {
    return false;
  }

  const note = toNumber(noteValueOf(entity, field, context));
  if (note === null) {
    return false;
  }

  return field.component === 'healthbar'
    ? healthOf(entity, field, context).max !== note
    : toNumber(entity.values[field.key]) !== note;
}
