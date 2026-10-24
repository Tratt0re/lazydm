import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
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
import { AppEncounterNotePanelComponent } from '@/components/encounter-note-panel/encounter-note-panel.component';
import { AppEncounterHealthBarComponent } from '@/components/encounter-health-bar/encounter-health-bar.component';
import {
  ENCOUNTER_EXTENSION_PATTERN,
  toInAppEncounterRoute,
} from '@/components/document-preview/document-preview.markdown';
import type { AppSheetFormComponent } from '@/components/sheet-form/sheet-form.component';
import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type { AppSheetField, AppSheetInputAction } from '@/components/sheet-form/sheet-form.types';
import type {
  BattleFieldComponent,
  BattleRuleAreaDto,
  BattleRuleDto,
  BattleRuleFieldDto,
  BattleRuleRowDto,
  EncounterDto,
  EncounterEntityDto,
  EncounterFileDto,
  LinkTargetDto,
} from '@/dtos';
import { ASSET_FILE_PARAM, ASSET_SUBFOLDER_PARAM } from '@/pages/asset-page/asset-page';
import { CAMPAIGN_SECTION_PARAM } from '@/pages/campaign-section-page/campaign-section-page';
import { DocumentService } from '@/services/document.service';
import {
  BattleRuleService,
  BUILT_IN_BATTLE_RULE,
  DEFAULT_BATTLE_RULE_CHOICE,
} from '@/services/battle-rule.service';
import { EncounterService, PARTY_FILE_NAME } from '@/services/encounter.service';
import { CopyToService } from '@/services/copy-to.service';
import { FileActionsService } from '@/services/file-actions.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import { ToolbarContextService, type ToolbarItemAction } from '@/services/toolbar-context.service';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechEmptyComponent } from '@/shared/components/empty';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechDialogService } from '@/shared/components/dialog';
import { ArcTechSheetService } from '@/shared/components/sheet';
import { ArcTechCheckboxComponent } from '@/shared/components/checkbox';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { rollDice } from '@/shared/utils/dice';

/** Health points of an entity (`values[<healthbar field key>]`); each part is optional. */
interface HealthValue {
  readonly current?: number;
  readonly max?: number;
  readonly temp?: number;
}

type HpChangeMode = 'damage' | 'heal' | 'temp';
const HP_CHANGE_MODES: readonly HpChangeMode[] = ['damage', 'heal', 'temp'];
/** Most copies one add inserts at once (more is unrealistic at a table). */
const ENTITY_QUANTITY_MAX = 15;

