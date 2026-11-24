import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toast } from 'ngx-sonner';

import { renderMarkdownToSafeHtml } from '@/components/document-preview/document-preview.markdown';
import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type {
  AppSheetField,
  AppSheetFieldValueMap,
} from '@/components/sheet-form/sheet-form.types';
import type { QuickReferenceRuleDto } from '@/dtos';
import { CampaignService } from '@/services/campaign.service';
import {
  QuickReferenceService,
  UNCATEGORISED_ID,
  type QuickReferenceGroup,
} from '@/services/quick-reference.service';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ARCTECH_ICONS, ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechSelectImports } from '@/shared/components/select';

/** Icons a rule can have: the same list the Electron side lets through (`QUICK_REFERENCE_ICONS`). */
/** Icon names as text (the registry's own type also allows raw icon data, which a file cannot hold). */
type RuleIconName = Extract<keyof typeof ARCTECH_ICONS, string>;
const RULE_ICONS: readonly RuleIconName[] = [
  'book-open',
  'footprints',
  'swords',
  'shield',
  'skull',
  'lock',
  'eye',
  'eye-off',
  'hand',
  'ghost',
  'mountain',
  'anchor',
  'brain',
  'heart',
  'moon',
  'sun',
  'sparkles',
  'clock',
  'info',
  'users',
  'dices',
  'star',
  'cloud',
  'link',
  'arrow-right',
  'arrow-down',
  'triangle-alert',
  'ban',
  'lightbulb',
  'volume-x',
];
const DEFAULT_RULE_ICON: RuleIconName = 'book-open';
const SYSTEMS_WITH_RULES = ['dnd5e'] as const;

