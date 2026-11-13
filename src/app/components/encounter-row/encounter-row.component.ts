import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AppEncounterHealthBarComponent } from '@/components/encounter-health-bar/encounter-health-bar.component';
import type { TrackerRowDensity } from '@/config/local-preferences.config';
import type {
  BattleRuleAreaDto,
  BattleRuleDto,
  BattleRuleFieldDto,
  EncounterEntityDto,
} from '@/dtos';
import {
  type NoteContext,
  type NoteFrontmatterMap,
  type StatusValue,
  healthOf,
  isOverridden,
  noteKeyOf,
  noteOf,
  numberOf,
  parseNumber,
  statusesOf,
  textOf,
} from '@/pages/encounter-page/encounter-values';
import { ArcTechBadgeComponent } from '@/shared/components/badge';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechCheckboxComponent } from '@/shared/components/checkbox';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import {
  ArcTechInlineValueComponent,
  type ArcTechInlineMove,
  type ArcTechInlineValue,
} from '@/shared/components/inline-value';
import { ArcTechInputDirective } from '@/shared/components/input';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

export type HpChangeMode = 'damage' | 'heal' | 'temp';

/** An element of the entity row and the grid cells it takes (the name has no field). */
interface RowCell {
  readonly id: string;
  readonly field: BattleRuleFieldDto | null;
  readonly area: BattleRuleAreaDto;
}

/**
 * One combatant of a tracker: the row the encounter page lists and the settings page previews. It only shows
 * and reports: every edit goes out as an event, so the page decides what to store (the preview stores nothing).
 */
