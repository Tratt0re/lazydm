import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import type { BattleFieldComponent, BattleRuleAreaDto, BattleRuleFieldDto } from '@/dtos';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechInputDirective } from '@/shared/components/input';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

/** The entity row is a grid of this many columns and (at most) this many rows. */
export const ROW_GRID_COLUMNS = 12;
export const ROW_GRID_ROWS_MAX = 4;

const NAME_ID = '$name';
const FRONTMATTER_PREFIX = 'frontmatter:';
const ENTITY_SOURCE = 'entity';
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const DEFAULT_SIDES = ['enemy', 'player', 'ally'];
/** Columns an element takes when it is added. */
const DEFAULT_SPANS: Record<string, number> = {
  name: 3,
  initiative: 1,
  number: 1,
  side: 1,
  'note-link': 1,
  healthbar: 3,
  text: 3,
  statuses: 6,
};
const ICONS: Record<string, ArcTechIcon> = {
  name: 'tag',
  initiative: 'dices',
  number: 'shield',
  text: 'text-quote',
  healthbar: 'heart',
  statuses: 'tags',
  side: 'flag',
  'note-link': 'file-text',
};
/** Types a rule can add (the initiative is in every rule already, once). */
const ADDABLE_COMPONENTS: readonly BattleFieldComponent[] = [
  'number',
  'text',
  'healthbar',
  'side',
  'statuses',
  'note-link',
];
/** Types whose value can come from a frontmatter key of the linked note. */
const NOTE_READABLE_COMPONENTS: readonly BattleFieldComponent[] = [
  'initiative',
  'number',
  'text',
  'healthbar',
];

/** What the rule keeps about the row: the field list (with their places) and the place of the name. */
export interface RowLayout {
  readonly fields: readonly BattleRuleFieldDto[];
  readonly nameArea: BattleRuleAreaDto;
}

/** An element of the mock row: the name or a field shown in the row. */
interface GridElement {
  readonly id: string;
  readonly component: BattleFieldComponent | 'name';
  readonly field: BattleRuleFieldDto | null;
  readonly area: BattleRuleAreaDto;
}

/** What is being dragged: an element of the row, a hidden field, or a new element of a type. */
type DragPayload =
  | { readonly kind: 'element'; readonly id: string }
  | { readonly kind: 'hidden'; readonly id: string }
  | { readonly kind: 'new'; readonly component: BattleFieldComponent };

interface DragState {
  readonly payload: DragPayload;
  readonly span: number;
  /** Columns between the left edge of the dragged element and where it was grabbed. */
  readonly grab: number;
}

interface DropPreview {
  readonly area: BattleRuleAreaDto;
  readonly isValid: boolean;
}

function overlaps(first: BattleRuleAreaDto, second: BattleRuleAreaDto): boolean {
  return (
    first.row === second.row &&
    first.column <= second.column + second.span - 1 &&
    second.column <= first.column + first.span - 1
  );
}

/**
 * The visual editor of a battle rule's entity row: a mock row (a grid of 12 columns) where each element — the name
 * and the rule's fields — sits where the real row will show it. Elements are dragged to another place; a gear on
 * each opens its settings (label, key, where its value comes from, its place and width). What the rule can still
 * add (hidden fields, new types) is in a palette below: drag one in, click it to put it in the first free place, or
 * drag an element out onto the palette to hide it. The name and the initiative are in every rule.
 */
@Component({
  selector: 'app-battle-rule-row-editor',
  imports: [
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechInputDirective,
    ...ArcTechSelectImports,
    ...ArcTechTooltipImports,
  ],
  templateUrl: './battle-rule-row-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
})
export class AppBattleRuleRowEditorComponent {
  private readonly translateService = inject(TranslateService);

  readonly fields = input.required<readonly BattleRuleFieldDto[]>();
  readonly nameArea = input.required<BattleRuleAreaDto>();
  /** Frontmatter keys of the rule's template: what a field can read from an entity's note. */
  readonly attributeKeys = input<readonly string[]>([]);
  readonly isReadOnly = input(false);
  readonly layoutChange = output<RowLayout>();

