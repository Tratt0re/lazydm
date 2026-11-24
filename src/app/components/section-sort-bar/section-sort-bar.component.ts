import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import {
  countMenuFilters,
  isFilterActive,
  type SectionFilter,
  type TagOption,
} from '@/config/section-filter.config';
import { SECTION_SORT_MODES, type SectionSortMode } from '@/config/section-sort.config';
import type { SectionView } from '@/config/section-view.config';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechCheckboxComponent } from '@/shared/components/checkbox';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechPopoverDirective } from '@/shared/components/popover';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

const SORT_ICONS: Readonly<Record<SectionSortMode, ArcTechIcon>> = {
  'name-asc': 'arrow-down-a-z',
  'name-desc': 'arrow-down-z-a',
  modified: 'clock',
  size: 'arrow-down-wide-narrow',
  type: 'file-type',
};

const VIEW_ICONS: Readonly<Record<SectionView, ArcTechIcon>> = {
  list: 'list',
  cards: 'layout-grid',
  graph: 'waypoints',
};

/** A folder the Filter menu can narrow to (`''` is the section's main folder). */
export interface FolderOption {
  readonly value: string;
  readonly count: number;
}

/**
 * Bar over the file list of a section or folder: search, the Filter menu, the entry count and the sort choice,
 * with the chosen filters shown as removable chips underneath. Sticky, so it stays in reach while a long list scrolls.
 */