/**
 * The Quick reference sheet of the campaign under it: rules as cards by category, a search, the rule read in
 * full beside them, and dialogs to add, edit and delete rules and categories at any time (there is no edit mode).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quick-reference-page',
  imports: [
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ...ArcTechMenuImports,
    ...ArcTechSelectImports,
  ],
  templateUrl: './quick-reference-page.html',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
})
export class QuickReferencePage {
  protected readonly service = inject(QuickReferenceService);
  private readonly campaigns = inject(CampaignService);
  private readonly dialogForm = inject(AppDialogFormService);
  private readonly alertDialog = inject(ArcTechAlertDialogService);
  private readonly translate = inject(TranslateService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly systemsWithRules = SYSTEMS_WITH_RULES;
  protected readonly uncategorisedId = UNCATEGORISED_ID;
  /** Value of the *All* option of the category select (a real category id never looks like this). */
  protected readonly allValue = '__all';

  protected readonly campaign = this.campaigns.activeCampaign;
  protected readonly systemLabel = computed(() => {
    const system = this.service.data()?.system ?? this.campaign()?.system ?? 'generic';
    return this.systemName(system);
  });
  /** The category select's options: every category with how many rules it holds. */
  protected readonly chips = computed(() =>
    this.service.groups().map((group) => ({
      id: group.id,
      label: `${group.name} (${group.rules.length})`,
    })),
  );
  protected readonly allLabel = computed(
    () => `${this.translate.instant('quickReference.all')} (${this.service.rules().length})`,
  );
  protected readonly selected = this.service.selected;
  /** The selected rule's long text as safe HTML (the notes' own renderer: no raw HTML, no remote images). */
  protected readonly selectedHtml = computed(() => {
    const rule = this.service.selected();
    return rule
      ? this.sanitizer.bypassSecurityTrustHtml(
          renderMarkdownToSafeHtml(rule.full, { links: [], sourcePath: '' }),
        )
      : null;
  });
  protected readonly selectedCategories = computed(() => {
    const rule = this.service.selected();
    if (!rule) {
      return [];
    }

    const names = new Map(
      this.service.categories().map((category) => [category.id, category.name]),
    );
    return rule.categories.map((id) => names.get(id)).filter((name): name is string => !!name);
  });
  /** A built-in rule can go back to its words; the user's own cannot. */
  protected readonly resetSystem = computed(() => {
    const source = this.service.selected()?.source;
    return source ? this.systemName(source.split('/')[0]) : null;
  });
  protected readonly warningText = computed(() => {
    const codes = this.service.warnings().map((warning) => warning.code);
    if (codes.length === 0) {
      return null;
    }

    return this.translate.instant(
      codes.includes('parse-error')
        ? 'quickReference.warnings.unreadable'
        : 'quickReference.warnings.cleaned',
    );
  });

  constructor() {
    // Opens (and seeds) the file of the campaign the sheet sits on, again when the campaign changes.
    effect(() => {
      const slug = this.campaign()?.slug;
      if (slug) {
        untracked(() => void this.service.open(slug));
      }
    });
  }

  /** `/` focuses the search unless a field already has the keyboard. */
  @HostListener('document:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
      return;
    }

    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }

  protected onSearch(event: Event): void {
    this.service.setQuery((event.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.service.setQuery('');
    this.searchInput()?.nativeElement.focus();
  }

  protected onCategoryChange(value: string): void {
    this.service.setCategory(value === this.allValue ? null : value);
  }

  protected isSelected(rule: QuickReferenceRuleDto): boolean {
    return this.service.selectedId() === rule.id;
  }

  protected iconOf(rule: QuickReferenceRuleDto): RuleIconName {
    const icon = RULE_ICONS.find((name) => name === rule.icon);
    return icon ?? DEFAULT_RULE_ICON;
  }

  /** Arrow keys move between the cards of the grid, in reading order. */
  protected onCardKeydown(event: KeyboardEvent): void {
    const move = (
      { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>
    )[event.key];
    if (!move) {
      return;
    }

    const current = event.currentTarget as HTMLElement;
    const cards = Array.from(
      current.closest('[data-quick-list]')?.querySelectorAll<HTMLElement>('[data-rule-card]') ?? [],
    );
    const next = cards[cards.indexOf(current) + move];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  protected systemName(system: string): string {
    return this.translate.instant(`settings.templates.systems.${system}`);
  }

  // --- dialogs ---

  protected openRuleDialog(rule: QuickReferenceRuleDto | null, presetCategory?: string): void {
    const categories =
      rule?.categories ??
      (presetCategory && presetCategory !== UNCATEGORISED_ID ? [presetCategory] : []);
    const fields: AppSheetField[] = [
      {
        id: 'title',
        type: 'input',
        label: 'quickReference.rule.title',
        placeholder: 'quickReference.rule.titlePlaceholder',
        required: true,
        translate: true,
      },
      {
        id: 'short',
        type: 'input',
        label: 'quickReference.rule.short',
        description: this.translate.instant('quickReference.rule.shortHint'),
        translate: true,
      },
      {
        id: 'full',
        type: 'input',
        multiline: true,
        label: 'quickReference.rule.full',
        description: this.translate.instant('quickReference.rule.fullHint'),
        translate: true,
      },
      {
        id: 'icon',
        type: 'select',
        label: 'quickReference.rule.icon',
        translate: true,
        options: RULE_ICONS.map((icon) => ({
          value: icon,
          label: this.translate.instant(`quickReference.icons.${icon}`),
          icon,
        })),
      },
      {
        id: 'categories',
        type: 'select',
        multiple: true,
        maxLabelCount: 4,
        label: 'quickReference.rule.categories',
        description: this.translate.instant('quickReference.rule.categoriesHint'),
        placeholder: 'quickReference.rule.categoriesPlaceholder',
        translate: true,
        options: this.service.categories().map((category) => ({
          value: category.id,
          label: category.name,
        })),
      },
    ];
    const values: AppSheetFieldValueMap = {
      title: rule?.title ?? '',
      short: rule?.short ?? '',
      full: rule?.full ?? '',
      icon: rule ? this.iconOf(rule) : DEFAULT_RULE_ICON,
      categories,
    };
    let isSubmitting = false;
    const dialogRef = this.dialogForm.open({
      arcTitle: this.translate.instant(
        rule ? 'quickReference.rule.editTitle' : 'quickReference.rule.newTitle',
      ),
      arcOkText: this.translate.instant(
        rule ? 'quickReference.rule.save' : 'quickReference.rule.add',
      ),
      arcCancelText: this.translate.instant('quickReference.cancel'),
      arcCustomClasses: 'sm:max-w-xl',
      fields,
      values,
      onSubmit: (form) => {
        if (isSubmitting) {
          return false;
        }

        isSubmitting = true;
        const result = form.getValues();
        const input = {
          title: String(result['title'] ?? ''),
          short: String(result['short'] ?? ''),
          full: String(result['full'] ?? ''),
          icon: String(result['icon'] ?? DEFAULT_RULE_ICON),
          categories: (Array.isArray(result['categories']) ? result['categories'] : []) as string[],
        };
        const save = rule
          ? this.service.updateRule(rule.id, input).then((ok) => (ok ? rule.id : null))
          : this.service.addRule(input);
        void save.then((id) => {
          isSubmitting = false;
          if (id) {
            this.service.select(id);
            dialogRef.close();
          } else {
            this.notifyNotSaved();
          }
        });
        return false;
      },
    });
  }

  protected openCategoryDialog(categoryId: string | null): void {
    const category = categoryId
      ? (this.service.categories().find((item) => item.id === categoryId) ?? null)
      : null;
    let isSubmitting = false;
    const dialogRef = this.dialogForm.open({
      arcTitle: this.translate.instant(
        category ? 'quickReference.category.renameTitle' : 'quickReference.category.newTitle',
      ),
      arcOkText: this.translate.instant(
        category ? 'quickReference.category.save' : 'quickReference.category.add',
      ),
      arcCancelText: this.translate.instant('quickReference.cancel'),
      fields: [
        {
          id: 'name',
          type: 'input',
          label: 'quickReference.category.name',
          placeholder: 'quickReference.category.namePlaceholder',
          required: true,
          translate: true,
          validate: (value) => {
            const name = (value ?? '').trim().toLocaleLowerCase();
            const taken = this.service
              .categories()
              .some(
                (item) => item.id !== category?.id && item.name.trim().toLocaleLowerCase() === name,
              );
            return taken ? this.translate.instant('quickReference.category.taken') : null;
          },
        },
      ],
      values: { name: category?.name ?? '' },
      onSubmit: (form) => {
        if (isSubmitting) {
          return false;
        }

        isSubmitting = true;
        const name = String(form.getValues()['name'] ?? '');
        const save = category
          ? this.service.renameCategory(category.id, name).then((ok) => (ok ? category.id : null))
          : this.service.addCategory(name);
        void save.then((id) => {
          isSubmitting = false;
          if (id) {
            dialogRef.close();
          } else {
            this.notifyNotSaved();
          }
        });
        return false;
      },
    });
  }

  protected confirmDeleteRule(rule: QuickReferenceRuleDto): void {
    this.alertDialog.confirm({
      arcTitle: this.translate.instant('quickReference.rule.deleteTitle', { name: rule.title }),
      arcDescription: this.translate.instant('quickReference.rule.deleteDescription'),
      arcOkText: this.translate.instant('quickReference.rule.delete'),
      arcCancelText: this.translate.instant('quickReference.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => {
        void this.service.deleteRule(rule.id).then((ok) => {
          if (!ok) {
            this.notifyNotSaved();
          }
        });
      },
    });
  }

  protected confirmDeleteCategory(id: string): void {
    const group = this.service.groups().find((item) => item.id === id);
    if (!group) {
      return;
    }

    this.alertDialog.confirm({
      arcTitle: this.translate.instant('quickReference.category.deleteTitle', { name: group.name }),
      arcDescription: this.translate.instant('quickReference.category.deleteDescription', {
        count: group.rules.length,
      }),
      arcOkText: this.translate.instant('quickReference.category.delete'),
      arcCancelText: this.translate.instant('quickReference.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => {
        void this.service.deleteCategory(id).then((ok) => {
          if (!ok) {
            this.notifyNotSaved();
          }
        });
      },
    });
  }

  protected async startFrom(system: string): Promise<void> {
    if (!(await this.service.addBuiltin(system))) {
      this.notifyNotSaved();
    }
  }

  protected async resetSelected(): Promise<void> {
    const rule = this.service.selected();
    if (rule && !(await this.service.resetRule(rule.id))) {
      this.notifyNotSaved();
    }
  }

  protected trackGroup(_: number, group: QuickReferenceGroup): string {
    return group.id;
  }

  /** A change that did not reach the file: another computer changed it first, or it could not be written. */
  private notifyNotSaved(): void {
    const error = this.service.error();
    toast.error(
      this.translate.instant(
        error ? 'quickReference.saveError' : 'quickReference.changedElsewhere',
      ),
      {
        description: error ?? undefined,
      },
    );
  }
}
