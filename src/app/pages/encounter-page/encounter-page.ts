import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { AppEncounterCemeteryComponent } from '@/components/encounter-cemetery/encounter-cemetery.component';
import { AppEncounterHealthBarComponent } from '@/components/encounter-health-bar/encounter-health-bar.component';
import { toInAppEncounterRoute } from '@/components/document-preview/document-preview.markdown';
import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import type {
  BattleRuleDto,
  BattleRuleFieldDto,
  EncounterDto,
  EncounterEntityDto,
  EncounterFileDto,
} from '@/dtos';
import { ASSET_FILE_PARAM, ASSET_SUBFOLDER_PARAM } from '@/pages/asset-page/asset-page';
import { CAMPAIGN_SECTION_PARAM } from '@/pages/campaign-section-page/campaign-section-page';
import { EncounterService } from '@/services/encounter.service';
import { FileActionsService } from '@/services/file-actions.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import { ToolbarContextService, type ToolbarItemAction } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechSheetService } from '@/shared/components/sheet';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

/** Health points of an entity (`values[<healthbar field key>]`); each part is optional. */
interface HealthValue {
  readonly current?: number;
  readonly max?: number;
  readonly temp?: number;
}

type HpChangeMode = 'damage' | 'heal' | 'temp';
const HP_CHANGE_MODES: readonly HpChangeMode[] = ['damage', 'heal', 'temp'];
const HP_UNDO_MAX = 30;

/** What an undo puts back: the health an entity had before a *Manage HP* change. */
interface HpUndoStep {
  readonly entityId: string;
  readonly key: string;
  readonly previous: HealthValue | undefined;
}

