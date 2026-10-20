import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import {
  AppSecondarySidebarComponent,
  type SecondarySidebarItem,
} from '@/components/secondary-sidebar/secondary-sidebar.component';
import { AppSheetFormService } from '@/components/sheet-form/sheet-form.service';
import type {
  BattleFieldComponent,
  BattleRuleDto,
  BattleRuleFieldDto,
  BattleRuleRowDto,
} from '@/dtos';
import { BattleRuleService } from '@/services/battle-rule.service';
import { TemplateService } from '@/services/template.service';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechCheckboxComponent } from '@/shared/components/checkbox';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechInputDirective } from '@/shared/components/input';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';
import { getDiceFormulaError } from '@/shared/utils/dice';

const BUILT_IN_KEY = 'builtin';
const GROUP_KEY_PREFIX = 'group:';
const BUILT_IN_REF_PREFIX = 'builtin:';
const FRONTMATTER_PREFIX = 'frontmatter:';
/** Source value of a field that holds its own value (not read from a note). */
const ENTITY_SOURCE = 'entity';
const SOURCE_ICONS: Record<BattleRuleRowDto['source'], ArcTechIcon> = {
  vault: 'vault',
  system: 'library-big',
  campaign: 'scroll-text',
};
/** Field types a rule can add: the initiative is always there already, once. */
const ADDABLE_COMPONENTS: readonly BattleFieldComponent[] = [
  'number',
  'text',
  'healthbar',
  'side',
  'statuses',
  'note-link',
];
/** Types whose value can come from a frontmatter key of the linked note (a number or a text). */
const NOTE_READABLE_COMPONENTS: readonly BattleFieldComponent[] = [
  'initiative',
  'number',
  'text',
  'healthbar',
];
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

interface SelectedRule {
  /** Rule path, or `builtin` for the read-only built-in. */
  readonly key: string;
  readonly contentHash: string | null;
}