@Component({
  selector: 'app-section-sort-bar',
  imports: [
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechCheckboxComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
    ArcTechPopoverDirective,
    ArcTechTooltipImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The host is the sticky element: its parent is the whole page column, so it can travel with the scroll.
  // -top-6 cancels the content area's 24px padding, so the bar stops right under the toolbar.
  host: { class: 'sticky -top-6 z-10 block bg-background' },
  template: `
    <div class="flex flex-wrap items-center gap-2 pt-1 pb-2">
      <label
        class="flex h-8 min-w-48 flex-1 basis-64 items-center gap-2 border border-input bg-recessed px-2.5 text-muted-foreground has-[:focus-visible]:border-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring sm:max-w-96"
      >
        <arc-icon arcType="search" class="size-4 shrink-0" aria-hidden="true" />
        <input
          #searchInput
          type="search"
          autocomplete="off"
          spellcheck="false"
          class="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          [placeholder]="'campaigns.sections.search.placeholder' | translate"
          [attr.aria-label]="'campaigns.sections.search.label' | translate"
          [value]="filter().query"
          (input)="onQuery($event)"
          (keydown.escape)="onEscape($event)"
        />
        @if (filter().query) {
          <button
            type="button"
            class="flex size-5 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            [attr.aria-label]="'campaigns.sections.search.clear' | translate"
            (click)="clearQuery()"
          >
            <arc-icon arcType="x" class="size-3.5" />
          </button>
        } @else {
          <kbd
            class="hidden shrink-0 border border-border-subtle px-1 font-mono text-[11px] sm:block"
            aria-hidden="true"
            >/</kbd
          >
        }
      </label>

      <button
        type="button"
        arc-button
        arcType="outline"
        arcSize="sm"
        arcPopover
        [arcContent]="filterMenu"
        arcPlacement="bottom"
        [arcVisible]="menuOpen()"
        (arcVisibleChange)="menuOpen.set($event)"
        class="h-8 gap-2 font-mono text-xs tracking-[0.04em] uppercase"
        [class.border-ring]="menuOpen()"
        aria-haspopup="true"
        [attr.aria-expanded]="menuOpen()"
      >
        <arc-icon arcType="filter" class="size-4" />
        {{ 'campaigns.sections.filter.button' | translate }}
        @if (menuCount() > 0) {
          <span
            class="flex h-[18px] min-w-[18px] items-center justify-center bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
            >{{ menuCount() }}</span
          >
        }
      </button>

      <span class="flex-1"></span>

      <p
        class="font-mono text-[11px] tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase"
        aria-live="polite"
      >
        @if (isFiltering()) {
          {{
            'campaigns.sections.filter.entriesOf' | translate: { shown: count(), total: total() }
          }}
        } @else {
          {{ 'campaigns.sections.sort.entries' | translate: { count: count() } }}
        }
      </p>

      <button
        type="button"
        arc-button
        arc-menu
        [arcMenuTriggerFor]="sortMenu"
        arcPlacement="bottomRight"
        arcType="ghost"
        arcSize="sm"
        class="h-7 gap-1.5 px-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase"
        [attr.aria-label]="'campaigns.sections.sort.ariaLabel' | translate"
        arcPosition="bottom"
        [arcTooltip]="'campaigns.sections.sort.ariaLabel' | translate"
      >
        <arc-icon [arcType]="currentIcon()" class="size-3.5" />
        {{ 'campaigns.sections.sort.' + mode() | translate }}
      </button>

      @if (views().length > 1) {
        <div
          class="inline-flex border border-input bg-card"
          role="group"
          [attr.aria-label]="'campaigns.sections.views.label' | translate"
        >
          @for (option of views(); track option) {
            <button
              type="button"
              class="flex h-[30px] cursor-pointer items-center gap-1.5 border-r border-border-subtle px-2.5 font-mono text-xs tracking-[0.04em] uppercase last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              [class]="
                option === view()
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              "
              [attr.aria-pressed]="option === view()"
              [attr.aria-label]="'campaigns.sections.views.' + option | translate"
              [attr.title]="'campaigns.sections.views.' + option | translate"
              (click)="viewChange.emit(option)"
            >
              <arc-icon [arcType]="viewIconOf(option)" class="size-4" />
              <span class="hidden md:inline">{{
                'campaigns.sections.views.' + option | translate
              }}</span>
            </button>
          }
        </div>
      }
    </div>

    @if (menuCount() > 0) {
      <div
        class="flex flex-wrap items-center gap-1.5 pb-2"
        role="group"
        [attr.aria-label]="'campaigns.sections.filter.active' | translate"
      >
        @for (tag of filter().tags; track tag) {
          <span
            class="inline-flex h-6 items-center gap-1.5 border border-input bg-accent pl-2 font-mono text-[11px] text-foreground"
          >
            <span class="tracking-[0.06em] text-muted-foreground uppercase">{{
              'campaigns.sections.filter.tagChip' | translate
            }}</span>
            {{ tag }}
            <button
              type="button"
              class="flex size-5 cursor-pointer items-center justify-center text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              [attr.aria-label]="'campaigns.sections.filter.removeTag' | translate: { tag }"
              (click)="toggleTag(tag)"
            >
              <arc-icon arcType="x" class="size-3" />
            </button>
          </span>
        }
        @for (folder of filter().folders; track folder) {
          <span
            class="inline-flex h-6 items-center gap-1.5 border border-input bg-accent pl-2 font-mono text-[11px] text-foreground"
          >
            <span class="tracking-[0.06em] text-muted-foreground uppercase">{{
              'campaigns.sections.filter.folderChip' | translate
            }}</span>
            {{ folderLabel(folder) }}
            <button
              type="button"
              class="flex size-5 cursor-pointer items-center justify-center text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              [attr.aria-label]="
                'campaigns.sections.filter.removeFolder'
                  | translate: { folder: folderLabel(folder) }
              "
              (click)="toggleFolder(folder)"
            >
              <arc-icon arcType="x" class="size-3" />
            </button>
          </span>
        }
        <button
          type="button"
          class="h-6 cursor-pointer px-1 font-mono text-[11px] tracking-[0.06em] text-primary uppercase underline underline-offset-4 hover:text-highlight focus-visible:outline-2 focus-visible:outline-ring"
          (click)="clearMenu()"
        >
          {{ 'campaigns.sections.filter.clear' | translate }}
        </button>
      </div>
    }

    <div class="border-b border-border"></div>

    <ng-template #sortMenu>
      <div arc-menu-content class="w-56">
        @for (option of options; track option) {
          <button type="button" arc-menu-item (click)="changed.emit(option)">
            <arc-icon [arcType]="iconOf(option)" />
            {{ 'campaigns.sections.sort.' + option | translate }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #filterMenu>
      <div
        class="w-72 border border-border-strong bg-popover text-popover-foreground shadow-overlay"
        role="group"
        [attr.aria-label]="'campaigns.sections.filter.button' | translate"
      >
        @if (tagOptions().length > 0) {
          <p
            class="px-3 pt-2.5 pb-1.5 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {{ 'campaigns.sections.filter.tags' | translate }}
          </p>
          <label
            class="mx-3 mb-2 flex h-7 items-center gap-2 border border-input bg-recessed px-2 text-muted-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
          >
            <arc-icon arcType="search" class="size-3.5 shrink-0" aria-hidden="true" />
            <input
              type="search"
              autocomplete="off"
              spellcheck="false"
              class="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              [placeholder]="'campaigns.sections.filter.findTag' | translate"
              [attr.aria-label]="'campaigns.sections.filter.findTag' | translate"
              [value]="tagSearch()"
              (input)="tagSearch.set($any($event.target).value)"
            />
          </label>
          <div class="max-h-44 overflow-x-hidden overflow-y-auto border-t border-border-subtle">
            @for (option of visibleTagOptions(); track option.tag) {
              <div class="flex min-h-8 items-center gap-2 px-3 py-1 hover:bg-accent">
                <arc-checkbox
                  class="min-w-0 flex-1"
                  [arcChecked]="filter().tags.includes(option.tag)"
                  (checkChange)="toggleTag(option.tag)"
                >
                  <span class="truncate text-[13px]">{{ option.tag }}</span>
                </arc-checkbox>
                <span class="font-mono text-[11px] text-muted-foreground">{{ option.count }}</span>
              </div>
            } @empty {
              <p class="px-3 py-2 text-[13px] text-muted-foreground">
                {{ 'campaigns.sections.filter.noTag' | translate }}
              </p>
            }
          </div>
        }

        @if (folderOptions().length > 0) {
          <p
            class="border-t border-border-subtle px-3 pt-2.5 pb-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {{ 'campaigns.sections.filter.folders' | translate }}
          </p>
          @for (option of folderOptions(); track option.value) {
            <div class="flex min-h-8 items-center gap-2 px-3 py-1 hover:bg-accent">
              <arc-checkbox
                class="min-w-0 flex-1"
                [arcChecked]="filter().folders.includes(option.value)"
                (checkChange)="toggleFolder(option.value)"
              >
                <span class="truncate text-[13px]">{{ folderLabel(option.value) }}</span>
              </arc-checkbox>
              <span class="font-mono text-[11px] text-muted-foreground">{{ option.count }}</span>
            </div>
          }
        }

        <div
          class="flex items-center justify-between gap-3 border-t border-border-subtle px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
        >
          <span>{{ 'campaigns.sections.filter.hint' | translate }}</span>
          <button
            type="button"
            class="cursor-pointer tracking-[0.06em] text-primary uppercase underline underline-offset-4 hover:text-highlight focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50"
            [disabled]="menuCount() === 0"
            (click)="clearMenu()"
          >
            {{ 'campaigns.sections.filter.clearShort' | translate }}
          </button>
        </div>
      </div>
    </ng-template>
  `,
})
export class AppSectionSortBarComponent {
  /** Files shown in the list (the count the bar displays). */
  readonly count = input.required<number>();
  /** Files the page holds before any filter. */
  readonly total = input.required<number>();
  readonly mode = input.required<SectionSortMode>();
  /** The view shown and the ones this section offers (the switch is hidden when there is only one). */
  readonly view = input<SectionView>('list');
  readonly views = input<readonly SectionView[]>([]);
  readonly filter = input.required<SectionFilter>();
  readonly tagOptions = input<readonly TagOption[]>([]);
  readonly folderOptions = input<readonly FolderOption[]>([]);
  /** Label of the section's main folder in the Filter menu and its chips. */
  readonly mainFolderLabel = input('');
  readonly changed = output<SectionSortMode>();
  readonly viewChange = output<SectionView>();
  readonly filterChange = output<SectionFilter>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly options = SECTION_SORT_MODES;
  protected readonly menuOpen = signal(false);
  protected readonly tagSearch = signal('');
  protected readonly currentIcon = computed(() => SORT_ICONS[this.mode()]);
  protected readonly menuCount = computed(() => countMenuFilters(this.filter()));
  protected readonly isFiltering = computed(() => isFilterActive(this.filter()));
  protected readonly visibleTagOptions = computed(() => {
    const needle = this.tagSearch().trim().toLocaleLowerCase();
    return needle
      ? this.tagOptions().filter((option) => option.tag.toLocaleLowerCase().includes(needle))
      : this.tagOptions();
  });

  /** Escape closes the Filter menu wherever the focus is (it stays on the button that opened the menu). */
  @HostListener('document:keydown.escape')
  protected onDocumentEscape(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
    }
  }

  /** `/` jumps to the search field, unless the user is already typing somewhere. */
  @HostListener('document:keydown', ['$event'])
  protected onDocumentKey(event: KeyboardEvent): void {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }

    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }

  protected iconOf(mode: SectionSortMode): ArcTechIcon {
    return SORT_ICONS[mode];
  }

  protected viewIconOf(view: SectionView): ArcTechIcon {
    return VIEW_ICONS[view];
  }

  protected folderLabel(folder: string): string {
    return folder === '' ? this.mainFolderLabel() : folder;
  }

  protected onQuery(event: Event): void {
    this.filterChange.emit({ ...this.filter(), query: (event.target as HTMLInputElement).value });
  }

  protected clearQuery(): void {
    this.filterChange.emit({ ...this.filter(), query: '' });
    this.searchInput()?.nativeElement.focus();
  }

  protected onEscape(event: Event): void {
    if (this.filter().query) {
      event.stopPropagation();
      this.clearQuery();
    }
  }

  protected toggleTag(tag: string): void {
    const tags = this.filter().tags;
    this.filterChange.emit({
      ...this.filter(),
      tags: tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag],
    });
  }

  protected toggleFolder(folder: string): void {
    const folders = this.filter().folders;
    this.filterChange.emit({
      ...this.filter(),
      folders: folders.includes(folder)
        ? folders.filter((item) => item !== folder)
        : [...folders, folder],
    });
  }

  protected clearMenu(): void {
    this.filterChange.emit({ ...this.filter(), tags: [], folders: [] });
  }
}