  protected readonly columns = Array.from({ length: ROW_GRID_COLUMNS }, (_, index) => index + 1);
  protected readonly addable = ADDABLE_COMPONENTS;
  protected readonly selectedId = signal<string | null>(null);
  protected readonly layoutError = signal<string | null>(null);
  private readonly drag = signal<DragState | null>(null);
  protected readonly preview = signal<DropPreview | null>(null);
  protected readonly isDragging = computed(() => this.drag() !== null);

  protected readonly elements = computed<readonly GridElement[]>(() => [
    { id: NAME_ID, component: 'name', field: null, area: this.nameArea() },
    ...this.fields()
      .filter((field) => field.showInRow)
      .map((field) => ({
        id: field.key,
        component: field.component,
        field,
        area: field.area ?? { row: 1, column: 1, span: 1 },
      })),
  ]);
  protected readonly hiddenFields = computed(() =>
    this.fields().filter((field) => !field.showInRow),
  );
  /** Rows shown: those in use, and one more to drop an element into (up to the limit). */
  protected readonly rows = computed(() => {
    const used = Math.max(1, ...this.elements().map((element) => element.area.row));
    return Array.from({ length: Math.min(ROW_GRID_ROWS_MAX, used + 1) }, (_, index) => index + 1);
  });
  protected readonly selected = computed(
    () => this.elements().find((element) => element.id === this.selectedId()) ?? null,
  );
  /** The initiative and the name are in every rule: they can be moved, not removed. */
  protected readonly isRequired = computed(() => {
    const selected = this.selected();
    return selected?.component === 'name' || selected?.component === 'initiative';
  });
  protected readonly sourceOptions = computed(() => {
    const field = this.selected()?.field;
    if (!field) {
      return [];
    }

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
  });

  protected icon(component: string): ArcTechIcon {
    return ICONS[component] ?? 'file';
  }

  protected componentLabel(component: string): string {
    return this.translateService.instant(`battleRules.components.${component}`);
  }

  /** The text of an element: its label (an i18n key of the built-in rule is translated). */
  protected elementLabel(element: GridElement): string {
    return element.field
      ? this.translateService.instant(element.field.label)
      : this.translateService.instant('encounters.entity.name');
  }

  protected fieldLabel(field: BattleRuleFieldDto): string {
    return this.translateService.instant(field.label);
  }

  protected canReadFromNote(field: BattleRuleFieldDto): boolean {
    return NOTE_READABLE_COMPONENTS.includes(field.component);
  }

  // --- Selecting ---------------------------------------------------------------------------------------

  protected toggleSettings(id: string): void {
    this.layoutError.set(null);
    this.selectedId.update((current) => (current === id ? null : id));
  }

  // --- Dragging ----------------------------------------------------------------------------------------