/**
 * The Battle rules sheet: every rule of the vault (the built-in, the vault's `_battle-rules/`, each system's and
 * each campaign's) in the shared secondary sidebar, with a form editor. A rule says which fields an entity row
 * has, where each value comes from (the entity or its note's frontmatter, whose keys come from a template) and
 * how the initiative is made: typed, or rolled from a dice formula. The JSON file is what is stored and used.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-battle-rule-library-page',
  imports: [
    TranslatePipe,
    AppSecondarySidebarComponent,
    ArcTechButtonComponent,
    ArcTechCheckboxComponent,
    ArcTechIconComponent,
    ArcTechInputDirective,
    ...ArcTechSelectImports,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './battle-rule-library-page.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
})
export class BattleRuleLibraryPage implements OnInit {
  private readonly battleRuleService = inject(BattleRuleService);
  private readonly templateService = inject(TemplateService);
  private readonly sheetFormService = inject(AppSheetFormService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly translateService = inject(TranslateService);

  protected readonly rows = signal<readonly BattleRuleRowDto[]>([]);
  protected readonly builtIn = signal<BattleRuleDto | null>(null);
  protected readonly selected = signal<SelectedRule | null>(null);
  /** The rule being edited (a copy of the file; the built-in is read-only). */
  protected readonly rule = signal<BattleRuleDto | null>(null);
  private readonly savedRule = signal<BattleRuleDto | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** Templates the rule can name, and the frontmatter keys of the one it names. */
  protected readonly templateOptions = signal<readonly { value: string; label: string }[]>([]);
  protected readonly attributeKeys = signal<readonly string[]>([]);

  protected readonly isBuiltIn = computed(() => this.selected()?.key === BUILT_IN_KEY);
  protected readonly isDirty = computed(
    () =>
      !this.isBuiltIn() &&
      this.rule() !== null &&
      JSON.stringify(this.rule()) !== JSON.stringify(this.savedRule()),
  );
  protected readonly selectedRow = computed(
    () => this.rows().find((row) => row.path === this.selected()?.key) ?? null,
  );
  protected readonly addableComponents = ADDABLE_COMPONENTS;

  /** Why the initiative formula cannot be rolled (null when it can, or when the initiative is typed). */
  protected readonly formulaError = computed(() => {
    const formula = this.rule()?.initiative.roll;
    if (!formula) {
      return null;
    }

    // Variables are checked with a stand-in value: here only the shape of the formula matters.
    const variables = Object.fromEntries(this.attributeKeys().map((key) => [key, 0]));
    const error = getDiceFormulaError(formula, variables);
    const missing = /^No whole number for \{(.+)\}$/.exec(error ?? '');
    return missing
      ? this.translateService.instant('battleRules.editor.unknownVariable', { key: missing[1] })
      : error;
  });
  protected readonly canSave = computed(
    () => this.isDirty() && !this.isSaving() && this.formulaError() === null,
  );

  protected readonly libraryItems = computed<readonly SecondarySidebarItem[]>(() => {
    const builtIn: SecondarySidebarItem = {
      key: `${GROUP_KEY_PREFIX}builtin`,
      label: 'settings.templates.sources.builtin',
      icon: 'lock',
      children: [
        {
          key: BUILT_IN_KEY,
          label: this.builtIn()?.name ?? 'Generic',
          translate: false,
        },
      ],
    };

    const groups = new Map<
      string,
      { label: string; translate: boolean; icon: ArcTechIcon; rows: BattleRuleRowDto[] }
    >();
    for (const row of this.rows()) {
      const groupKey = row.scope ?? 'vault';
      const group = groups.get(groupKey) ?? {
        label: row.scopeName ?? 'settings.templates.sources.vault',
        translate: row.scopeName === null,
        icon: SOURCE_ICONS[row.source],
        rows: [],
      };
      group.rows.push(row);
      groups.set(groupKey, group);
    }

    return [
      builtIn,
      ...[...groups.entries()].map(([groupKey, group]) => ({
        key: `${GROUP_KEY_PREFIX}${groupKey}`,
        label: group.label,
        translate: group.translate,
        icon: group.icon,
        children: group.rows.map((row) => ({
          key: row.path,
          label: row.name,
          translate: false,
          description: row.path,
        })),
      })),
    ];
  });

  constructor() {
    // Leaving the sheet saves pending edits, like leaving a note.
    inject(DestroyRef).onDestroy(() => void this.save());
  }

  ngOnInit(): void {
    void this.load();
    void this.loadTemplates();
  }

  /** The frontmatter keys a field can read, as select choices (plus the field's own current source). */
  protected sourceOptions(field: BattleRuleFieldDto): readonly { value: string; label: string }[] {
    const keys = this.attributeKeys();
    const current = field.source.startsWith(FRONTMATTER_PREFIX)
      ? field.source.slice(FRONTMATTER_PREFIX.length)
      : null;
    const shown = current && !keys.includes(current) ? [...keys, current] : keys;
    return [
      {
        value: ENTITY_SOURCE,
        label: this.translateService.instant('battleRules.editor.sourceEntity'),
      },
      ...shown.map((key) => ({
        value: `${FRONTMATTER_PREFIX}${key}`,
        label: this.translateService.instant('battleRules.editor.sourceNote', { key }),
      })),
    ];
  }

  protected canReadFromNote(field: BattleRuleFieldDto): boolean {
    return NOTE_READABLE_COMPONENTS.includes(field.component);
  }

  protected componentLabel(component: BattleFieldComponent): string {
    return this.translateService.instant(`battleRules.components.${component}`);
  }

  protected async onLibrarySelected(item: SecondarySidebarItem): Promise<void> {
    if (item.key === this.selected()?.key || item.key.startsWith(GROUP_KEY_PREFIX)) {
      return;
    }

    if (this.isDirty() && !(await this.save())) {
      return;
    }

    await this.select(item.key);
  }

  // --- Editing the rule --------------------------------------------------------------------------------

  private update(change: (rule: BattleRuleDto) => BattleRuleDto): void {
    const rule = this.rule();
    if (rule && !this.isBuiltIn()) {
      this.rule.set(change(rule));
    }
  }

  protected setName(name: string): void {
    this.update((rule) => ({ ...rule, name }));
  }

  protected async setTemplate(template: string): Promise<void> {
    this.update((rule) => ({ ...rule, template: template || null }));
    await this.loadAttributes(template || null);
  }

  /** The initiative is typed by hand (no formula) or rolled from one. */
  protected setRolled(isRolled: boolean): void {
    this.update((rule) => ({ ...rule, initiative: { roll: isRolled ? '1d20' : null } }));
  }

  protected setFormula(roll: string): void {
    this.update((rule) => ({ ...rule, initiative: { roll } }));
  }

  /** Adds `{key}` to the formula: the integer of that frontmatter key (a negative one subtracts). */
  protected addVariable(key: string): void {
    const roll = this.rule()?.initiative.roll ?? '';
    this.setFormula(`${roll.trimEnd()} + {${key}}`.trim());
  }

  protected updateField(index: number, change: Partial<BattleRuleFieldDto>): void {
    this.update((rule) => ({
      ...rule,
      fields: rule.fields.map((field, i) => (i === index ? { ...field, ...change } : field)),
    }));
  }

  protected setFieldKey(index: number, key: string): void {
    const clean = key.trim().toLocaleLowerCase();
    const isTaken = this.rule()?.fields.some((field, i) => i !== index && field.key === clean);
    if (FIELD_KEY_PATTERN.test(clean) && !isTaken) {
      this.updateField(index, { key: clean });
    }
  }

  protected setSides(index: number, text: string): void {
    const options = text
      .split(',')
      .map((option) => option.trim())
      .filter(Boolean);
    this.updateField(index, { options });
  }

  protected moveField(index: number, offset: -1 | 1): void {
    this.update((rule) => {
      const target = index + offset;
      if (target < 0 || target >= rule.fields.length) {
        return rule;
      }

      const fields = [...rule.fields];
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...rule, fields };
    });
  }

  /** The initiative is part of every rule (with the name): it cannot be removed. */
  protected isRequired(field: BattleRuleFieldDto): boolean {
    return field.component === 'initiative';
  }

  protected removeField(index: number): void {
    this.update((rule) => ({
      ...rule,
      fields: rule.fields.filter((field, i) => i !== index || this.isRequired(field)),
    }));
  }

  protected addField(component: BattleFieldComponent): void {
    this.update((rule) => {
      const base = component.replace('-', '_');
      const taken = new Set(rule.fields.map((field) => field.key));
      let key = base;
      for (let index = 2; taken.has(key); index++) {
        key = `${base}_${index}`;
      }

      return {
        ...rule,
        fields: [
          ...rule.fields,
          {
            key,
            component,
            label: key,
            source: ENTITY_SOURCE,
            showInRow: true,
            ...(component === 'side' ? { options: ['enemy', 'player', 'ally'] } : {}),
          },
        ],
      };
    });
  }

  // --- Library -----------------------------------------------------------------------------------------

  protected openCreateSheet(): void {
    let isSubmitting = false;
    const sheetRef = this.sheetFormService.open({
      arcTitle: this.translateService.instant('battleRules.create.title'),
      arcDescription: this.translateService.instant('battleRules.create.description'),
      arcOkText: this.translateService.instant('battleRules.create.submit'),
      arcCancelText: this.translateService.instant('settings.templates.create.cancel'),
      fields: [
        {
          id: 'name',
          type: 'input',
          label: 'battleRules.create.nameLabel',
          placeholder: 'battleRules.create.namePlaceholder',
          required: true,
          translate: true,
        },
      ],
      onSubmit: (form) => {
        if (!isSubmitting) {
          isSubmitting = true;
          void this.create(String(form.getValues()['name'] ?? '')).then((isDone) => {
            isSubmitting = false;
            if (isDone) {
              sheetRef.close();
            }
          });
        }

        return false;
      },
    });
  }

  /** Copies the built-in into `_battle-rules/` so it can be edited, and opens the copy. */
  protected async customize(): Promise<void> {
    await this.create(`${this.builtIn()?.name ?? 'Generic'} copy`);
  }

  protected confirmDelete(): void {
    const row = this.selectedRow();
    if (!row) {
      return;
    }

    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('battleRules.delete.title', { name: row.name }),
      arcDescription: this.translateService.instant('battleRules.delete.description', {
        path: row.path,
      }),
      arcOkText: this.translateService.instant('settings.templates.delete.confirm'),
      arcCancelText: this.translateService.instant('settings.templates.delete.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => {
        void this.remove(row);
      },
    });
  }

  protected async save(): Promise<boolean> {
    const selected = this.selected();
    const rule = this.rule();
    if (!selected || !rule || this.isBuiltIn() || this.isSaving()) {
      return false;
    }

    if (!this.isDirty()) {
      return true;
    }

    if (this.formulaError() !== null) {
      toast.error(this.translateService.instant('battleRules.editor.formulaInvalid'));
      return false;
    }

    this.isSaving.set(true);
    try {
      const result = await this.battleRuleService.write(selected.key, rule, selected.contentHash);
      if (result.status === 'conflict') {
        toast.error(this.translateService.instant('battleRules.editor.conflict'), {
          action: {
            label: this.translateService.instant('settings.templates.editor.reload'),
            onClick: () => void this.select(selected.key),
          },
        });
        return false;
      }

      this.selected.set({ ...selected, contentHash: result.contentHash });
      this.savedRule.set(rule);
      void this.load();
      toast.success(this.translateService.instant('battleRules.editor.saved'));
      return true;
    } catch (error) {
      this.showError('battleRules.editor.saveError', error);
      return false;
    } finally {
      this.isSaving.set(false);
    }
  }

  private async create(name: string): Promise<boolean> {
    try {
      const path = await this.battleRuleService.create(name);
      await this.load();
      await this.select(path);
      return true;
    } catch (error) {
      this.showError('battleRules.createError', error);
      return false;
    }
  }

  private async remove(row: BattleRuleRowDto): Promise<void> {
    try {
      await this.battleRuleService.remove(row.path);
      this.selected.set(null);
      this.rule.set(null);
      await this.load();
      toast.success(this.translateService.instant('battleRules.delete.done', { name: row.name }));
    } catch (error) {
      this.showError('battleRules.delete.error', error);
    }
  }

  private async select(key: string): Promise<void> {
    try {
      let rule: BattleRuleDto;
      let contentHash: string | null = null;
      if (key === BUILT_IN_KEY) {
        rule = this.builtIn() ?? (await this.battleRuleService.list()).builtIn;
      } else {
        const file = await this.battleRuleService.read(key);
        rule = file.rule;
        contentHash = file.contentHash;
      }

      this.rule.set(rule);
      this.savedRule.set(rule);
      this.selected.set({ key, contentHash });
      await this.loadAttributes(rule.template);
    } catch (error) {
      this.showError('battleRules.loadError', error);
    }
  }

  private async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const library = await this.battleRuleService.list();
      this.rows.set(library.rows);
      this.builtIn.set(library.builtIn);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : String(error));
    }
  }

  /** Templates a rule can name: the built-in ones of the note types, and the vault's, systems' and campaigns'. */
  private async loadTemplates(): Promise<void> {
    try {
      const library = await this.templateService.list();
      this.templateOptions.set([
        { value: '', label: this.translateService.instant('battleRules.editor.noTemplate') },
        ...library.types.map((type) => ({
          value: `${BUILT_IN_REF_PREFIX}${type}`,
          label: this.translateService.instant('battleRules.editor.builtInTemplate', { type }),
        })),
        ...library.rows.map((template) => ({
          value: template.path,
          label: this.templateService.getTemplateLabel(template),
        })),
      ]);
    } catch (error) {
      console.warn('[app] Failed to list the templates for the battle rules:', error);
    }
  }

  private async loadAttributes(template: string | null): Promise<void> {
    if (!template) {
      this.attributeKeys.set([]);
      return;
    }

    try {
      this.attributeKeys.set(await this.battleRuleService.attributes(template));
    } catch (error) {
      this.attributeKeys.set([]);
      console.warn('[app] Failed to read the template keys:', template, error);
    }
  }

  private showError(key: string, error: unknown): void {
    toast.error(this.translateService.instant(key), {
      description: error instanceof Error ? error.message : String(error),
    });
  }
}