/** An element of the entity row and the grid cells it takes (the name has no field). */
interface RowCell {
  readonly id: string;
  readonly field: BattleRuleFieldDto | null;
  readonly area: BattleRuleAreaDto;
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
    ArcTechCheckboxComponent,
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly scope = inject(NoteScopeService).scopeOf(getNoteScopeKind(this.route));
  private readonly sectionService = inject(SectionService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly translateService = inject(TranslateService);
  private readonly fileActions = inject(FileActionsService);
  private readonly copyTo = inject(CopyToService);
  private readonly encounterService = inject(EncounterService);
  private readonly documentService = inject(DocumentService);
  private readonly battleRuleService = inject(BattleRuleService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly sheetService = inject(ArcTechSheetService);
  private readonly dialogService = inject(ArcTechDialogService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
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

  /** The party roster of the scope: the same page, without the battle (it only holds who can be added to one). */
  protected readonly isParty = computed(() => this.fileName() === PARTY_FILE_NAME);
  protected readonly title = computed(() =>
    this.isParty()
      ? this.translateService.instant('encounters.party.title')
      : (this.encounter()?.name ?? this.fileName().replace(ENCOUNTER_EXTENSION_PATTERN, '')),
  );
  /** A file that is not valid JSON opens empty; editing would replace it, so it stays read-only. */
  protected readonly isEditable = computed(() => this.encounter() !== null && !this.parseError());

  /**
   * What the row shows, each element in its place of the rule's grid (12 columns): the name, then every field the
   * rule shows in the row. A rule written before the grid existed gets places from the model.
   */
  protected readonly rowCells = computed<readonly RowCell[]>(() => {
    const rule = this.rule();
    if (!rule) {
      return [];
    }

    return [
      { id: '$name', field: null, area: rule.nameArea ?? { row: 1, column: 2, span: 3 } },
      ...rule.fields
        .filter((field) => field.showInRow)
        .map((field) => ({
          id: field.key,
          field,
          area: field.area ?? { row: 1, column: 1, span: 1 },
        })),
    ];
  });
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
  /** Rules the encounter can pick (the toolbar's select), and the campaign's own choice for the label. */
  private readonly ruleRows = signal<readonly BattleRuleRowDto[]>([]);
  private readonly campaignRule = signal<string | null>(null);
  /** Entities picked for *Roll initiative* (by id). */
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  /** Notes of the scope an entity can be linked to (the picker's options), by path. */
  private readonly scopeNotes = signal<readonly LinkTargetDto[]>([]);
  /** Frontmatter of the linked notes already read, by note path (rule fields can read from it). */
  protected readonly noteFrontmatter = signal<
    ReadonlyMap<string, Readonly<Record<string, unknown>>>
  >(new Map());
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

    // A rule was edited, created, deleted or chosen (the Battle rules sheet, the section's select): the open
    // encounter follows, with the rule it uses and the list of the toolbar's select.
    let seenRuleChanges = this.battleRuleService.changes();
    effect(() => {
      const changes = this.battleRuleService.changes();
      if (changes !== seenRuleChanges) {
        seenRuleChanges = changes;
        untracked(() => void this.refreshRule());
      }
    });

    effect((onCleanup) => {
      const scope = this.scope();
      if (!scope) {
        return;
      }

      const sectionPath = `${scope.routeBase}/${this.sectionKey()}`;
      const subfolder = this.subfolder();
      const isParty = this.isParty();
      // The roster has a rule of its own too (default: the campaign's), so what the rows show is never a guess.
      const ruleActions: readonly ToolbarItemAction[] = this.ruleToolbarActions(scope.rootPath);
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
          // Only the main and utility actions live here; the battle itself is in the page's own header.
          itemActions: [
            ...ruleActions,
            ...(isParty
              ? []
              : [
                  {
                    id: 'cemetery',
                    label: this.translateService.instant('encounters.cemetery.title'),
                    icon: 'ghost' as const,
                    buttonType: this.isCemeteryOpen() ? ('default' as const) : ('outline' as const),
                    action: () => this.isCemeteryOpen.update((isOpen) => !isOpen),
                  },
                  {
                    id: 'encounter-more',
                    type: 'menu' as const,
                    label: 'common.moreActions',
                    entries: [
                      {
                        id: 'copy',
                        label:
                          scope.kind === 'system'
                            ? 'compendium.copy.toCampaign'
                            : 'compendium.copy.toCompendium',
                        icon: (scope.kind === 'system' ? 'book-down' : 'book-up') as
                          'book-down' | 'book-up',
                        action: () => void this.copyTo.openCopySheet(this.encounterPath()),
                      },
                      {
                        id: 'rename',
                        label: 'campaigns.sections.renameAsset.menu',
                        icon: 'text-cursor-input' as const,
                        action: () => this.openRenameSheet(),
                      },
                      {
                        id: 'delete',
                        label: 'files.delete.menu',
                        icon: 'trash' as const,
                        destructive: true,
                        action: () => this.openDeleteSheet(),
                      },
                    ],
                  },
                ]),
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

  /** Key of the rule's note-link field (null when the rule has none). */
  private readonly noteKey = computed(
    () => this.rule()?.fields.find((field) => field.component === 'note-link')?.key ?? null,
  );

  /** Vault path of the note an entity is linked to. */
  protected noteOf(entity: EncounterEntityDto): string | null {
    const key = this.noteKey();
    return key ? this.textOf(entity, { key }) : null;
  }

  /**
   * Value of a field read from the entity's linked note: the frontmatter key of a `frontmatter:<key>` source.
   * It only fills in what the entity has no value of its own for; nothing is copied into the file.
   */
  private noteValue(entity: EncounterEntityDto, field: { readonly source?: string }): unknown {
    const prefix = 'frontmatter:';
    const notePath = this.noteOf(entity);
    return notePath && field.source?.startsWith(prefix)
      ? this.noteFrontmatter().get(notePath)?.[field.source.slice(prefix.length)]
      : undefined;
  }

  protected numberOf(entity: EncounterEntityDto, field: BattleRuleFieldDto): number | null {
    return toNumber(entity.values[field.key]) ?? toNumber(this.noteValue(entity, field));
  }

  protected textOf(entity: EncounterEntityDto, field: { readonly key: string }): string | null {
    const value = entity.values[field.key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /** Statuses of an entity (`values[<statuses field key>]`); anything that is not a tag with a name is ignored. */
  protected statusesOf(
    entity: EncounterEntityDto,
    field: BattleRuleFieldDto,
  ): readonly StatusValue[] {
    const value = entity.values[field.key];
    return Array.isArray(value)
      ? value.filter(
          (status): status is StatusValue => isRecord(status) && typeof status['name'] === 'string',
        )
      : [];
  }

  protected healthOf(entity: EncounterEntityDto, field: BattleRuleFieldDto): HealthValue {
    const value = entity.values[field.key];
    if (isRecord(value)) {
      return {
        current: toNumber(value['current']) ?? undefined,
        max: toNumber(value['max']) ?? undefined,
        temp: toNumber(value['temp']) ?? undefined,
      };
    }

    // Nothing of its own: a note that gives a number (`hp: 11`) is a full health bar.
    const fromNote = toNumber(this.noteValue(entity, field));
    return fromNote === null ? {} : { current: fromNote, max: fromNote };
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

  /**
   * Once the list has rendered the new turn, brings its row to the middle of the view (the bar is sticky, so the
   * user never has to go looking for it on a long list). No animation for users who asked for less motion.
   */
  private scrollToCurrentTurn(): void {
    afterNextRender(
      () => {
        const row = this.host.nativeElement.querySelector<HTMLElement>('li[aria-current="step"]');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        row?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      },
      { injector: this.injector },
    );
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

    const isNew = entity === null;
    // Fields the user changed by hand: picking a note fills in the others, never those.
    const touched = new Set<string>();
    let isDone = false;
    const dialogRef = this.dialogFormService.open({
      arcTitle: this.translateService.instant(
        entity ? 'encounters.entity.editTitle' : 'encounters.entity.addTitle',
      ),
      arcOkText: this.translateService.instant(
        entity ? 'encounters.entity.save' : 'encounters.entity.addSubmit',
      ),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      // Adding: the quantity decides how many copies; the confirm button says so once it is more than one.
      okTextFor: isNew
        ? (values) => {
            const count = parseNumber(values['quantity']) ?? 1;
            return count > 1
              ? this.translateService.instant('encounters.entity.insertCount', { count })
              : this.translateService.instant('encounters.entity.addSubmit');
          }
        : undefined,
      fields: this.entitySheetFields(rule, entity),
      onFieldChange: (fieldId, value, form) => {
        if (fieldId === this.noteKey()) {
          void this.fillFromNote(rule, String(value ?? ''), form, touched);
        } else {
          touched.add(fieldId);
        }
      },
      onSubmit: (form) => {
        if (!isDone) {
          isDone = true;
          const values = form.getValues();
          const count = isNew ? (parseNumber(values['quantity']) ?? 1) : 1;
          if (count > 1) {
            this.addEntities(rule, values, count);
          } else {
            this.saveEntityForm(entity, rule, values);
          }
          dialogRef.close();
        }

        return false;
      },
    });
  }

  /**
   * Fields of the add / edit sheet: the note first, then the name and the values. Adding asks for the few
   * that matter at the table (initiative, maximum HP, AC) and for a quantity; editing shows every rule field.
   */
  private entitySheetFields(
    rule: BattleRuleDto,
    entity: EncounterEntityDto | null,
  ): AppSheetField[] {
    const isNew = entity === null;
    const fields: AppSheetField[] = [];
    const noteField = rule.fields.find((field) => field.component === 'note-link');
    if (noteField) {
      fields.push(...this.entityFormFields(noteField, entity, isNew));
    }

    fields.push({
      id: 'name',
      type: 'input',
      label: 'encounters.entity.name',
      placeholder: 'encounters.entity.namePlaceholder',
      value: entity?.name ?? '',
      translate: true,
    });

    const addable: Partial<Record<BattleFieldComponent, number>> = {
      initiative: 0,
      healthbar: 1,
      number: 2,
    };
    const valueFields = rule.fields
      .filter((field) => field.component !== 'note-link' && (!isNew || field.component in addable))
      .sort((left, right) =>
        isNew ? (addable[left.component] ?? 0) - (addable[right.component] ?? 0) : 0,
      );
    for (const field of valueFields) {
      fields.push(...this.entityFormFields(field, entity, isNew));
    }

    if (isNew) {
      fields.push({
        id: 'quantity',
        type: 'input',
        inputType: 'number',
        label: 'encounters.entity.quantity',
        description: 'encounters.entity.quantityHint',
        value: '1',
        translate: true,
        validate: (value) => {
          const count = parseNumber(value);
          return count !== null && count >= 1 && count <= ENTITY_QUANTITY_MAX
            ? null
            : this.translateService.instant('encounters.entity.quantityError', {
                max: ENTITY_QUANTITY_MAX,
              });
        },
      });
    }

    return fields;
  }

  /**
   * A note was picked in the sheet: its title becomes the name and its frontmatter fills the fields whose rule
   * source says so (AC, HP…). Only fields the user has not touched are filled, so nothing typed is overwritten.
   */
  private async fillFromNote(
    rule: BattleRuleDto,
    notePath: string,
    form: AppSheetFormComponent,
    touched: ReadonlySet<string>,
  ): Promise<void> {
    if (!notePath) {
      return;
    }

    const fill = (id: string, value: unknown): void => {
      if (!touched.has(id) && value !== null && value !== undefined) {
        form.setValue(id, String(value));
      }
    };
    fill('name', this.scopeNotes().find((note) => note.path === notePath)?.title ?? null);

    let frontmatter: Readonly<Record<string, unknown>>;
    try {
      frontmatter = (await this.documentService.read(notePath)).frontmatter;
    } catch {
      return;
    }

    const prefix = 'frontmatter:';
    for (const field of rule.fields) {
      const value = field.source.startsWith(prefix)
        ? frontmatter[field.source.slice(prefix.length)]
        : undefined;
      if (field.component === 'healthbar') {
        const max = toNumber(value);
        fill(`${field.key}.max`, max);
        fill(`${field.key}.current`, max);
      } else if (field.component === 'initiative' || field.component === 'number') {
        fill(field.key, toNumber(value));
      }
    }
  }

  /**
   * The dice inside the initiative input: rolls the rule's formula for the entity of the form (the variables
   * come from the frontmatter of the note picked in it). Null when the rule types its initiative by hand.
   */
  private initiativeRollAction(field: BattleRuleFieldDto): AppSheetInputAction | undefined {
    const formula = this.rule()?.initiative.roll;
    if (!formula) {
      return undefined;
    }

    return {
      icon: 'dices',
      label: this.translateService.instant('encounters.roll.one'),
      run: async (form) => {
        const notePath = String(form.getValue(this.noteKey() ?? '') ?? '');
        let frontmatter: Readonly<Record<string, unknown>> = {};
        if (notePath) {
          try {
            frontmatter = (await this.documentService.read(notePath)).frontmatter;
          } catch {
            // No note values: the formula only rolls if it needs none.
          }
        }

        const variables: Record<string, number> = {};
        for (const [name, value] of Object.entries(frontmatter)) {
          const integer = this.toInteger(value);
          if (integer !== null) {
            variables[name] = integer;
          }
        }

        try {
          return String(rollDice(formula, variables).total);
        } catch (error) {
          toast.error(this.translateService.instant('encounters.roll.oneFailed'), {
            description: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    };
  }

  private entityFormFields(
    field: BattleRuleFieldDto,
    entity: EncounterEntityDto | null,
    isNew = false,
  ): AppSheetField[] {
    const label = this.translateService.instant(field.label);
    const value = entity?.values[field.key];
    // Adding: initiative, maximum HP and AC share one row; editing has more fields, two to a row.
    const number = (
      id: string,
      text: string,
      current: unknown,
      action?: AppSheetInputAction,
    ): AppSheetField => ({
      id,
      type: 'input',
      inputType: 'number',
      label: text,
      value: toNumber(current)?.toString() ?? '',
      width: isNew ? '1/3' : '1/2',
      ...(action ? { action } : {}),
    });

    switch (field.component) {
      case 'initiative':
        // The dice sits inside the input when the rule rolls the initiative from a formula.
        return [number(field.key, label, value, this.initiativeRollAction(field))];
      case 'number':
        return [number(field.key, label, value)];
      case 'healthbar': {
        const health = isRecord(value) ? value : {};
        return [
          // A new entity starts at its maximum HP, so only the maximum is asked for.
          ...(isNew
            ? []
            : [
                number(
                  `${field.key}.current`,
                  `${label} · ${this.translateService.instant('encounters.hp.current')}`,
                  health['current'],
                ),
              ]),
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
      case 'note-link':
        return [
          {
            id: field.key,
            type: 'combobox',
            label,
            value: typeof value === 'string' ? value : '',
            searchable: true,
            searchPlaceholder: this.translateService.instant('encounters.note.search'),
            emptyText: this.translateService.instant('encounters.note.none'),
            translate: false,
            options: this.scopeNotes().map((note) => ({
              value: note.path,
              label: note.title,
              icon: 'file-text' as const,
            })),
          },
        ];
      case 'text':
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

  /** The name and values an entity gets from the sheet's fields (empty fields are not stored). */
  private readEntityForm(
    entity: EncounterEntityDto | null,
    rule: BattleRuleDto,
    form: Record<string, unknown>,
  ): { readonly name: string | null; readonly values: Record<string, unknown> } {
    const values: Record<string, unknown> = { ...(entity?.values ?? {}) };
    for (const field of rule.fields) {
      switch (field.component) {
        case 'initiative':
        case 'number':
          this.setOrClear(values, field.key, parseNumber(form[field.key]));
          break;
        case 'healthbar': {
          const previous = isRecord(values[field.key]) ? values[field.key] : {};
          const max = parseNumber(form[`${field.key}.max`]) ?? undefined;
          const health = {
            ...(previous as HealthValue),
            // A new entity (no current HP field in the sheet) starts at its maximum.
            current:
              parseNumber(form[`${field.key}.current`]) ??
              (`${field.key}.current` in form ? undefined : max),
            max,
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

    return { name: String(form['name'] ?? '').trim() || null, values };
  }

  private saveEntityForm(
    entity: EncounterEntityDto | null,
    rule: BattleRuleDto,
    form: Record<string, unknown>,
  ): void {
    const { name, values } = this.readEntityForm(entity, rule, form);
    void this.loadFrontmatter([{ id: '', name, values, isDead: false }]);
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

  /**
   * *Add party*: the roster's entities join the battle (also a running one), in initiative order. A member
   * whose name is already in the battle is skipped; one with no name is always added.
   */
  protected async addParty(): Promise<void> {
    const scope = this.scope();
    if (!scope) {
      return;
    }

    try {
      const party = await this.encounterService.party(
        scope.rootPath,
        this.translateService.instant('encounters.party.title'),
      );
      const present = new Set(
        (this.encounter()?.entities ?? []).map((entity) => entity.name?.trim().toLocaleLowerCase()),
      );
      const joining = party.encounter.entities.filter(
        (member) =>
          !member.isDead && !(member.name && present.has(member.name.trim().toLocaleLowerCase())),
      );
      if (joining.length > 0) {
        this.updateEncounter((encounter) => ({
          ...encounter,
          entities: joining.reduce(
            (entities, member) =>
              this.insertByInitiative(entities, {
                ...member,
                id: crypto.randomUUID(),
                values: structuredClone(member.values) as Record<string, unknown>,
              }),
            [...encounter.entities],
          ),
        }));
        void this.loadFrontmatter(joining);
      }

      const skipped =
        party.encounter.entities.filter((member) => !member.isDead).length - joining.length;
      toast.success(
        this.translateService.instant(
          joining.length > 0 ? 'encounters.party.added' : 'encounters.party.nothingToAdd',
          { count: joining.length, skipped },
        ),
      );
    } catch (error) {
      toast.error(this.translateService.instant('encounters.party.error'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** *Insert many*: `count` copies of the entity the sheet describes, numbered after its name ("Goblin 1"…). */
  private addEntities(rule: BattleRuleDto, form: Record<string, unknown>, count: number): void {
    const { name, values } = this.readEntityForm(null, rule, form);
    void this.loadFrontmatter([{ id: '', name, values, isDead: false }]);
    this.updateEncounter((encounter) => {
      let entities: EncounterEntityDto[] = [...encounter.entities];
      for (let index = 0; index < count; index++) {
        entities = this.insertByInitiative(entities, {
          id: crypto.randomUUID(),
          name: this.nextNumberedName(name, entities),
          values: structuredClone(values),
          isDead: false,
        });
      }

      return { ...encounter, entities };
    });
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
    this.scrollToCurrentTurn();
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
    this.scrollToCurrentTurn();
  }

  /** *Stop battle* asks first: it clears initiatives and statuses and refills the HP. */
  protected openStopSheet(): void {
    const dialogRef = this.dialogService.create({
      arcTitle: this.translateService.instant('encounters.battle.stopTitle'),
      arcContent: this.translateService.instant('encounters.battle.stopDescription'),
      arcOkText: this.translateService.instant('encounters.battle.stopConfirm'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      arcOnOk: () => {
        this.stopBattle();
        dialogRef.close();
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
    const hadTurn = this.isRunning() && this.turnId() === entity.id;
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
    if (hadTurn) {
      this.scrollToCurrentTurn();
    }
  }

  /**
   * *Delete permanently*: the entity leaves the encounter for good (asks first). A living one is taken out of the
   * turn order like *Remove*; a dead one just leaves the cemetery.
   */
  protected confirmDeleteEntity(entity: EncounterEntityDto): void {
    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('encounters.delete.title', {
        name: this.entityName(entity.name),
      }),
      arcDescription: this.translateService.instant('encounters.delete.description'),
      arcOkText: this.translateService.instant('encounters.delete.confirm'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => this.deleteEntity(entity),
    });
  }

  private deleteEntity(entity: EncounterEntityDto): void {
    // Passing the turn on is the same as for a removal; then the entity is dropped from the file.
    if (!entity.isDead) {
      this.removeEntity(entity);
    }

    this.updateEncounter((encounter) => ({
      ...encounter,
      entities: encounter.entities.filter((candidate) => candidate.id !== entity.id),
    }));
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      next.delete(entity.id);
      return next;
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

  /** Opens the linked note of an entity in the side panel (the cemetery gives way to it). */
  protected openNote(entity: EncounterEntityDto): void {
    const notePath = this.noteOf(entity);
    if (!notePath) {
      return;
    }

    // The same side sheet as the editor reference: read-only, rendered as in Reading, with a link to open it.
    const title =
      this.scopeNotes().find((note) => note.path === notePath)?.title ??
      notePath.split('/').pop()?.replace(/\.md$/i, '') ??
      notePath;
    // Information only: no footer buttons (the close button is in the header; a link inside opens its note).
    this.sheetService.create<AppEncounterNotePanelComponent, { path: string }>({
      arcTitle: title,
      arcContent: AppEncounterNotePanelComponent,
      arcData: { path: notePath },
      arcSide: 'right',
      arcWidth: 'min(860px, 92vw)',
      arcHideFooter: true,
    });
  }

  /**
   * The status field is typed in place: `name`, space, `rounds`, space makes a tag; a second space right after the
   * name makes it without rounds. Enter and leaving the field make one too; Backspace on an empty field removes the
   * last tag and Escape clears the field.
   */
  protected onStatusKeydown(
    event: KeyboardEvent,
    entity: EncounterEntityDto,
    field: BattleRuleFieldDto,
  ): void {
    const input = event.target as HTMLInputElement;
    if (event.isComposing) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitStatusInput(input, entity, field);
    } else if (event.key === 'Escape') {
      input.value = '';
    } else if (event.key === 'Backspace' && input.value === '') {
      const count = this.statusesOf(entity, field).length;
      if (count > 0) {
        event.preventDefault();
        this.removeStatus(entity, field, count - 1);
      }
    } else if (event.key === ' ') {
      const [name, rounds] = input.value.trim().split(/\s+/);
      event.preventDefault();
      if (!name) {
        return;
      }

      if (rounds === undefined && !input.value.endsWith(' ')) {
        input.value = `${name} `; // the number of rounds comes next; another space means none
      } else if (rounds !== undefined && !/^\d+$/.test(rounds)) {
        this.commitStatusInput(input, entity, field, name);
        input.value = rounds;
      } else {
        this.commitStatusInput(input, entity, field);
      }
    }
  }

  /** Turns the text of the status field (`name` or `name rounds`) into a tag, then empties the field. */
  protected commitStatusInput(
    input: HTMLInputElement,
    entity: EncounterEntityDto,
    field: BattleRuleFieldDto,
    text = input.value,
  ): void {
    const [name, rounds] = text.trim().split(/\s+/);
    input.value = '';
    if (!name) {
      return;
    }

    const count = rounds !== undefined && /^\d+$/.test(rounds) ? Number(rounds) : 0;
    this.setStatuses(entity.id, field.key, (statuses) => [
      ...statuses,
      { name, ...(count > 0 ? { rounds: count } : {}) },
    ]);
  }

  protected removeStatus(
    entity: EncounterEntityDto,
    field: BattleRuleFieldDto,
    index: number,
  ): void {
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
    const dialogRef = this.dialogFormService.open({
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
          dialogRef.close();
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

    this.updateEntity(entityId, (candidate) => {
      const values = { ...candidate.values };
      this.setOrClear(values, key, Object.keys(next).length > 0 ? next : null);
      return { ...candidate, values };
    });
  }

  // --- Loading and saving ------------------------------------------------------------------------------

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const scope = this.scope();
      const [file, rule] = await Promise.all([
        this.isParty() && scope
          ? this.encounterService.party(scope.rootPath, this.title())
          : this.encounterService.read(path),
        this.encounterService.rule(path),
      ]);
      if (token === this.loadToken) {
        this.file.set(file);
        this.encounter.set(file.encounter);
        this.rule.set(rule);
        this.selectedIds.set(new Set());
        void this.loadNotes(path, file.encounter);
        void this.loadRuleChoices();
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

  /**
   * The notes of the scope (for the picker) and the frontmatter of the notes the entities link to (rule fields
   * with a `frontmatter:` source read it). A note that cannot be read just has no values.
   */
  private async loadNotes(path: string, encounter: EncounterDto): Promise<void> {
    try {
      const targets = await this.documentService.linkTargets(path);
      this.scopeNotes.set(targets.filter((target) => target.kind === 'md'));
    } catch (error) {
      console.warn('[app] Failed to list the notes of the scope:', path, error);
    }

    await this.loadFrontmatter(encounter.entities);
  }

  private async loadFrontmatter(entities: readonly EncounterEntityDto[]): Promise<void> {
    const noteKey = this.noteKey();
    const known = this.noteFrontmatter();
    const paths = new Set(
      entities
        .map((entity) => (noteKey ? this.textOf(entity, { key: noteKey }) : null))
        .filter((notePath): notePath is string => !!notePath && !known.has(notePath)),
    );
    if (paths.size === 0) {
      return;
    }

    const loaded = await Promise.all(
      [...paths].map(async (notePath) => {
        try {
          return [notePath, (await this.documentService.read(notePath)).frontmatter] as const;
        } catch {
          return [notePath, {}] as const;
        }
      }),
    );
    this.noteFrontmatter.update((map) => new Map([...map, ...loaded]));
  }

  // --- Battle rule -------------------------------------------------------------------------------------

  /** Rules the select offers, and the campaign's current choice (for the first option's label). */
  /** Reads the rule again (its file may have changed) and the choices of the toolbar's select. */
  private async refreshRule(): Promise<void> {
    const path = this.encounterPath();
    if (!this.encounter()) {
      return;
    }

    try {
      const rule = await this.encounterService.rule(path, this.encounter()?.rule ?? null);
      if (path === this.encounterPath()) {
        this.rule.set(rule);
      }
    } catch (error) {
      console.warn('[app] Failed to refresh the battle rule:', error);
    }

    await this.loadRuleChoices();
  }

  private async loadRuleChoices(): Promise<void> {
    const scope = this.scope();
    try {
      const library = await this.battleRuleService.list();
      this.ruleRows.set(library.rows);
      this.campaignRule.set(
        scope?.kind === 'campaign' ? await this.battleRuleService.getChoice(scope.rootPath) : null,
      );
    } catch (error) {
      console.warn('[app] Failed to list the battle rules:', error);
    }
  }

  /** The toolbar's *Battle rule* select: this encounter's own rule, or the campaign's. */
  private ruleToolbarActions(campaign: string): readonly ToolbarItemAction[] {
    const current = this.encounter()?.rule ?? null;
    const campaignRule = this.campaignRule();
    const campaignLabel =
      campaignRule === null || campaignRule === BUILT_IN_BATTLE_RULE
        ? this.translateService.instant('encounters.rule.builtInDefault')
        : (this.ruleRows().find((row) => row.path === campaignRule)?.name ??
          this.translateService.instant('encounters.rule.campaignDefault'));
    return [
      {
        id: 'encounter-rule',
        type: 'select',
        label: 'encounters.rule.label',
        ariaLabel: this.translateService.instant('encounters.rule.ariaLabel'),
        class: 'w-56',
        disabled: !this.isEditable(),
        value: () => current ?? DEFAULT_BATTLE_RULE_CHOICE,
        options: this.battleRuleService.getOptions(
          this.ruleRows(),
          campaign,
          current,
          campaignLabel,
        ),
        change: (value) => this.setRuleChoice(value),
      },
    ];
  }

  /** Picks the rule of this encounter (`default`: the campaign's); the rows follow the new rule right away. */
  private async setRuleChoice(value: string): Promise<void> {
    const encounter = this.encounter();
    const choice = value === DEFAULT_BATTLE_RULE_CHOICE ? null : value;
    if (!encounter || choice === encounter.rule) {
      return;
    }

    try {
      this.rule.set(await this.encounterService.rule(this.encounterPath(), choice));
      this.updateEncounter((current) => ({ ...current, rule: choice }));
      this.selectedIds.set(new Set());
    } catch (error) {
      toast.error(this.translateService.instant('encounters.rule.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --- Roll initiative ---------------------------------------------------------------------------------

  /**
   * The rule rolls its initiative (a dice formula); without one it is typed by hand. The roll controls (bar buttons
   * and row checkboxes) are for setting up the order, so they go away while the battle runs.
   */
  protected readonly canRoll = computed(
    () =>
      !this.isParty() && this.isEditable() && !this.isRunning() && !!this.rule()?.initiative.roll,
  );
  protected readonly selectedCount = computed(
    () => this.entities().filter((entity) => this.selectedIds().has(entity.id)).length,
  );

  protected toggleSelected(entity: EncounterEntityDto): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(entity.id)) {
        next.add(entity.id);
      }
      return next;
    });
  }

  protected selectAll(): void {
    this.selectedIds.set(new Set(this.entities().map((entity) => entity.id)));
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  /** Whole number of a frontmatter value (`14`, or `"14"` written as text); null for anything else. */
  private toInteger(value: unknown): number | null {
    const number =
      typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
    return typeof number === 'number' && Number.isInteger(number) ? number : null;
  }

  /**
   * *Roll initiative* for the selected entities: the rule's formula, with `{key}` taken from the integer of that
   * frontmatter key of the entity's note (a negative one subtracts). An entity the formula cannot be rolled for
   * (no note, no such key, not a whole number) has its initiative erased instead. The list is sorted after.
   */
  protected async rollInitiative(): Promise<void> {
    const formula = this.rule()?.initiative.roll;
    const key = this.initiativeKey();
    const encounter = this.encounter();
    if (!formula || !key || !encounter) {
      return;
    }

    const targets = this.entities().filter((entity) => this.selectedIds().has(entity.id));
    if (targets.length === 0) {
      toast.info(this.translateService.instant('encounters.roll.none'));
      return;
    }

    await this.loadFrontmatter(targets);
    const results = new Map<string, number | null>();
    const reasons = new Set<string>();
    for (const entity of targets) {
      const notePath = this.noteOf(entity);
      const frontmatter = notePath ? this.noteFrontmatter().get(notePath) : undefined;
      const variables: Record<string, number> = {};
      for (const [name, value] of Object.entries(frontmatter ?? {})) {
        const integer = this.toInteger(value);
        if (integer !== null) {
          variables[name] = integer;
        }
      }

      try {
        results.set(entity.id, rollDice(formula, variables).total);
      } catch (error) {
        results.set(entity.id, null);
        reasons.add(error instanceof Error ? error.message : String(error));
      }
    }

    this.updateEncounter((current) => ({
      ...current,
      entities: this.sortByInitiative(
        current.entities.map((entity) => {
          if (!results.has(entity.id)) {
            return entity;
          }

          const values = { ...entity.values };
          this.setOrClear(values, key, results.get(entity.id));
          return { ...entity, values };
        }),
      ),
    }));

    const failed = [...results.values()].filter((total) => total === null).length;
    toast.success(
      this.translateService.instant('encounters.roll.done', { count: results.size - failed }),
    );
    if (failed > 0) {
      toast.warning(
        this.translateService.instant('encounters.roll.failed', {
          count: failed,
          reason: [...reasons].join('; '),
        }),
      );
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
    const dialogRef = this.dialogService.create({
      arcTitle: this.translateService.instant('encounters.conflict.title'),
      arcContent: this.translateService.instant('encounters.conflict.description'),
      arcOkText: this.translateService.instant('encounters.conflict.keepMine'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('encounters.conflict.reload'),
      arcOnOk: () => {
        // Overwrite: the next save is checked against the other version.
        this.file.set(current);
        void this.save();
        dialogRef.close();
        return false;
      },
      arcOnCancel: () => {
        this.file.set(current);
        this.encounter.set(current.encounter);
      },
    });
  }

  // --- File actions ------------------------------------------------------------------------------------

  /** *Rename*: links follow; the page (and its tab, in a campaign) moves to the new file name. */
  private openRenameSheet(): void {
    const oldPath = this.encounterPath();
    void this.fileActions.openRenameAssetSheet(
      { path: oldPath, name: this.fileName(), label: this.title() },
      (newPath) => void this.followRename(oldPath, newPath),
    );
  }

  /** *Delete…* (to the system Trash); the page, and its tab in a campaign, go to the folder page. */
  private openDeleteSheet(): void {
    void this.fileActions.openDeleteSheet(
      { path: this.encounterPath(), label: this.title(), isNote: false },
      (folderRoute) => {
        if (folderRoute && this.scope()?.kind === 'system') {
          void this.router.navigateByUrl(folderRoute, { replaceUrl: true });
        }
      },
    );
  }

  /**
   * The file was renamed: the encounter's `name` (what the page, the tab and the lists show) follows the new file
   * name, written to the file at its new place; campaign tabs and system pages then move to the new route.
   */
  private async followRename(oldPath: string, newPath: string): Promise<void> {
    const oldRoute = toInAppEncounterRoute(oldPath);
    const newRoute = toInAppEncounterRoute(newPath);
    if (!oldRoute || !newRoute || oldRoute === newRoute) {
      return;
    }

    const newName = newPath.split('/').pop()?.replace(ENCOUNTER_EXTENSION_PATTERN, '') ?? '';
    try {
      const file = await this.encounterService.read(newPath);
      if (!file.parseError && newName && file.encounter.name !== newName) {
        await this.encounterService.write({
          path: newPath,
          encounter: { ...file.encounter, name: newName },
          expectedHash: file.contentHash,
        });
      }
    } catch (error) {
      console.warn('[app] Failed to rename the encounter inside its file:', newPath, error);
    }

    // A campaign tab already moved to the new route (and loaded the file as it was): show the new name.
    if (this.encounterPath() === newPath) {
      await this.load(newPath);
    }

    // Campaign tabs follow the rename on their own (FileActionsService); a system page navigates itself.
    if (this.scope()?.kind === 'system') {
      await this.router.navigateByUrl(newRoute, { replaceUrl: true });
    }
  }
}
