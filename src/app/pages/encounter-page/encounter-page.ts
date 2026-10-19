import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

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
import { ToolbarContextService } from '@/services/toolbar-context.service';
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
    TranslatePipe,
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
  /** Entities still in the battle, by initiative (highest first); those without one stay last in file order. */
  protected readonly entities = computed(() => {
    const initiativeKey = this.rule()?.fields.find((field) => field.component === 'initiative')?.key;
    const entities = (this.encounter()?.entities ?? []).filter((entity) => !entity.isDead);
    const initiativeOf = (entity: EncounterEntityDto): number =>
      (initiativeKey ? toNumber(entity.values[initiativeKey]) : null) ?? Number.NEGATIVE_INFINITY;
    return [...entities].sort((left, right) => initiativeOf(right) - initiativeOf(left));
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
            {
              id: 'add-entity',
              label: this.translateService.instant('encounters.entity.add'),
              icon: 'plus',
              iconOnly: true,
              disabled: !isEditable,
              action: () => this.openEntitySheet(null),
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
          number(`${field.key}.current`, `${label} · ${this.translateService.instant('encounters.hp.current')}`, health['current']),
          number(`${field.key}.max`, `${label} · ${this.translateService.instant('encounters.hp.max')}`, health['max']),
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
      this.updateEntity(entity.id, (current) => ({ ...current, name, values }));
    } else {
      this.updateEncounter((encounter) => ({
        ...encounter,
        entities: [
          ...encounter.entities,
          { id: crypto.randomUUID(), name, values, isDead: false },
        ],
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
      next = { ...previous, current: max === undefined ? base + amount : Math.min(base + amount, max) };
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
