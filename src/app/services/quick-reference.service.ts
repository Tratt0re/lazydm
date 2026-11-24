import { computed, inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { APIChannel } from '@/config/api';
import type {
  QuickReferenceDto,
  QuickReferenceFileDto,
  QuickReferenceRuleDto,
  QuickReferenceWarningDto,
  WriteQuickReferenceResultDto,
} from '@/dtos';
import { BaseIpcService } from '@/services/base-ipc.service';
import { I18nService } from '@/services/i18n.service';

/** Id of the group that holds the rules no category claims (made when needed, never stored). */
export const UNCATEGORISED_ID = '__uncategorised';

/** What a rule dialog hands back: the rule's own fields and the categories it sits in. */
export interface QuickReferenceRuleInput {
  readonly title: string;
  readonly short: string;
  readonly full: string;
  readonly icon: string;
  readonly categories: readonly string[];
}

/** A category as the sheet shows it: its rules, in file order. */
export interface QuickReferenceGroup {
  readonly id: string;
  readonly name: string;
  readonly rules: readonly QuickReferenceRuleDto[];
  /** The fixed group of rules with no category: it cannot be renamed or deleted. */
  readonly isUncategorised: boolean;
}

/** Text of a rule that search looks in, lower case. */
function haystack(rule: QuickReferenceRuleDto): string {
  return `${rule.title}\n${rule.short}\n${rule.full}`.toLocaleLowerCase();
}

/**
 * The Quick reference of the campaign under the sheet: loads and seeds its file, and keeps each change (a rule or
 * a category added, edited, deleted) in the file, one at a time. A file changed on disk meanwhile is never
 * overwritten: the newer one is loaded and the change is reported as not done.
 */
@Injectable({
  providedIn: 'root',
})
export class QuickReferenceService extends BaseIpcService<APIChannel.QUICK_REFERENCE> {
  private readonly i18n = inject(I18nService);
  private readonly translateService = inject(TranslateService);
  private readonly dataSignal = signal<QuickReferenceDto | null>(null);
  private readonly warningsSignal = signal<readonly QuickReferenceWarningDto[]>([]);
  private readonly campaignSignal = signal<string | null>(null);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly querySignal = signal('');
  private readonly categorySignal = signal<string | null>(null);
  private readonly selectedSignal = signal<string | null>(null);
  private contentHash: string | null = null;
  private pending: Promise<unknown> = Promise.resolve();

  readonly data = this.dataSignal.asReadonly();
  readonly warnings = this.warningsSignal.asReadonly();
  readonly campaign = this.campaignSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly query = this.querySignal.asReadonly();
  /** The category chip that is on, or null for all. */
  readonly category = this.categorySignal.asReadonly();
  readonly selectedId = this.selectedSignal.asReadonly();

  readonly rules = computed(() => this.dataSignal()?.rules ?? []);
  readonly categories = computed(() => this.dataSignal()?.categories ?? []);
  readonly selected = computed(() => {
    const id = this.selectedSignal();
    return id === null ? null : (this.rules().find((rule) => rule.id === id) ?? null);
  });
  /** Every category with its rules, then the fixed *Uncategorised* group when some rule has none. */
  readonly groups = computed<readonly QuickReferenceGroup[]>(() => {
    const known = new Set(this.categories().map((category) => category.id));
    const groups: QuickReferenceGroup[] = this.categories().map((category) => ({
      id: category.id,
      name: category.name,
      rules: this.rules().filter((rule) => rule.categories.includes(category.id)),
      isUncategorised: false,
    }));
    const orphans = this.rules().filter((rule) => !rule.categories.some((id) => known.has(id)));
    if (orphans.length > 0) {
      groups.push({
        id: UNCATEGORISED_ID,
        name: this.translateService.instant('quickReference.uncategorised'),
        rules: orphans,
        isUncategorised: true,
      });
    }

    return groups;
  });
  /** The groups after the search and the category chip. A search hides the groups it leaves empty. */
  readonly visibleGroups = computed<readonly QuickReferenceGroup[]>(() => {
    const term = this.querySignal().trim().toLocaleLowerCase();
    const category = this.categorySignal();
    return this.groups()
      .filter((group) => category === null || group.id === category)
      .map((group) => ({
        ...group,
        rules: term ? group.rules.filter((rule) => haystack(rule).includes(term)) : group.rules,
      }))
      .filter((group) => term === '' || group.rules.length > 0);
  });
  readonly matchCount = computed(
    () => new Set(this.visibleGroups().flatMap((group) => group.rules.map((rule) => rule.id))).size,
  );
  readonly isEmpty = computed(() => this.rules().length === 0 && this.categories().length === 0);

  constructor() {
    super(APIChannel.QUICK_REFERENCE);
  }

  /** Opens a campaign's sheet: loads its file, or makes it from the campaign's game system the first time. */
  async open(campaign: string): Promise<void> {
    if (this.campaignSignal() !== campaign) {
      this.reset();
      this.campaignSignal.set(campaign);
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    try {
      this.apply(await this.ipcClient.open({ campaign, language: this.i18n.language() }));
    } catch (error) {
      this.errorSignal.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loadingSignal.set(false);
    }
  }

  setQuery(query: string): void {
    this.querySignal.set(query);
    this.dropHiddenSelection();
  }

  setCategory(category: string | null): void {
    this.categorySignal.set(category);
    this.dropHiddenSelection();
  }

  select(ruleId: string | null): void {
    this.selectedSignal.set(ruleId);
  }

  /** Adds a rule at the end of the file; answers its id, or null when the file moved on. */
  async addRule(input: QuickReferenceRuleInput): Promise<string | null> {
    let id: string | null = null;
    const done = await this.change((data) => {
      id = this.makeId(
        data.rules.map((rule) => rule.id),
        input.title,
      );
      return { ...data, rules: [...data.rules, { id, ...this.cleanRule(input) }] };
    });
    return done ? id : null;
  }

  async updateRule(id: string, input: QuickReferenceRuleInput): Promise<boolean> {
    return this.change((data) => ({
      ...data,
      rules: data.rules.map((rule) =>
        rule.id === id ? { ...rule, ...this.cleanRule(input) } : rule,
      ),
    }));
  }

  async deleteRule(id: string): Promise<boolean> {
    const done = await this.change((data) => ({
      ...data,
      rules: data.rules.filter((rule) => rule.id !== id),
    }));
    if (done && this.selectedSignal() === id) {
      this.selectedSignal.set(null);
    }

    return done;
  }

  async addCategory(name: string): Promise<string | null> {
    let id: string | null = null;
    const done = await this.change((data) => {
      id = this.makeId(
        data.categories.map((category) => category.id),
        name,
      );
      return { ...data, categories: [...data.categories, { id, name: name.trim() }] };
    });
    return done ? id : null;
  }

  async renameCategory(id: string, name: string): Promise<boolean> {
    return this.change((data) => ({
      ...data,
      categories: data.categories.map((category) =>
        category.id === id ? { ...category, name: name.trim() } : category,
      ),
    }));
  }

  /** Deletes a category and keeps its rules: they fall to *Uncategorised* (or stay in the other categories they sit in). */
  async deleteCategory(id: string): Promise<boolean> {
    const done = await this.change((data) => ({
      ...data,
      categories: data.categories.filter((category) => category.id !== id),
      rules: data.rules.map((rule) => ({
        ...rule,
        categories: rule.categories.filter((categoryId) => categoryId !== id),
      })),
    }));
    if (done && this.categorySignal() === id) {
      this.categorySignal.set(null);
    }

    return done;
  }

  /** *Start from…*: adds a system's built-in rules to the file, never replacing what is there. */
  async addBuiltin(system: string): Promise<boolean> {
    const campaign = this.campaignSignal();
    if (!campaign) {
      return false;
    }

    return this.send((hash) =>
      this.ipcClient.addBuiltin({
        campaign,
        system,
        language: this.i18n.language(),
        expectedHash: hash,
      }),
    );
  }

  /** Puts a built-in rule back to its words and icon. */
  async resetRule(ruleId: string): Promise<boolean> {
    const campaign = this.campaignSignal();
    if (!campaign) {
      return false;
    }

    return this.send((hash) =>
      this.ipcClient.resetRule({
        campaign,
        rule: ruleId,
        language: this.i18n.language(),
        expectedHash: hash,
      }),
    );
  }

  /** The rule being read always sits in the list: when a search or a category hides it, it is put away. */
  private dropHiddenSelection(): void {
    const selected = this.selectedSignal();
    if (
      selected !== null &&
      !this.visibleGroups().some((group) => group.rules.some((rule) => rule.id === selected))
    ) {
      this.selectedSignal.set(null);
    }
  }

  private reset(): void {
    this.dataSignal.set(null);
    this.warningsSignal.set([]);
    this.contentHash = null;
    this.querySignal.set('');
    this.categorySignal.set(null);
    this.selectedSignal.set(null);
    this.errorSignal.set(null);
  }

  private apply(file: QuickReferenceFileDto): void {
    this.dataSignal.set(file.data);
    this.warningsSignal.set(file.warnings);
    this.contentHash = file.contentHash;
    const selected = this.selectedSignal();
    if (selected !== null && !file.data.rules.some((rule) => rule.id === selected)) {
      this.selectedSignal.set(null);
    }
    const category = this.categorySignal();
    if (
      category !== null &&
      category !== UNCATEGORISED_ID &&
      !file.data.categories.some((item) => item.id === category)
    ) {
      this.categorySignal.set(null);
    }
  }

  private cleanRule(input: QuickReferenceRuleInput): Omit<QuickReferenceRuleDto, 'id' | 'source'> {
    return {
      title: input.title.trim(),
      short: input.short.trim(),
      full: input.full.trim(),
      icon: input.icon,
      categories: [...input.categories],
    };
  }

  private makeId(taken: readonly string[], text: string): string {
    const base =
      text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'item';
    let id = base;
    for (let suffix = 2; taken.includes(id); suffix += 1) {
      id = `${base}-${suffix}`;
    }

    return id;
  }

  /** Runs one change on the data as it is now, after the one before it, and saves it. */
  private change(update: (data: QuickReferenceDto) => QuickReferenceDto): Promise<boolean> {
    const campaign = this.campaignSignal();
    if (!campaign) {
      return Promise.resolve(false);
    }

    return this.send((hash) => {
      const current = this.dataSignal();
      if (!current) {
        throw new Error('The quick reference is not loaded.');
      }

      return this.ipcClient.write({ campaign, data: update(current), expectedHash: hash });
    });
  }

  /** Calls the file one change at a time, so two quick edits never race on the same hash. */
  private send(
    call: (hash: string | null) => Promise<WriteQuickReferenceResultDto>,
  ): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      try {
        const result = await call(this.contentHash);
        if (result.status === 'conflict') {
          this.apply(result.current);
          this.errorSignal.set(null);
          return false;
        }

        this.dataSignal.set(result.data);
        this.warningsSignal.set(result.warnings);
        this.contentHash = result.contentHash;
        this.errorSignal.set(null);
        return true;
      } catch (error) {
        this.errorSignal.set(error instanceof Error ? error.message : String(error));
        return false;
      }
    };
    const next = this.pending.then(run, run);
    this.pending = next;
    return next;
  }
}