  protected onElementDragStart(event: DragEvent, element: GridElement): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const grab = Math.min(
      element.area.span - 1,
      Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * element.area.span)),
    );
    this.startDrag(event, { kind: 'element', id: element.id }, element.area.span, grab);
  }

  protected onHiddenDragStart(event: DragEvent, field: BattleRuleFieldDto): void {
    this.startDrag(
      event,
      { kind: 'hidden', id: field.key },
      field.area?.span ?? DEFAULT_SPANS[field.component] ?? 1,
      0,
    );
  }

  protected onNewDragStart(event: DragEvent, component: BattleFieldComponent): void {
    this.startDrag(event, { kind: 'new', component }, DEFAULT_SPANS[component] ?? 1, 0);
  }

  private startDrag(event: DragEvent, payload: DragPayload, span: number, grab: number): void {
    event.dataTransfer?.setData('text/plain', 'battle-rule-element');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.drag.set({ payload, span, grab });
  }

  protected onDragEnd(): void {
    this.drag.set(null);
    this.preview.set(null);
  }

  /** Where the dragged element would land in the grid row `row`, from the pointer. */
  private getTarget(event: DragEvent, row: number): DropPreview | null {
    const drag = this.drag();
    if (!drag) {
      return null;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const pointerColumn = Math.min(
      ROW_GRID_COLUMNS,
      Math.max(1, Math.floor(((event.clientX - rect.left) / rect.width) * ROW_GRID_COLUMNS) + 1),
    );
    const column = Math.min(
      ROW_GRID_COLUMNS - drag.span + 1,
      Math.max(1, pointerColumn - drag.grab),
    );
    const area = { row, column, span: drag.span };
    const ignoredId = drag.payload.kind === 'new' ? null : drag.payload.id;
    return { area, isValid: this.isFree(area, ignoredId) };
  }

  protected onGridDragOver(event: DragEvent, row: number): void {
    const target = this.getTarget(event, row);
    if (!target) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = target.isValid ? 'move' : 'none';
    }
    this.preview.set(target);
  }

  protected onGridDrop(event: DragEvent, row: number): void {
    event.preventDefault();
    const drag = this.drag();
    const target = this.getTarget(event, row);
    this.onDragEnd();
    if (!drag || !target) {
      return;
    }

    if (!target.isValid) {
      this.layoutError.set(this.translateService.instant('battleRules.row.overlap'));
      return;
    }

    this.layoutError.set(null);
    this.apply(drag.payload, target.area);
  }

  /** Dropping an element on the palette hides it (the name and the initiative stay). */
  protected onPaletteDragOver(event: DragEvent): void {
    const drag = this.drag();
    if (drag?.payload.kind === 'element' && !this.isRequiredId(drag.payload.id)) {
      event.preventDefault();
    }
  }

  protected onPaletteDrop(event: DragEvent): void {
    event.preventDefault();
    const drag = this.drag();
    this.onDragEnd();
    if (drag?.payload.kind === 'element' && !this.isRequiredId(drag.payload.id)) {
      this.hide(drag.payload.id);
    }
  }

  private isRequiredId(id: string): boolean {
    return (
      id === NAME_ID || this.fields().find((field) => field.key === id)?.component === 'initiative'
    );
  }

  private apply(payload: DragPayload, area: BattleRuleAreaDto): void {
    if (payload.kind === 'new') {
      this.create(payload.component, area);
    } else {
      this.place(payload.id, area);
    }
  }

  // --- Changing the layout -----------------------------------------------------------------------------

  private emit(
    fields: readonly BattleRuleFieldDto[],
    nameArea: BattleRuleAreaDto = this.nameArea(),
  ): void {
    this.layoutChange.emit({ fields, nameArea });
  }

  /** Whether `area` is inside the grid and no element but `ignoredId` is in the way. */
  private isFree(area: BattleRuleAreaDto, ignoredId: string | null): boolean {
    return (
      area.row >= 1 &&
      area.row <= ROW_GRID_ROWS_MAX &&
      area.column >= 1 &&
      area.span >= 1 &&
      area.column + area.span - 1 <= ROW_GRID_COLUMNS &&
      !this.elements().some((element) => element.id !== ignoredId && overlaps(area, element.area))
    );
  }

  /** Moves an element (or shows a hidden field) to `area`. */
  private place(id: string, area: BattleRuleAreaDto): void {
    if (id === NAME_ID) {
      this.emit(this.fields(), area);
    } else {
      this.emit(
        this.fields().map((field) =>
          field.key === id ? { ...field, showInRow: true, area } : field,
        ),
      );
    }
  }

  private hide(id: string): void {
    this.emit(
      this.fields().map((field) => (field.key === id ? { ...field, showInRow: false } : field)),
    );
    if (this.selectedId() === id) {
      this.selectedId.set(null);
    }
  }

  private create(component: BattleFieldComponent, area: BattleRuleAreaDto): void {
    const base = component.replace('-', '_');
    const taken = new Set(this.fields().map((field) => field.key));
    let key = base;
    for (let index = 2; taken.has(key); index++) {
      key = `${base}_${index}`;
    }

    this.emit([
      ...this.fields(),
      {
        key,
        component,
        label: key,
        source: ENTITY_SOURCE,
        showInRow: true,
        area,
        ...(component === 'side' ? { options: DEFAULT_SIDES } : {}),
      },
    ]);
    this.selectedId.set(key);
  }

  /** The first free place for `span` columns (narrower when the rows are crowded); null when there is none. */
  private findFreeArea(span: number): BattleRuleAreaDto | null {
    for (let width = span; width >= 1; width--) {
      for (let row = 1; row <= ROW_GRID_ROWS_MAX; row++) {
        for (let column = 1; column + width - 1 <= ROW_GRID_COLUMNS; column++) {
          const area = { row, column, span: width };
          if (this.isFree(area, null)) {
            return area;
          }
        }
      }
    }

    return null;
  }

  /** A click on a palette chip: the element goes in the first free place. */
  private addToRow(payload: DragPayload & { kind: 'hidden' | 'new' }): void {
    const span =
      payload.kind === 'new'
        ? (DEFAULT_SPANS[payload.component] ?? 1)
        : (this.hiddenFields().find((field) => field.key === payload.id)?.area?.span ?? 1);
    const area = this.findFreeArea(span);
    if (!area) {
      this.layoutError.set(this.translateService.instant('battleRules.row.noRoom'));
      return;
    }

    this.layoutError.set(null);
    this.apply(payload, area);
    if (payload.kind === 'hidden') {
      this.selectedId.set(payload.id);
    }
  }

  protected addNew(component: BattleFieldComponent): void {
    this.addToRow({ kind: 'new', component });
  }

  protected showHidden(field: BattleRuleFieldDto): void {
    this.addToRow({ kind: 'hidden', id: field.key });
  }

  // --- Settings of the selected element ---------------------------------------------------------------

  /** Row, column or width typed in the settings: applied when it fits, else explained. */
  protected setAreaPart(part: 'row' | 'column' | 'span', text: string): void {
    const selected = this.selected();
    const value = Number.parseInt(text, 10);
    if (!selected || !Number.isInteger(value)) {
      return;
    }

    const area = { ...selected.area, [part]: value };
    if (!this.isFree(area, selected.id)) {
      this.layoutError.set(this.translateService.instant('battleRules.row.overlap'));
      return;
    }

    this.layoutError.set(null);
    this.place(selected.id, area);
  }

  /** The arrow buttons of the settings: one column or one row at a time. */
  protected nudge(columns: number, rows: number): void {
    const selected = this.selected();
    if (!selected) {
      return;
    }

    const area = {
      ...selected.area,
      column: selected.area.column + columns,
      row: selected.area.row + rows,
    };
    if (!this.isFree(area, selected.id)) {
      this.layoutError.set(this.translateService.instant('battleRules.row.overlap'));
      return;
    }

    this.layoutError.set(null);
    this.place(selected.id, area);
  }

  protected updateField(id: string, change: Partial<BattleRuleFieldDto>): void {
    this.emit(this.fields().map((field) => (field.key === id ? { ...field, ...change } : field)));
  }

  protected setKey(id: string, text: string): void {
    const key = text.trim().toLocaleLowerCase();
    const isTaken = this.fields().some((field) => field.key !== id && field.key === key);
    if (!FIELD_KEY_PATTERN.test(key) || isTaken) {
      this.layoutError.set(this.translateService.instant('battleRules.row.keyInvalid'));
      return;
    }

    this.layoutError.set(null);
    this.updateField(id, { key });
    this.selectedId.set(key);
  }

  protected setSides(id: string, text: string): void {
    this.updateField(id, {
      options: text
        .split(',')
        .map((option) => option.trim())
        .filter(Boolean),
    });
  }

  protected hideSelected(): void {
    const selected = this.selected();
    if (selected && !this.isRequired()) {
      this.hide(selected.id);
    }
  }

  protected deleteField(field: BattleRuleFieldDto): void {
    if (field.component === 'initiative') {
      return;
    }

    this.emit(this.fields().filter((candidate) => candidate.key !== field.key));
    if (this.selectedId() === field.key) {
      this.selectedId.set(null);
    }
  }
}