/** A status: a free tag the user types on an entity, with an optional number of rounds left. */
interface StatusValue {
  readonly name: string;
  readonly rounds?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Whole number from a form field; null when empty or not a number. */
function parseNumber(value: unknown): number | null {
  const text = String(value ?? '').trim();
  return text.length > 0 && Number.isFinite(Number(text)) ? Math.trunc(Number(text)) : null;
}

/**
 * An encounter on its own page: its initiative list, shown as its battle rule says. Every field of an entity
 * is optional. Edits are saved right away, with the conflict check of a note save. The toolbar adds
 * entities, undoes the last HP change, renames or deletes the file (links follow, like any asset).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-encounter-page',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    TranslatePipe,
    AppEncounterCemeteryComponent,
    AppEncounterHealthBarComponent,
    ArcTechAlertComponent,
    ArcTechBadgeComponent,
    ArcTechButtonComponent,
    ArcTechEmptyComponent,
    ArcTechIconComponent,
    ArcTechTooltipImports,
  ],
  templateUrl: './encounter-page.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class EncounterPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scope = inject(NoteScopeService).scopeOf(getNoteScopeKind(this.route));
  private readonly sectionService = inject(SectionService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly translateService = inject(TranslateService);
  private readonly fileActions = inject(FileActionsService);
  private readonly encounterService = inject(EncounterService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly sheetService = inject(ArcTechSheetService);
  private loadToken = 0;
  private isSaving = false;
  private needsSave = false;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly sectionKey = computed(() => this.params().get(CAMPAIGN_SECTION_PARAM) ?? '');
  private readonly subfolder = computed(() => this.params().get(ASSET_SUBFOLDER_PARAM));
  protected readonly fileName = computed(() => this.params().get(ASSET_FILE_PARAM) ?? '');

  /** Vault-relative path of the encounter file. */
  protected readonly encounterPath = computed(() => {
    const folder = this.subfolder()
      ? `${this.sectionKey()}/${this.subfolder()}`
      : this.sectionKey();
    return `${this.scope()?.rootPath ?? ''}/${folder}/${this.fileName()}`;
  });
  /** The file as loaded or last saved (its hash is what the next save is checked against). */
  private readonly file = signal<EncounterFileDto | null>(null);
  protected readonly encounter = signal<EncounterDto | null>(null);
  protected readonly rule = signal<BattleRuleDto | null>(null);
  protected readonly parseError = computed(() => this.file()?.parseError ?? null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isLoading = signal(true);
  private readonly hpUndoSteps = signal<readonly HpUndoStep[]>([]);

  protected readonly title = computed(() => this.encounter()?.name ?? this.fileName());
  /** A file that is not valid JSON opens empty; editing would replace it, so it stays read-only. */
  protected readonly isEditable = computed(() => this.encounter() !== null && !this.parseError());

  /** Fields shown in the row: the initiative ones lead, the name follows, the others come after. */
  protected readonly leadFields = computed(() => this.rowFields('initiative'));
  protected readonly otherFields = computed(() => this.rowFields('other'));
  /** Key of the rule's initiative field (null when the rule has none). */
  private readonly initiativeKey = computed(
    () => this.rule()?.fields.find((field) => field.component === 'initiative')?.key ?? null,
  );
  /**
   * Entities still in the battle, in the order of the file: sorted by initiative when the battle starts and
   * when an entity is added or its initiative changes, free to be dragged anywhere after that.
   */
  protected readonly entities = computed(() =>
    (this.encounter()?.entities ?? []).filter((entity) => !entity.isDead),
  );
  /** Entities in the cemetery: out of the order, can be recovered. */
  protected readonly deadEntities = computed(() =>
    (this.encounter()?.entities ?? []).filter((entity) => entity.isDead),
  );
  protected readonly isCemeteryOpen = signal(false);
  protected readonly isRunning = computed(() => this.encounter()?.battle.status === 'running');
  protected readonly round = computed(() => this.encounter()?.battle.round ?? 0);
  /** The entity whose turn it is. */
  protected readonly turnId = computed(() => this.encounter()?.battle.turnId ?? null);
  protected readonly turnName = computed(() => {
    const entity = this.entities().find((candidate) => candidate.id === this.turnId());
    return entity ? this.entityName(entity.name) : null;
  });

  constructor() {
    effect(() => {
      if (this.scope()) {
        void this.load(this.encounterPath());
      }
    });

    effect((onCleanup) => {
      const scope = this.scope();
      if (!scope) {
        return;
      }

      const sectionPath = `${scope.routeBase}/${this.sectionKey()}`;
      const subfolder = this.subfolder();
      const isEditable = this.isEditable();
      const isRunning = this.isRunning();
      const battleActions: readonly ToolbarItemAction[] = isRunning
        ? [
            {
              id: 'next-turn',
              label: this.translateService.instant('encounters.battle.next'),
              icon: 'chevrons-right',
              iconOnly: true,
              disabled: () => !isEditable || this.entities().length === 0,
              action: () => this.nextTurn(),
            },
            {
              id: 'stop-battle',
              label: this.translateService.instant('encounters.battle.stop'),
              icon: 'square',
              buttonType: 'outline',
              iconOnly: true,
              disabled: !isEditable,
              action: () => this.openStopSheet(),
            },
          ]
        : [
            {
              id: 'start-battle',
              label: this.translateService.instant('encounters.battle.start'),
              icon: 'play',
              iconOnly: true,
              disabled: () => !isEditable || this.entities().length === 0,
              action: () => this.startBattle(),
            },
          ];
      onCleanup(
        this.toolbarContext.activate({
          title: this.title(),
          titleMode: 'breadcrumb',
          titleBreadcrumbs: [
            { label: scope.name, path: scope.routeBase, translate: false },
            {
              label: this.sectionService.labelOfKey(this.sectionKey(), scope.kind),
              path: sectionPath,
              translate: false,
            },
            ...(subfolder
              ? [
                  {
                    label: toSubfolderLabel(subfolder),
                    path: sectionPath,
                    queryParams: { folder: subfolder },
                    translate: false,
                  },
                ]
              : []),
          ],
          itemActions: [
            ...battleActions,
            {
              id: 'add-entity',
              label: this.translateService.instant('encounters.entity.add'),
              icon: 'plus',
              buttonType: 'outline',
              iconOnly: true,
              disabled: !isEditable,
              action: () => this.openEntitySheet(null),
            },
            {
              id: 'cemetery',
              label: this.translateService.instant('encounters.cemetery.title'),
              icon: 'ghost',
              buttonType: 'outline',
              iconOnly: true,
              action: () => this.isCemeteryOpen.update((isOpen) => !isOpen),
            },
            {
              id: 'undo-hp',
              label: this.translateService.instant('encounters.hp.undo'),
              icon: 'rotate-ccw',
              buttonType: 'outline',
              iconOnly: true,
              disabled: () => !isEditable || this.hpUndoSteps().length === 0,
              action: () => this.undoHpChange(),
            },
            {
              id: 'rename',
              label: this.translateService.instant('campaigns.sections.renameAsset.menu'),
              icon: 'text-cursor-input',
              buttonType: 'outline',
              iconOnly: true,
              action: () => this.openRenameSheet(),
            },
            {
              id: 'delete',
              label: this.translateService.instant('files.delete.menu'),
              icon: 'trash',
              buttonType: 'outline',
              iconOnly: true,
              action: () => this.openDeleteSheet(),
            },
          ],
        }),
      );
    });
  }

  // --- Reading values ----------------------------------------------------------------------------------

  /** Name an entity row shows: its name, else a placeholder (every field of an entity is optional). */
  protected entityName(name: string | null): string {
    return name ?? this.translateService.instant('encounters.entity.unnamed');
  }

  protected numberOf(entity: EncounterEntityDto, field: BattleRuleFieldDto): number | null {
    return toNumber(entity.values[field.key]);
  }

  protected textOf(entity: EncounterEntityDto, field: BattleRuleFieldDto): string | null {
    const value = entity.values[field.key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /** Statuses of an entity (`values[<statuses field key>]`); anything that is not a tag with a name is ignored. */
  protected statusesOf(entity: EncounterEntityDto, field: BattleRuleFieldDto): readonly StatusValue[] {
    const value = entity.values[field.key];
    return Array.isArray(value)
      ? value.filter(
          (status): status is StatusValue => isRecord(status) && typeof status['name'] === 'string',
        )
      : [];
  }

  protected healthOf(entity: EncounterEntityDto, field: BattleRuleFieldDto): HealthValue {
    const value = entity.values[field.key];
    return isRecord(value)
      ? {
          current: toNumber(value['current']) ?? undefined,
          max: toNumber(value['max']) ?? undefined,
          temp: toNumber(value['temp']) ?? undefined,
        }
      : {};
  }

  /** Label of a side: its translation when the rule's option has one (`enemy`, `player`, `ally`), else as written. */
  protected sideLabel(side: string): string {
    const key = `encounters.sides.${side}`;
    const label = this.translateService.instant(key);
    return label === key ? side : label;
  }

  protected fieldLabel(field: BattleRuleFieldDto): string {
    return this.translateService.instant(field.label);
  }

  private rowFields(group: 'initiative' | 'other'): readonly BattleRuleFieldDto[] {
    return (this.rule()?.fields ?? []).filter(
      (field) => field.showInRow && (field.component === 'initiative') === (group === 'initiative'),
    );
  }

  // --- Editing -----------------------------------------------------------------------------------------

  /** Replaces the entity with `change(entity)`, then saves. */
  private updateEntity(
    id: string,
    change: (entity: EncounterEntityDto) => EncounterEntityDto,
  ): void {
    this.updateEncounter((encounter) => ({
      ...encounter,
      entities: encounter.entities.map((entity) => (entity.id === id ? change(entity) : entity)),
    }));
  }

  private updateEncounter(change: (encounter: EncounterDto) => EncounterDto): void {
    const encounter = this.encounter();
    if (encounter && this.isEditable()) {
      this.encounter.set(change(encounter));
      void this.save();
    }
  }

  /**
   * *Add entity* (`entity` null) or *Edit* one: its name and a field for each value the rule shows in the row.
   * Empty fields are simply not stored, so the smallest entity is a name — or nothing at all.
   */
  protected openEntitySheet(entity: EncounterEntityDto | null): void {
    const rule = this.rule();
    if (!rule || !this.isEditable()) {
      return;
    }

    const fields: AppSheetField[] = [
      {
        id: 'name',
        type: 'input',
        label: 'encounters.entity.name',
        placeholder: 'encounters.entity.namePlaceholder',
        value: entity?.name ?? '',
        translate: true,
      },
    ];
    for (const field of rule.fields) {
      fields.push(...this.entityFormFields(field, entity));
    }

    let isDone = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant(
        entity ? 'encounters.entity.editTitle' : 'encounters.entity.addTitle',
      ),
      arcOkText: this.translateService.instant(
        entity ? 'encounters.entity.save' : 'encounters.entity.addSubmit',
      ),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields,
      validateBeforeSubmit: false,
      onSubmit: (form) => {
        if (!isDone) {
          isDone = true;
          this.saveEntityForm(entity, rule, form.getValues());
          sheetRef.close();
        }

        return false;
      },
    });
  }

  private entityFormFields(
    field: BattleRuleFieldDto,
    entity: EncounterEntityDto | null,
  ): AppSheetField[] {
    const label = this.translateService.instant(field.label);
    const value = entity?.values[field.key];
    const number = (id: string, text: string, current: unknown): AppSheetField => ({
      id,
      type: 'input',
      inputType: 'number',
      label: text,
      value: toNumber(current)?.toString() ?? '',
      width: '1/2',
    });

    switch (field.component) {
      case 'initiative':
      case 'number':
        return [number(field.key, label, value)];
      case 'healthbar': {
        const health = isRecord(value) ? value : {};
        return [
          number(
            `${field.key}.current`,
            `${label} · ${this.translateService.instant('encounters.hp.current')}`,
            health['current'],
          ),
          number(
            `${field.key}.max`,
            `${label} · ${this.translateService.instant('encounters.hp.max')}`,
            health['max'],
          ),
        ];
      }
      case 'side':
        return [
          {
            id: field.key,
            type: 'select',
            label,
            value: typeof value === 'string' ? value : '',
            options: [
              { value: '', label: 'encounters.sides.none', translate: true },
              ...(field.options ?? []).map((option) => ({
                value: option,
                label: this.sideLabel(option),
              })),
            ],
          },
        ];
      case 'text':
      case 'note-link':
        return [
          {
            id: field.key,
            type: 'input',
            label,
            value: typeof value === 'string' ? value : '',
          },
        ];
      default:
        return []; // statuses: their own editor
    }
  }

  private saveEntityForm(
    entity: EncounterEntityDto | null,
    rule: BattleRuleDto,
    form: Record<string, unknown>,
  ): void {
    const values: Record<string, unknown> = { ...(entity?.values ?? {}) };
    for (const field of rule.fields) {
      switch (field.component) {
        case 'initiative':
        case 'number':
          this.setOrClear(values, field.key, parseNumber(form[field.key]));
          break;
        case 'healthbar': {
          const previous = isRecord(values[field.key]) ? values[field.key] : {};
          const health = {
            ...(previous as HealthValue),
            current: parseNumber(form[`${field.key}.current`]) ?? undefined,
            max: parseNumber(form[`${field.key}.max`]) ?? undefined,
          };
          this.setOrClear(
            values,
            field.key,
            Object.values(health).some((part) => part !== undefined) ? health : null,
          );
          break;
        }
        case 'side':
        case 'text':
        case 'note-link': {
          const text = String(form[field.key] ?? '').trim();
          this.setOrClear(values, field.key, text.length > 0 ? text : null);
          break;
        }
        default:
          break;
      }
    }

    const name = String(form['name'] ?? '').trim() || null;
    if (entity) {
      const edited = { ...entity, name, values };
      const key = this.initiativeKey();
      // A changed initiative moves the entity to its place; otherwise it stays where it is (it may have been dragged).
      if (key && values[key] !== entity.values[key]) {
        this.updateEncounter((encounter) => ({
          ...encounter,
          entities: this.insertByInitiative(
            encounter.entities.filter((candidate) => candidate.id !== entity.id),
            edited,
          ),
        }));
      } else {
        this.updateEntity(entity.id, () => edited);
      }
    } else {
      // Added mid-battle too: it takes its place by initiative; the current turn does not move.
      this.updateEncounter((encounter) => ({
        ...encounter,
        entities: this.insertByInitiative(encounter.entities, {
          id: crypto.randomUUID(),
          name,
          values,
          isDead: false,
        }),
      }));
    }
  }

  private setOrClear(values: Record<string, unknown>, key: string, value: unknown): void {
    if (value === null || value === undefined) {
      delete values[key];
    } else {
      values[key] = value;
    }
  }

  // --- Battle ------------------------------------------------------------------------------------------

  private initiativeOf(entity: EncounterEntityDto): number {
    const key = this.initiativeKey();
    return (key ? toNumber(entity.values[key]) : null) ?? Number.NEGATIVE_INFINITY;
  }

  /** Highest initiative first; entities without one keep their place after those that have one. */
  private sortByInitiative(entities: readonly EncounterEntityDto[]): EncounterEntityDto[] {
    return [...entities].sort((left, right) => this.initiativeOf(right) - this.initiativeOf(left));
  }

  /** `entity` placed before the first one with a lower initiative; with none of its own it goes last. */
  private insertByInitiative(
    entities: readonly EncounterEntityDto[],
    entity: EncounterEntityDto,
  ): EncounterEntityDto[] {
    const own = this.initiativeOf(entity);
    const index =
      own === Number.NEGATIVE_INFINITY
        ? -1
        : entities.findIndex((other) => this.initiativeOf(other) < own);
    return index === -1
      ? [...entities, entity]
      : [...entities.slice(0, index), entity, ...entities.slice(index)];
  }

  /** *Start battle*: the round is 1, the entities are in initiative order and the first one has the turn. */
  protected startBattle(): void {
    this.updateEncounter((encounter) => {
      const entities = this.sortByInitiative(encounter.entities);
      return {
        ...encounter,
        entities,
        battle: {
          status: 'running',
          round: 1,
          turnId: entities.find((entity) => !entity.isDead)?.id ?? null,
        },
      };
    });
  }

  /** *Next turn*: the entity after the current one; after the last one a new round begins. */
  protected nextTurn(): void {
    this.updateEncounter((encounter) => {
      const alive = encounter.entities.filter((entity) => !entity.isDead);
      if (alive.length === 0) {
        return encounter;
      }

      const index = alive.findIndex((entity) => entity.id === encounter.battle.turnId);
      const isLast = index === alive.length - 1;
      return {
        ...encounter,
        entities: encounter.entities.map((entity) =>
          entity.id === encounter.battle.turnId ? this.tickStatuses(entity) : entity,
        ),
        battle: {
          ...encounter.battle,
          round: encounter.battle.round + (isLast ? 1 : 0),
          turnId: alive[isLast ? 0 : index + 1].id,
        },
      };
    });
  }

  /** *Stop battle* asks first: it clears initiatives and statuses and refills the HP. */
  private openStopSheet(): void {
    const sheetRef = this.sheetService.create({
      arcTitle: this.translateService.instant('encounters.battle.stopTitle'),
      arcContent: this.translateService.instant('encounters.battle.stopDescription'),
      arcOkText: this.translateService.instant('encounters.battle.stopConfirm'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      arcOnOk: () => {
        this.stopBattle();
        sheetRef.close();
        return false;
      },
    });
  }

  /**
   * Ends the battle: no round or turn, every initiative and status gone, HP back to the maximum where there
   * is one (the temporary HP go too). Names, sides and the rest of the values stay.
   */
  private stopBattle(): void {
    const rule = this.rule();
    if (!rule) {
      return;
    }

    const clearedKeys = rule.fields
      .filter((field) => field.component === 'initiative' || field.component === 'statuses')
      .map((field) => field.key);
    const healthKeys = rule.fields
      .filter((field) => field.component === 'healthbar')
      .map((field) => field.key);

    this.hpUndoSteps.set([]);
    this.updateEncounter((encounter) => ({
      ...encounter,
      battle: { status: 'idle', round: 0, turnId: null },
      entities: encounter.entities.map((entity) => {
        const values: Record<string, unknown> = { ...entity.values };
        clearedKeys.forEach((key) => delete values[key]);
        for (const key of healthKeys) {
          const health = isRecord(values[key]) ? (values[key] as HealthValue) : null;
          if (health?.max !== undefined) {
            values[key] = { current: health.max, max: health.max };
          } else if (health) {
            const { temp: _temp, ...rest } = health;
            this.setOrClear(values, key, Object.keys(rest).length > 0 ? rest : null);
          }
        }

        return { ...entity, values };
      }),
    }));
  }

  /** *Duplicate*: a copy right after the entity, numbered after its name ("Goblin 1" → "Goblin 2"). */
  protected duplicateEntity(entity: EncounterEntityDto): void {
    this.updateEncounter((encounter) => {
      const copy: EncounterEntityDto = {
        ...entity,
        id: crypto.randomUUID(),
        name: this.nextNumberedName(entity.name, encounter.entities),
        values: structuredClone(entity.values) as Record<string, unknown>,
      };
      const index = encounter.entities.findIndex((candidate) => candidate.id === entity.id);
      return {
        ...encounter,
        entities: [
          ...encounter.entities.slice(0, index + 1),
          copy,
          ...encounter.entities.slice(index + 1),
        ],
      };
    });
  }

  /** The name with the next free number after its base ("Goblin 1" with Goblin 1–3 present → "Goblin 4"). */
  private nextNumberedName(
    name: string | null,
    entities: readonly EncounterEntityDto[],
  ): string | null {
    if (name === null) {
      return null;
    }

    const base = name.replace(/\s*\d+$/, '').trim();
    const taken = entities
      .map((entity) => entity.name?.match(/^(.*?)\s*(\d*)$/))
      .filter((match): match is RegExpMatchArray => !!match && match[1].trim() === base)
      .map((match) => Number(match[2] || 1));
    return `${base} ${Math.max(0, ...taken) + 1}`;
  }

  /**
   * *Remove*: the entity goes to the cemetery. If it had the turn, the turn passes to the next one (a new
   * round when it was the last); with no one left the battle keeps its round and has no turn.
   */
  protected removeEntity(entity: EncounterEntityDto): void {
    this.updateEncounter((encounter) => {
      const alive = encounter.entities.filter((candidate) => !candidate.isDead);
      const index = alive.findIndex((candidate) => candidate.id === entity.id);
      const others = alive.filter((candidate) => candidate.id !== entity.id);
      let battle = encounter.battle;
      if (battle.status === 'running' && battle.turnId === entity.id) {
        const isLast = index === alive.length - 1;
        battle = {
          ...battle,
          round: battle.round + (isLast && others.length > 0 ? 1 : 0),
          turnId: others.length > 0 ? others[isLast ? 0 : index].id : null,
        };
      }

      return {
        ...encounter,
        battle,
        entities: encounter.entities.map((candidate) =>
          candidate.id === entity.id ? { ...candidate, isDead: true } : candidate,
        ),
      };
    });
  }

  /** *Recover*: back among the living, in its place by initiative; the turn does not move. */
  protected recoverEntity(entity: EncounterEntityDto): void {
    this.updateEncounter((encounter) => {
      const alive = encounter.entities.filter((candidate) => !candidate.isDead);
      const dead = encounter.entities.filter(
        (candidate) => candidate.isDead && candidate.id !== entity.id,
      );
      const hasNoTurn = encounter.battle.status === 'running' && encounter.battle.turnId === null;
      return {
        ...encounter,
        // A battle that was left with no one gives the turn to whoever comes back.
        battle: hasNoTurn ? { ...encounter.battle, turnId: entity.id } : encounter.battle,
        entities: [...this.insertByInitiative(alive, { ...entity, isDead: false }), ...dead],
      };
    });
  }

  /** Drag to reorder the living entities (the dead keep their place after them). */
  protected onDrop(event: CdkDragDrop<EncounterEntityDto[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    this.updateEncounter((encounter) => {
      const alive = encounter.entities.filter((entity) => !entity.isDead);
      moveItemInArray(alive, event.previousIndex, event.currentIndex);
      return {
        ...encounter,
        entities: [...alive, ...encounter.entities.filter((entity) => entity.isDead)],
      };
    });
  }

  // --- Statuses ----------------------------------------------------------------------------------------

  /** *Add status*: a name, and optionally the number of rounds it lasts (it counts down on the entity's turns). */
  protected openStatusSheet(entity: EncounterEntityDto, field: BattleRuleFieldDto): void {
    let isDone = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('encounters.status.title', {
        name: this.entityName(entity.name),
      }),
      arcOkText: this.translateService.instant('encounters.status.submit'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields: [
        {
          id: 'name',
          type: 'input',
          label: 'encounters.status.nameLabel',
          placeholder: 'encounters.status.namePlaceholder',
          required: true,
          translate: true,
        },
        {
          id: 'rounds',
          type: 'input',
          inputType: 'number',
          label: 'encounters.status.roundsLabel',
          description: 'encounters.status.roundsHint',
          translate: true,
        },
      ],
      onSubmit: (form) => {
        const values = form.getValues();
        const name = String(values['name'] ?? '').trim();
        const rounds = parseNumber(values['rounds']);
        if (!isDone && name.length > 0) {
          isDone = true;
          this.setStatuses(entity.id, field.key, (statuses) => [
            ...statuses,
            { name, ...(rounds !== null && rounds > 0 ? { rounds } : {}) },
          ]);
          sheetRef.close();
        }

        return false;
      },
    });
  }

  protected removeStatus(entity: EncounterEntityDto, field: BattleRuleFieldDto, index: number): void {
    this.setStatuses(entity.id, field.key, (statuses) => statuses.filter((_, i) => i !== index));
  }

  /** Replaces the statuses of an entity; none left removes the key, so the file only holds what means something. */
  private setStatuses(
    entityId: string,
    key: string,
    change: (statuses: readonly StatusValue[]) => readonly StatusValue[],
  ): void {
    this.updateEntity(entityId, (entity) => {
      const values = { ...entity.values };
      const current = Array.isArray(values[key]) ? (values[key] as StatusValue[]) : [];
      const next = change(current);
      this.setOrClear(values, key, next.length > 0 ? next : null);
      return { ...entity, values };
    });
  }

  /** End of an entity's turn: its statuses lose a round, and those that reach zero go. Tags without rounds stay. */
  private tickStatuses(entity: EncounterEntityDto): EncounterEntityDto {
    const key = this.rule()?.fields.find((field) => field.component === 'statuses')?.key;
    const current = key ? entity.values[key] : null;
    if (!key || !Array.isArray(current)) {
      return entity;
    }

    const next = (current as StatusValue[])
      .map((status) =>
        status.rounds === undefined ? status : { ...status, rounds: status.rounds - 1 },
      )
      .filter((status) => status.rounds === undefined || status.rounds > 0);
    const values = { ...entity.values };
    this.setOrClear(values, key, next.length > 0 ? next : null);
    return { ...entity, values };
  }

  // --- Hit points --------------------------------------------------------------------------------------

  /** *Manage HP*: damage (temporary HP first), healing (up to the maximum) or setting the temporary HP. */
  protected openHpSheet(entity: EncounterEntityDto, field: BattleRuleFieldDto): void {
    let isDone = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('encounters.hp.title', {
        name: this.entityName(entity.name),
      }),
      arcOkText: this.translateService.instant('encounters.hp.apply'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields: [
        {
          id: 'mode',
          type: 'select',
          label: 'encounters.hp.mode',
          value: 'damage',
          translate: true,
          options: HP_CHANGE_MODES.map((mode) => ({
            value: mode,
            label: `encounters.hp.modes.${mode}`,
            translate: true,
          })),
        },
        {
          id: 'amount',
          type: 'input',
          inputType: 'number',
          label: 'encounters.hp.amount',
          placeholder: '0',
          required: true,
          translate: true,
        },
      ],
      onSubmit: (form) => {
        const values = form.getValues();
        const amount = parseNumber(values['amount']);
        if (!isDone && amount !== null && amount >= 0) {
          isDone = true;
          this.changeHp(entity.id, field.key, String(values['mode']) as HpChangeMode, amount);
          sheetRef.close();
        }

        return false;
      },
    });
  }

  private changeHp(entityId: string, key: string, mode: HpChangeMode, amount: number): void {
    const entity = this.encounter()?.entities.find((candidate) => candidate.id === entityId);
    if (!entity) {
      return;
    }

    const previous = isRecord(entity.values[key]) ? (entity.values[key] as HealthValue) : undefined;
    const { current, max, temp = 0 } = previous ?? {};
    // No current HP yet: start from the maximum (a fresh monster), else from zero.
    const base = current ?? max ?? 0;
    let next: HealthValue;
    if (mode === 'temp') {
      next = { ...previous, temp: amount };
    } else if (mode === 'heal') {
      next = {
        ...previous,
        current: max === undefined ? base + amount : Math.min(base + amount, max),
      };
    } else {
      const absorbed = Math.min(temp, amount);
      // With no HP known there is nothing to subtract from: only the temporary HP take the hit.
      const hasHp = current !== undefined || max !== undefined;
      next = {
        ...previous,
        temp: temp - absorbed,
        ...(hasHp ? { current: Math.max(base - (amount - absorbed), 0) } : {}),
      };
    }

    // No temporary HP left: the key goes, so the file only holds what means something.
    if (!next.temp) {
      const { temp: _temp, ...rest } = next;
      next = rest;
    }

    this.hpUndoSteps.update((steps) => [...steps, { entityId, key, previous }].slice(-HP_UNDO_MAX));
    this.updateEntity(entityId, (candidate) => {
      const values = { ...candidate.values };
      this.setOrClear(values, key, Object.keys(next).length > 0 ? next : null);
      return { ...candidate, values };
    });
  }

  /** Puts back the health an entity had before the last *Manage HP* change (other edits are kept). */
  private undoHpChange(): void {
    const step = this.hpUndoSteps().at(-1);
    if (!step) {
      return;
    }

    this.hpUndoSteps.update((steps) => steps.slice(0, -1));
    this.updateEntity(step.entityId, (entity) => {
      const values = { ...entity.values };
      this.setOrClear(values, step.key, step.previous ?? null);
      return { ...entity, values };
    });
  }

  // --- Loading and saving ------------------------------------------------------------------------------

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.hpUndoSteps.set([]);

    try {
      const [file, rule] = await Promise.all([
        this.encounterService.read(path),
        this.encounterService.rule(path),
      ]);
      if (token === this.loadToken) {
        this.file.set(file);
        this.encounter.set(file.encounter);
        this.rule.set(rule);
      }
    } catch (error) {
      if (token === this.loadToken) {
        this.file.set(null);
        this.encounter.set(null);
        this.errorMessage.set(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (token === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }

  /** Saves the encounter; changes made while a save runs are saved right after it, in order. */
  private async save(): Promise<void> {
    if (this.isSaving) {
      this.needsSave = true;
      return;
    }

    this.isSaving = true;
    try {
      do {
        this.needsSave = false;
        const file = this.file();
        const encounter = this.encounter();
        if (!file || !encounter) {
          return;
        }

        const result = await this.encounterService.write({
          path: file.path,
          encounter,
          expectedHash: file.contentHash,
        });
        if (result.status === 'saved') {
          this.file.set({ ...file, contentHash: result.contentHash, mtimeMs: result.mtimeMs });
        } else {
          this.needsSave = false;
          this.openConflictSheet(result.current);
        }
      } while (this.needsSave);
    } catch (error) {
      toast.error(this.translateService.instant('encounters.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isSaving = false;
    }
  }

  /** The file changed elsewhere while it was open: keep this version, or load the other one. */
  private openConflictSheet(current: EncounterFileDto): void {
    const sheetRef = this.sheetService.create({
      arcTitle: this.translateService.instant('encounters.conflict.title'),
      arcContent: this.translateService.instant('encounters.conflict.description'),
      arcOkText: this.translateService.instant('encounters.conflict.keepMine'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('encounters.conflict.reload'),
      arcOnOk: () => {
        // Overwrite: the next save is checked against the other version.
        this.file.set(current);
        void this.save();
        sheetRef.close();
        return false;
      },
      arcOnCancel: () => {
        this.file.set(current);
        this.encounter.set(current.encounter);
        this.hpUndoSteps.set([]);
      },
    });
  }

  // --- File actions ------------------------------------------------------------------------------------

  /** *Rename*: links follow; the page (and its tab, in a campaign) moves to the new file name. */
  private openRenameSheet(): void {
    const oldPath = this.encounterPath();
    void this.fileActions.openRenameAssetSheet(
      { path: oldPath, name: this.fileName() },
      (newPath) => void this.followRename(oldPath, newPath),
    );
  }

  /** *Delete…* (to the system Trash); the page, and its tab in a campaign, go to the folder page. */
  private openDeleteSheet(): void {
    void this.fileActions.openDeleteSheet(
      { path: this.encounterPath(), label: this.fileName(), isNote: false },
      (folderRoute) => {
        if (folderRoute && this.scope()?.kind === 'system') {
          void this.router.navigateByUrl(folderRoute, { replaceUrl: true });
        }
      },
    );
  }

  private async followRename(oldPath: string, newPath: string): Promise<void> {
    const oldRoute = toInAppEncounterRoute(oldPath);
    const newRoute = toInAppEncounterRoute(newPath);
    if (!oldRoute || !newRoute || oldRoute === newRoute) {
      return;
    }

    // Campaign tabs follow the rename on their own (FileActionsService); a system page navigates itself.
    if (this.scope()?.kind === 'system') {
      await this.router.navigateByUrl(newRoute, { replaceUrl: true });
    }
  }
}