@Component({
  selector: 'app-encounter-row',
  imports: [
    CdkDragHandle,
    TranslatePipe,
    AppEncounterHealthBarComponent,
    ArcTechBadgeComponent,
    ArcTechButtonComponent,
    ArcTechCheckboxComponent,
    ArcTechIconComponent,
    ArcTechInlineValueComponent,
    ArcTechInputDirective,
    ArcTechMenuImports,
    ...ArcTechSelectImports,
    ArcTechTooltipImports,
  ],
  template: `
    @if (showRail()) {
    <!-- Left rail: the two things you do to many rows at once (drag to reorder, pick for the roll). -->
    <div
      class="flex min-w-8 shrink-0 flex-col items-center gap-1 border-r border-border-subtle px-1 py-2"
      [class]="sideTint(side())"
    >
      @if (side(); as sideValue) {
        <!-- The tint says it too; the word makes it not rely on colour. -->
        <span class="sr-only">{{ sideLabel(sideValue) }}</span>
      }
      @if (isEditable()) {
      <span
        cdkDragHandle
        class="flex size-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
        [attr.aria-label]="'encounters.entity.drag' | translate"
        [arcTooltip]="'encounters.entity.drag' | translate"
      >
        <arc-icon arcType="grip-vertical" class="size-4" aria-hidden="true" />
      </span>
      }
      @if (canRoll()) {
        <arc-checkbox
          [arcChecked]="selected()"
          [attr.aria-label]="'encounters.roll.select' | translate"
          (checkChange)="toggleSelect.emit()"
        />
      }
    </div>
    }

    <!-- The row is the rule's grid: each element sits where the rule put it. The grid needs room (about
         42rem of row): in a narrower row the elements flow and wrap instead, each at the size it needs. -->
    @let rowDensity = density();
    <div class="@container min-w-0 flex-1">
      <div [class]="gridClasses(rowDensity)">
        @for (cell of cells(); track cell.id) {
          <div
            class="flex items-center gap-1 [order:var(--kind)] @2xl:min-w-0 @2xl:[order:0] @2xl:[grid-column:var(--column)] @2xl:[grid-row:var(--row)]"
            [class]="cellSizing(cell, rowDensity)"
            [style.--kind]="flowKindOf(cell)"
            [style.--row]="cell.area.row"
            [style.--column]="cell.area.column + ' / span ' + cell.area.span"
          >
          @if (cell.field === null) {
            <arc-inline-value
              class="min-w-0"
              arcKey="$name"
              [arcRow]="entity().id"
              [arcLabel]="'encounters.entity.name' | translate"
              [arcValue]="entity().name"
              [arcPlaceholder]="'encounters.entity.namePlaceholder' | translate"
              [arcDisabled]="!isEditable()"
              (arcCommit)="nameChange.emit($event)"
              (arcMove)="move.emit({ event: $event, key: '$name' })"
            >
              <span
                class="min-w-0 truncate text-sm font-semibold"
                [class.text-muted-foreground]="entity().name === null"
              >
                {{ displayName() }}
              </span>
            </arc-inline-value>
            @if (isTurn()) {
              <!-- The bar and the tint say it too; the word makes it not rely on colour. -->
              <arc-badge arcType="outline" class="shrink-0 border-primary text-primary">
                {{ 'encounters.battle.turnChip' | translate }}
              </arc-badge>
            }
          } @else {
            @let field = cell.field;
            @switch (field.component) {
              @case ('initiative') {
                @let initiative = numberOf(field);
                <arc-inline-value
                  #initiativeValue="arcInlineValue"
                  class="shrink-0"
                  arcType="number"
                  [arcKey]="field.key"
                  [arcRow]="entity().id"
                  [arcLabel]="fieldLabel(field)"
                  [arcValue]="initiative"
                  [arcDisabled]="!isEditable()"
                  arcInputClass="w-14 text-center font-display text-lg font-extrabold"
                  (arcCommit)="valueChange.emit({ field, value: $event })"
                  (arcMove)="move.emit({ event: $event, key: field.key })"
                >
                  @if (canRollOne()) {
                    <button
                      arcInlineAction
                      type="button"
                      arc-button
                      arcType="outline"
                      arcSize="sm"
                      class="size-8! shrink-0 p-0!"
                      tabindex="-1"
                      [attr.aria-label]="'encounters.roll.one' | translate"
                      [arcTooltip]="'encounters.roll.one' | translate"
                      (click)="rollOne.emit(initiativeValue)"
                    >
                      <arc-icon arcType="dices" />
                    </button>
                  }
                  <span
                    class="flex shrink-0 items-center justify-center border border-border bg-recessed font-display font-extrabold"
                    [class]="initiativeClasses(rowDensity)"
                    [class.text-muted-foreground]="initiative === null"
                    [attr.title]="fieldLabel(field)"
                  >
                    {{ initiative ?? '–' }}
                  </span>
                </arc-inline-value>
              }
              @case ('number') {
                @let value = numberOf(field);
                @if (value !== null || isEditable()) {
                  <arc-inline-value
                    class="shrink-0"
                    arcType="number"
                    [arcKey]="field.key"
                    [arcRow]="entity().id"
                    [arcLabel]="fieldLabel(field)"
                    [arcValue]="value"
                    [arcDisabled]="!isEditable()"
                    [arcOverridden]="isOverridden(field)"
                    [arcOverriddenLabel]="'encounters.inline.overridden' | translate"
                    arcInputClass="w-14 text-center"
                    (arcCommit)="valueChange.emit({ field, value: $event })"
                    (arcMove)="move.emit({ event: $event, key: field.key })"
                  >
                    <!-- A tile like the initiative box: the value, a rule, the label under it. -->
                    <span
                      class="flex shrink-0 flex-col items-stretch border border-border bg-recessed text-center"
                      [class]="tileClasses(rowDensity).box"
                    >
                      <span
                        class="px-1 font-display leading-none font-semibold"
                        [class]="tileClasses(rowDensity).value"
                        [class.text-muted-foreground]="value === null"
                        >{{ value ?? '–' }}</span
                      >
                      <span
                        class="border-t border-border px-1 py-0.5 font-mono text-[11px] leading-none tracking-[0.1em] text-muted-foreground uppercase"
                        >{{ fieldLabel(field) }}</span
                      >
                    </span>
                  </arc-inline-value>
                  @if (isOverridden(field) && isEditable()) {
                    <button
                      type="button"
                      arc-button
                      arcType="ghost"
                      arcSize="sm"
                      class="size-6! shrink-0 p-0!"
                      [attr.aria-label]="'encounters.inline.reset' | translate"
                      [arcTooltip]="'encounters.inline.reset' | translate"
                      (click)="resetField.emit(field)"
                    >
                      <arc-icon arcType="rotate-ccw" class="size-3.5" />
                    </button>
                  }
                }
              }
              @case ('healthbar') {
                @let health = healthOf(field);
                <app-encounter-health-bar
                  class="min-w-0 flex-1"
                  [current]="health.current ?? null"
                  [max]="health.max ?? null"
                  [temp]="health.temp ?? 0"
                  [label]="fieldLabel(field)"
                  [isLarge]="rowDensity === 'expanded'"
                  [editable]="isEditable()"
                  [overridden]="isOverridden(field)"
                  [overriddenLabel]="'encounters.inline.overridden' | translate"
                  [currentLabel]="('encounters.hp.current' | translate)"
                  [maxLabel]="('encounters.hp.max' | translate)"
                  [tempLabel]="('encounters.hp.modes.temp' | translate)"
                  (currentChange)="healthChange.emit({ field, part: 'current', value: $event })"
                  (maxChange)="healthChange.emit({ field, part: 'max', value: $event })"
                  (tempChange)="healthChange.emit({ field, part: 'temp', value: $event })"
                >
                  @if (!isParty()) {
                    <!-- Quick HP, in every row: type an amount, then damage, heal or temporary HP (icon buttons). -->
                    <div class="mt-0.5 flex items-center justify-end gap-1" role="group" [attr.aria-label]="'encounters.hp.manage' | translate">
                      <input
                        #hpAmount
                        arc-input
                        type="text"
                        inputmode="numeric"
                        class="h-6 w-12 px-1 text-center font-mono text-xs"
                        placeholder="–"
                        [disabled]="!isEditable()"
                        [attr.aria-label]="'encounters.hp.amount' | translate"
                        (keydown.enter)="applyHp(field, 'damage', hpAmount)"
                      />
                      @for (mode of hpModes; track mode.mode) {
                        <button
                          type="button"
                          arc-button
                          arcType="outline"
                          arcSize="sm"
                          class="size-6! shrink-0 p-0!"
                          [arcDisabled]="!isEditable()"
                          [attr.aria-label]="'encounters.hp.modes.' + mode.mode | translate"
                          [arcTooltip]="'encounters.hp.modes.' + mode.mode | translate"
                          (click)="applyHp(field, mode.mode, hpAmount)"
                        >
                          <arc-icon [arcType]="mode.icon" class="size-3.5" />
                        </button>
                      }
                    </div>
                  }
                </app-encounter-health-bar>
                @if (isOverridden(field) && isEditable()) {
                  <button
                    type="button"
                    arc-button
                    arcType="ghost"
                    arcSize="sm"
                    class="size-6! shrink-0 p-0!"
                    [attr.aria-label]="'encounters.inline.reset' | translate"
                    [arcTooltip]="'encounters.inline.reset' | translate"
                    (click)="resetField.emit(field)"
                  >
                    <arc-icon arcType="rotate-ccw" class="size-3.5" />
                  </button>
                }
              }
              @case ('statuses') {
                <!-- A bordered, labelled field: tags typed in place ("name", space, "rounds", space). -->
                <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <label
                    class="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase"
                    [class.sr-only]="rowDensity === 'compact'"
                    [attr.for]="'status-' + entity().id"
                  >{{ fieldLabel(field) }}</label>
                  <div
                    class="flex min-h-8 flex-wrap items-center gap-1 border border-input bg-recessed px-1.5 py-1 focus-within:border-ring"
                  >
                    @for (status of statusesOf(field); track $index) {
                      <arc-badge arcType="outline" class="h-5 gap-1 py-0 pr-0.5">
                        {{ status.name }}@if (status.rounds !== undefined) { · {{ status.rounds }} }
                        <button
                          type="button"
                          class="flex size-4 cursor-pointer items-center justify-center hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                          [disabled]="!isEditable()"
                          [attr.aria-label]="'encounters.status.remove' | translate: { name: status.name }"
                          (click)="statusRemove.emit({ field, index: $index })"
                        >
                          <arc-icon arcType="x" />
                        </button>
                      </arc-badge>
                    }
                    <input
                      type="text"
                      class="h-5 min-w-28 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground focus-visible:outline-none"
                      [id]="'status-' + entity().id"
                      [disabled]="!isEditable()"
                      [placeholder]="'encounters.status.placeholder' | translate"
                      (keydown)="onStatusKeydown($event, field)"
                      (blur)="commitStatusInput($any($event.target), field)"
                    />
                  </div>
                </div>
              }
              @case ('text') {
                @if (textOf(field) !== null || isEditable()) {
                  <arc-inline-value
                    class="min-w-0"
                    [arcKey]="field.key"
                    [arcRow]="entity().id"
                    [arcLabel]="fieldLabel(field)"
                    [arcValue]="textOf(field)"
                    [arcPlaceholder]="rowDensity === 'expanded' ? '–' : fieldLabel(field)"
                    [arcDisabled]="!isEditable()"
                    (arcCommit)="valueChange.emit({ field, value: $event })"
                    (arcMove)="move.emit({ event: $event, key: field.key })"
                  >
                    <span
                      class="truncate"
                      [class]="rowDensity === 'expanded' && textOf(field) !== null ? 'text-sm text-foreground' : 'text-xs text-muted-foreground'"
                      [class.italic]="textOf(field) === null && rowDensity !== 'expanded'"
                      >{{ textOf(field) ?? (rowDensity === 'expanded' ? '–' : fieldLabel(field)) }}</span
                    >
                  </arc-inline-value>
                  @if (rowDensity === 'expanded') {
                    <!-- In the Expanded row a bare value needs its name ("30 ft." is Speed). -->
                    <span class="order-first font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">{{ fieldLabel(field) }}</span>
                  }
                }
              }
            }
          }
        </div>
      }
        <!-- Narrow rows: initiative and name on the first line, defences and health bar on the next. -->
        <div class="order-2 h-0 basis-full @2xl:hidden" aria-hidden="true"></div>
      </div>
      @if (rowDensity === 'expanded') {
        @if (excerpt(); as excerpt) {
          <p class="border-t border-border-subtle px-4 py-2 text-xs leading-5 text-foreground-secondary">{{ excerpt }}</p>
        }
      }
    </div>

    @if (showActions()) {
    <!-- Actions: one "…" menu with all of them (Delete last). -->
    <div class="flex shrink-0 flex-col items-center gap-0.5 px-1 py-1.5">
      <button
        type="button"
        arc-button
        arc-menu
        [arcMenuTriggerFor]="entityMenu"
        arcPlacement="bottomRight"
        arcType="ghost"
        arcSize="sm"
        class="size-7! shrink-0 p-0!"
        [arcDisabled]="!isEditable()"
        [attr.aria-label]="'common.moreActions' | translate"
      >
        <arc-icon arcType="ellipsis" />
      </button>
      @if (note()) {
        <!-- The linked note sits under the menu button: that column had room to spare. -->
        <button
          type="button"
          arc-button
          arcType="ghost"
          arcSize="sm"
          class="size-7! shrink-0 p-0!"
          [attr.aria-label]="'encounters.note.show' | translate"
          [arcTooltip]="'encounters.note.show' | translate"
          (click)="openNote.emit()"
        >
          <arc-icon arcType="file-text" />
        </button>
      }

      <ng-template #entityMenu>
        <div arc-menu-content class="w-56">
          <button type="button" arc-menu-item (click)="editEntity.emit()">
            <arc-icon arcType="pencil" />
            {{ 'encounters.entity.edit' | translate }}
          </button>
          <button type="button" arc-menu-item (click)="duplicate.emit()">
            <arc-icon arcType="copy-plus" />
            {{ 'encounters.entity.duplicate' | translate }}
          </button>
          @if (!isParty()) {
            <button type="button" arc-menu-item (click)="kill.emit()">
              <arc-icon arcType="skull" />
              {{ 'encounters.entity.remove' | translate }}
            </button>
          }
          @if (sideField(); as sideRule) {
            <div class="-mx-1 my-1 h-px bg-border-subtle" role="separator"></div>
            <div arc-menu-label>{{ fieldLabel(sideRule) }}</div>
            @for (option of sideOptions(); track option) {
              <button type="button" arc-menu-item (click)="sideChange.emit({ field: sideRule, value: option })">
                <span class="size-2 shrink-0" [class]="sideColor(option || null)" aria-hidden="true"></span>
                {{ option ? sideLabel(option) : ('encounters.sides.none' | translate) }}
                @if ((side() ?? '') === option) {
                  <arc-icon arcType="check" class="ml-auto size-3.5" />
                }
              </button>
            }
          }
          <div class="-mx-1 my-1 h-px bg-border-subtle" role="separator"></div>
          <button type="button" arc-menu-item arcType="destructive" (click)="deleteEntity.emit()">
            <arc-icon arcType="trash" />
            {{ 'encounters.entity.deleteNow' | translate }}
          </button>
        </div>
      </ng-template>
    </div>
    }

  `,
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppEncounterRowComponent {
  private readonly translateService = inject(TranslateService);

  readonly entity = input.required<EncounterEntityDto>();
  readonly rule = input.required<BattleRuleDto>();
  /** The size of this row (the page resolves *Follow the turn* before it gets here). */
  readonly density = input<TrackerRowDensity>('compact');
  /** Frontmatter of the linked notes already read, by note path (fields can read from it). */
  readonly noteFrontmatter = input<NoteFrontmatterMap>(new Map());
  /** First line of prose of the linked note (the Expanded row shows it). */
  readonly excerpt = input<string | null>(null);
  readonly isEditable = input(true);
  readonly isParty = input(false);
  readonly isTurn = input(false);
  readonly selected = input(false);
  readonly canRoll = input(false);
  readonly canRollOne = input(false);
  /** The drag handle and the roll checkbox (the page's list has them, a preview does not). */
  readonly showRail = input(true);
  /** The "…" menu and the note button. */
  readonly showActions = input(true);

  readonly nameChange = output<ArcTechInlineValue>();
  readonly valueChange = output<{ field: BattleRuleFieldDto; value: ArcTechInlineValue }>();
  readonly healthChange = output<{
    field: BattleRuleFieldDto;
    part: 'current' | 'max' | 'temp';
    value: ArcTechInlineValue;
  }>();
  readonly sideChange = output<{ field: BattleRuleFieldDto; value: unknown }>();
  readonly resetField = output<BattleRuleFieldDto>();
  readonly hpApply = output<{ field: BattleRuleFieldDto; mode: HpChangeMode; amount: number }>();
  readonly statusAdd = output<{ field: BattleRuleFieldDto; name: string; rounds: number }>();
  readonly statusRemove = output<{ field: BattleRuleFieldDto; index: number }>();
  readonly move = output<{ event: ArcTechInlineMove; key: string }>();
  readonly rollOne = output<ArcTechInlineValueComponent>();
  readonly toggleSelect = output<void>();
  readonly openNote = output<void>();
  readonly editEntity = output<void>();
  readonly duplicate = output<void>();
  readonly kill = output<void>();
  readonly deleteEntity = output<void>();

  /** The quick HP buttons: damage, heal, temporary HP (icon only; the name is the tooltip and the accessible name). */
  protected readonly hpModes: readonly { readonly mode: HpChangeMode; readonly icon: ArcTechIcon }[] = [
    { mode: 'damage', icon: 'swords' },
    { mode: 'heal', icon: 'heart-plus' },
    { mode: 'temp', icon: 'shield-plus' },
  ];

  private readonly context = computed<NoteContext>(() => ({
    noteKey: noteKeyOf(this.rule()),
    frontmatter: this.noteFrontmatter(),
  }));
  /** The rule's side field (null when it has none) and the side this combatant is on. */
  protected readonly sideField = computed(
    () => this.rule().fields.find((field) => field.component === 'side') ?? null,
  );
  protected readonly side = computed(() => {
    const field = this.sideField();
    return field ? this.textOf(field) : null;
  });
  /** The choices of the menu: no side first, then the rule's own. */
  protected readonly sideOptions = computed(() => ['', ...(this.sideField()?.options ?? [])]);
  protected readonly note = computed(() => noteOf(this.entity(), this.context()));
  protected readonly displayName = computed(
    () => this.entity().name ?? this.translateService.instant('encounters.entity.unnamed'),
  );

  /**
   * What the row shows, each element in its place of the rule's grid (12 columns): the name, then every field the
   * rule shows in the row. A rule written before the grid existed gets places from the model.
   */
  private readonly rowCells = computed<readonly RowCell[]>(() => {
    const rule = this.rule();
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

  /**
   * The cells of the row at its density: a field that asks for a bigger one stays out of the smaller rows. Compact
   * is one line, so it reads left to right by kind (initiative, name, side, health, defences, conditions) instead of
   * following the layout's grid; Card and Expanded keep the grid.
   */
  protected readonly cells = computed<readonly RowCell[]>(() => {
    const density = this.density();
    const rank: Record<TrackerRowDensity, number> = { compact: 0, card: 1, expanded: 2 };
    // The linked note's button and the side are not cells: the button sits under the "…" menu, the side tints the rail and is set from the menu.
    const cells = this.rowCells().filter(
      (cell) =>
        cell.field?.component !== 'note-link' &&
        cell.field?.component !== 'side' &&
        (!cell.field?.density || rank[cell.field.density] <= rank[density]),
    );
    return density === 'compact'
      ? [...cells].sort((left, right) => this.kindOf(left) - this.kindOf(right))
      : cells;
  });

  protected numberOf(field: BattleRuleFieldDto): number | null {
    return numberOf(this.entity(), field, this.context());
  }

  protected textOf(field: { readonly key: string; readonly source?: string }): string | null {
    return textOf(this.entity(), field, this.context());
  }

  protected healthOf(field: BattleRuleFieldDto) {
    return healthOf(this.entity(), field, this.context());
  }

  protected statusesOf(field: BattleRuleFieldDto): readonly StatusValue[] {
    return statusesOf(this.entity(), field);
  }

  protected isOverridden(field: BattleRuleFieldDto): boolean {
    return isOverridden(this.entity(), field, this.context());
  }

  protected fieldLabel(field: BattleRuleFieldDto): string {
    return this.translateService.instant(field.label);
  }

  /** Where a cell reads in a row that flows instead of following the grid: initiative, name, side, health, defences… */
  protected kindOf(cell: RowCell): number {
    const order: Record<string, number> = {
      initiative: 0,
      name: 1,
      side: 2,
      healthbar: 3,
      number: 4,
      text: 5,
      statuses: 6,
      'note-link': 7,
    };
    return order[cell.field?.component ?? 'name'] ?? 8;
  }

  /** Classes of the row's grid (it is a plain flow in Compact). */
  protected gridClasses(density: TrackerRowDensity): string {
    const flow = 'flex flex-wrap items-center gap-x-3';
    switch (density) {
      case 'compact':
        return `${flow} gap-y-1 p-1.5`;
      case 'expanded':
        return `${flow} @2xl:grid @2xl:grid-cols-12 gap-y-3 p-4`;
      default:
        return `${flow} @2xl:grid @2xl:grid-cols-12 gap-y-2 p-3`;
    }
  }

  /** The initiative tile grows with the row. */
  protected initiativeClasses(density: TrackerRowDensity): string {
    return { compact: 'size-8 text-lg', card: 'size-10 text-xl', expanded: 'size-14 text-3xl' }[density];
  }

  /** The number tiles (AC, saves) grow with the row too; their label stays at the 11px floor. */
  protected tileClasses(density: TrackerRowDensity): { box: string; value: string } {
    return {
      compact: { box: 'min-w-8', value: 'py-1 text-sm' },
      card: { box: 'min-w-10', value: 'py-1.5 text-lg' },
      expanded: { box: 'min-w-12', value: 'py-2 text-2xl' },
    }[density];
  }

  /** Where a cell reads once the row wraps below the grid's width: initiative and name, then (after a line break) the defences under the initiative and the health bar beside them. */
  protected flowKindOf(cell: RowCell): number {
    switch (cell.field?.component) {
      case 'number':
        return 3;
      case 'healthbar':
        return 4;
      default:
        return this.kindOf(cell);
    }
  }

  /** The soft tint of the left rail: the side of the combatant, at a glance. */
  protected sideTint(side: string | null): string {
    switch (side) {
      case 'enemy':
        return 'bg-destructive/40';
      case 'player':
        return 'bg-success/40';
      case 'ally':
        return 'bg-mana/40';
      default:
        return side ? 'bg-muted' : '';
    }
  }

  /** Colour of the square before a side (a marker next to the text, which always says the side too). */
  protected sideColor(side: string | null): string {
    switch (side) {
      case 'enemy':
        return 'bg-destructive';
      case 'player':
        return 'bg-success';
      case 'ally':
        return 'bg-mana';
      default:
        return 'bg-muted-foreground';
    }
  }

  /** Label of a side: its translation when the rule's option has one (`enemy`, `player`, `ally`), else as written. */
  protected sideLabel(side: string): string {
    const key = `encounters.sides.${side}`;
    const label = this.translateService.instant(key);
    return label === key ? side : label;
  }

  /**
   * Size of an element while the row is too narrow for the grid and its elements wrap: small ones keep the
   * room they need, the others share the line, and statuses take a line of their own.
   */
  protected cellSizing(cell: RowCell, density: TrackerRowDensity): string {
    // The one-line row keeps its columns where they are from row to row (a DM scans down a column): every cell
    // that varies in width gets a fixed one, and the conditions take what is left.
    if (density === 'compact') {
      switch (cell.field?.component) {
        case undefined:
        case null:
          return 'w-36 shrink-0';
        case 'side':
          return 'w-40 shrink-0';
        case 'healthbar':
          // Takes whatever the line has left; the conditions keep a fixed share beside it once the row is wide.
          return 'min-w-60 flex-1';
        case 'statuses':
          return 'basis-full @2xl:w-72 @2xl:flex-none @2xl:basis-auto';
        case 'text':
          return 'w-40 shrink-0';
        default:
          return 'shrink-0';
      }
    }

    switch (cell.field?.component) {
      case undefined:
      case null:
        return 'min-w-28 flex-1 @2xl:min-w-0';
      case 'healthbar':
        // The quick HP (an amount and three icon buttons) is as wide as the bar needs: no line of its own.
        return 'min-w-44 flex-1 @2xl:min-w-0';
      case 'statuses':
        return 'basis-full @2xl:basis-auto';
      case 'text':
        return 'min-w-28 flex-1 @2xl:min-w-0';
      default:
        return 'shrink-0';
    }
  }

  /**
   * The quick HP of a row: the number typed beside the buttons is the amount of damage (temporary HP first), healing
   * (up to the maximum) or temporary HP. An empty field or one that is not a whole number does nothing.
   */
  protected applyHp(
    field: BattleRuleFieldDto,
    mode: HpChangeMode,
    amountField: HTMLInputElement,
  ): void {
    const amount = parseNumber(amountField.value);
    if (amount === null || amount < 0) {
      amountField.focus();
      return;
    }

    this.hpApply.emit({ field, mode, amount });
    // The field is emptied through an input event too: the input directive keeps its own copy of the value, and one
    // that is not told would show the amount again, ready to be applied a second time.
    amountField.value = '';
    amountField.dispatchEvent(new Event('input'));
  }

  /**
   * The status field is typed in place: `name`, space, `rounds`, space makes a tag; a second space right after the
   * name makes it without rounds. Enter and leaving the field make one too; Backspace on an empty field removes the
   * last tag and Escape clears the field.
   */
  protected onStatusKeydown(event: KeyboardEvent, field: BattleRuleFieldDto): void {
    const input = event.target as HTMLInputElement;
    if (event.isComposing) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitStatusInput(input, field);
    } else if (event.key === 'Escape') {
      input.value = '';
    } else if (event.key === 'Backspace' && input.value === '') {
      const count = this.statusesOf(field).length;
      if (count > 0) {
        event.preventDefault();
        this.statusRemove.emit({ field, index: count - 1 });
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
        this.commitStatusInput(input, field, name);
        input.value = rounds;
      } else {
        this.commitStatusInput(input, field);
      }
    }
  }

  /** Turns the text of the status field (`name` or `name rounds`) into a tag, then empties the field. */
  protected commitStatusInput(
    input: HTMLInputElement,
    field: BattleRuleFieldDto,
    text = input.value,
  ): void {
    const [name, rounds] = text.trim().split(/\s+/);
    input.value = '';
    if (!name) {
      return;
    }

    const count = rounds !== undefined && /^\d+$/.test(rounds) ? Number(rounds) : 0;
    this.statusAdd.emit({ field, name, rounds: count });
  }
}
