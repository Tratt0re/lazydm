import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import {
  DRAWING_CELL as CELL,
  DRAWING_HISTORY_MAX,
  DRAWING_TOOLS,
  DRAWING_ZOOM_MAX,
  DRAWING_ZOOM_MIN,
  type DrawingTool,
} from '@/config/map-drawing.config';
import {
  MAP_DRAWING_BORDERS,
  MAP_DRAWING_FORMATS,
  MAP_DRAWING_GRIDS,
  MAP_DRAWING_RESOLUTIONS,
  MAP_DRAWING_THEMES,
  type MapDrawingDto,
  type MapDrawingPoint,
  type MapDrawingStyleDto,
} from '@/dtos';
import { withShortcut } from '@/config/shortcuts.config';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechSelectImports } from '@/shared/components/select';
import { ArcTechSwitchComponent } from '@/shared/components/switch';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

import { carve, cellOf, doorAt, shapes, snap } from './map-drawing.geometry';
import { drawScene } from './map-drawing.render';

/** What an undo step remembers: the drawn content, not the view options. */
type Content = Pick<MapDrawingDto, 'floor' | 'doors' | 'texts'>;

type StyleKey = 'grid' | 'border' | 'theme' | 'format' | 'resolution' | 'quality';

interface StyleOption {
  readonly key: StyleKey;
  readonly label: string;
  readonly values: readonly (string | number)[];
  /** Translation prefix of each value; none when the value reads as it is (a number). */
  readonly valueLabel: string | null;
}

/** Quality steps of the JPG export (a few presets instead of a free slider). */
const JPG_QUALITIES = [60, 75, 85, 92, 100] as const;

const STYLE_OPTIONS: readonly StyleOption[] = [
  {
    key: 'grid',
    label: 'maps.drawing.view.grid',
    values: MAP_DRAWING_GRIDS,
    valueLabel: 'maps.drawing.view.grids',
  },
  {
    key: 'border',
    label: 'maps.drawing.view.border',
    values: MAP_DRAWING_BORDERS,
    valueLabel: 'maps.drawing.view.borders',
  },
  {
    key: 'theme',
    label: 'maps.drawing.view.theme',
    values: MAP_DRAWING_THEMES,
    valueLabel: 'maps.drawing.view.themes',
  },
  {
    key: 'format',
    label: 'maps.drawing.export.format',
    values: MAP_DRAWING_FORMATS,
    valueLabel: 'maps.drawing.export.formats',
  },
  {
    key: 'resolution',
    label: 'maps.drawing.export.resolution',
    values: MAP_DRAWING_RESOLUTIONS,
    valueLabel: 'maps.drawing.export.resolutions',
  },
  { key: 'quality', label: 'maps.drawing.export.quality', values: JPG_QUALITIES, valueLabel: null },
];

interface Drag {
  readonly pan?: boolean;
  readonly shape?: boolean;
  /** Where the drag started, in world pixels (a pan keeps the pointer offset instead). */
  readonly a: MapDrawingPoint;
  b: MapDrawingPoint;
}

/**
 * The map drawing editor: a canvas with tools, undo/redo and view/export options. It edits a copy of the drawing
 * and reports every change (`drawingChange`) so the page saves it right away; the image is made by the page.
 */
@Component({
  selector: 'app-map-drawing-editor',
  imports: [
    TranslatePipe,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechSelectImports,
    ArcTechSwitchComponent,
    ArcTechTooltipImports,
  ],
  templateUrl: './map-drawing-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block size-full outline-none',
    tabindex: '-1',
    '(keydown)': 'onKeydown($event)',
    '(keyup)': 'onKeyup($event)',
  },
})
export class AppMapDrawingEditorComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly translateService = inject(TranslateService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  /** The drawing to start from; later changes come from the editor itself. */
  readonly drawing = input.required<MapDrawingDto>();
  /** Every change of the drawing (shape, door, text, view option). */
  readonly drawingChange = output<MapDrawingDto>();
  /** *Done*: the page makes the image and shows the map again. */
  readonly done = output<void>();

  protected readonly state = signal<MapDrawingDto | null>(null);
  protected readonly tool = signal<DrawingTool>('rect');
  protected readonly isErasing = signal(false);
  protected readonly isOptionsOpen = signal(false);
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  protected readonly tools = DRAWING_TOOLS;
  protected readonly styleOptions = STYLE_OPTIONS;
  protected readonly withShortcut = withShortcut;
  protected readonly isJpg = computed(() => this.state()?.style.format === 'jpg');

  private view = { x: 0, y: 0, z: 1 };
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private drag: Drag | null = null;
  private points: MapDrawingPoint[] = [];
  private mouse: MapDrawingPoint = [0, 0];
  private frame = 0;
  private hasFitted = false;

  constructor() {
    afterNextRender(() => {
      this.state.set(this.drawing());
      const element = this.host.nativeElement;
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(element);
      element.focus();
      inject(DestroyRef).onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(this.frame);
      });
    });
  }

  protected label(option: StyleOption, value: string | number): string {
    return option.valueLabel
      ? this.translateService.instant(`${option.valueLabel}.${value}`)
      : String(value);
  }

  protected styleValue(key: StyleKey): string {
    return String(this.state()?.style[key] ?? '');
  }

  protected setStyle(key: StyleKey, raw: string | string[]): void {
    const option = STYLE_OPTIONS.find((item) => item.key === key);
    const value = option?.values.find((item) => String(item) === String(raw));
    if (value !== undefined) {
      this.patch({ style: { ...this.current().style, [key]: value } as MapDrawingStyleDto });
    }
  }

  protected setShadow(shadow: boolean): void {
    this.patch({ style: { ...this.current().style, shadow } });
  }

  protected toolLabel(id: DrawingTool): string {
    return `maps.drawing.tools.${id}`;
  }

  protected setTool(id: DrawingTool): void {
    this.tool.set(id);
    this.points = [];
    this.drag = null;
    this.schedule();
  }

  protected setErase(value: boolean): void {
    this.isErasing.set(value);
    this.schedule();
  }

  protected toggleOptions(): void {
    this.isOptionsOpen.update((open) => !open);
  }

  protected fit(): void {
    const element = this.host.nativeElement;
    const { clientWidth: width, clientHeight: height } = element;
    const { cols, rows } = this.current();
    const z = Math.max(
      DRAWING_ZOOM_MIN,
      Math.min(1.5, (width - 120) / (cols * CELL), (height - 180) / (rows * CELL)),
    );
    this.view = { z, x: width / 2 - (cols * CELL * z) / 2, y: height / 2 - (rows * CELL * z) / 2 };
    this.schedule();
  }

  protected undo(): void {
    this.travel(this.undoStack, this.redoStack);
  }

  protected redo(): void {
    this.travel(this.redoStack, this.undoStack);
  }

  /** *Clear the map*, after a confirmation; undo brings it back. */
  protected askClear(): void {
    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('maps.drawing.clear.title'),
      arcDescription: this.translateService.instant('maps.drawing.clear.description'),
      arcOkText: this.translateService.instant('maps.drawing.clear.confirm'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => this.commit({ floor: [], doors: [], texts: [] }),
    });
  }

  // --- State ---------------------------------------------------------------------------------------------

  private current(): MapDrawingDto {
    return this.state() ?? this.drawing();
  }

  private content(): Content {
    const { floor, doors, texts } = this.current();
    return { floor, doors, texts };
  }

  private patch(change: Partial<MapDrawingDto>): void {
    const next = { ...this.current(), ...change };
    this.state.set(next);
    this.drawingChange.emit(next);
    this.schedule();
  }

  /** A change of the content: remembered for undo only when something really changed. */
  private commit(change: Partial<Content>): void {
    const before = JSON.stringify(this.content());
    const next = { ...this.content(), ...change };
    if (JSON.stringify(next) !== before) {
      this.undoStack.push(before);
      if (this.undoStack.length > DRAWING_HISTORY_MAX) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this.patch(next);
      this.updateHistoryFlags();
    }
  }

  private travel(from: string[], to: string[]): void {
    const snapshot = from.pop();
    if (snapshot) {
      to.push(JSON.stringify(this.content()));
      this.patch(JSON.parse(snapshot) as Content);
      this.updateHistoryFlags();
    }
  }

  private updateHistoryFlags(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }

  private carveShapes(list: ReturnType<typeof shapes>): void {
    const { floor, doors, cols, rows } = this.current();
    if (list.length > 0) {
      const result = carve(floor, doors, list, this.isErasing(), { cols, rows });
      this.commit({ floor: result.floor, doors: result.doors });
    }
  }

  // --- Pointer ---------------------------------------------------------------------------------------------

  private world(event: PointerEvent | WheelEvent): MapDrawingPoint {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    return [
      (event.clientX - rect.left - this.view.x) / this.view.z,
      (event.clientY - rect.top - this.view.y) / this.view.z,
    ];
  }

  /** A point kept on the sheet, so a shape never starts or ends off it. */
  private onSheet(p: MapDrawingPoint): MapDrawingPoint {
    const { cols, rows } = this.current();
    return [Math.max(0, Math.min(cols * CELL, p[0])), Math.max(0, Math.min(rows * CELL, p[1]))];
  }

  private point(p: MapDrawingPoint): MapDrawingPoint {
    const clamped = this.onSheet(p);
    return this.tool() === 'corr' ? cellOf(clamped) : snap(clamped);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.host.nativeElement.focus();
    const target = event.currentTarget as HTMLCanvasElement;
    target.setPointerCapture(event.pointerId);
    const p = this.world(event);
    const tool = this.tool();
    if (tool === 'pan' || event.button === 1 || event.button === 2) {
      this.drag = {
        pan: true,
        a: [event.clientX - this.view.x, event.clientY - this.view.y],
        b: p,
      };
      return;
    }
    if (event.button !== 0) {
      return;
    }

    if (tool === 'rect' || tool === 'circle' || tool === 'corr') {
      this.drag = { shape: true, a: this.point(p), b: this.point(p) };
    } else if (tool === 'poly') {
      const q = snap(this.onSheet(p));
      const first = this.points[0];
      const last = this.points[this.points.length - 1];
      if (this.points.length > 2 && q[0] === first[0] && q[1] === first[1]) {
        this.closePoly();
        return;
      }
      if (!last || q[0] !== last[0] || q[1] !== last[1]) {
        this.points.push(q);
      }
      this.schedule();
    } else if (tool === 'door') {
      this.placeDoor(p);
    }
  }

  private placeDoor(p: MapDrawingPoint): void {
    const { floor, doors } = this.current();
    const index = doors.findIndex((door) => Math.hypot(door.x - p[0], door.y - p[1]) < 18);
    if (index >= 0) {
      this.commit({ doors: doors.filter((_, i) => i !== index) });
      return;
    }

    // The door snaps to the nearest side of a square: on a wall or in a gap.
    const door = doorAt(floor, doors, p);
    if (door) {
      this.commit({ doors: [...doors, door] });
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    this.mouse = this.world(event);
    if (this.drag?.pan) {
      this.view = {
        ...this.view,
        x: event.clientX - this.drag.a[0],
        y: event.clientY - this.drag.a[1],
      };
      this.schedule();
    } else if (this.drag) {
      this.drag.b = this.point(this.mouse);
      this.schedule();
    } else if (this.points.length > 0) {
      this.schedule();
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.tool() === 'text' && !this.drag && event.button === 0) {
      this.editText(this.world(event));
      return;
    }

    const drag = this.drag;
    this.drag = null;
    const tool = this.tool();
    if (drag?.shape && (tool === 'rect' || tool === 'circle' || tool === 'corr')) {
      this.carveShapes(shapes(tool, drag.a, this.point(this.world(event))));
      this.schedule();
    }
  }

  protected onPointerCancel(): void {
    this.drag = null;
    this.schedule();
  }

  protected onDoubleClick(): void {
    if (this.tool() === 'poly') {
      this.closePoly();
    }
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    const z = Math.max(
      DRAWING_ZOOM_MIN,
      Math.min(DRAWING_ZOOM_MAX, this.view.z * Math.exp(-event.deltaY * 0.0015)),
    );
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    this.view = {
      x: cx - ((cx - this.view.x) * z) / this.view.z,
      y: cy - ((cy - this.view.y) * z) / this.view.z,
      z,
    };
    this.schedule();
  }

  private closePoly(): void {
    if (this.points.length > 2) {
      const ring = [...this.points, this.points[0]];
      this.points = [];
      this.carveShapes([[ring]]);
    }
    this.schedule();
  }

  /** Writes or edits the text at a point; an empty text deletes it. */
  private editText(p: MapDrawingPoint): void {
    const { texts } = this.current();
    const index = texts.findIndex(
      (text) => Math.abs(text.x - p[0]) < text.s.length * 6 + 10 && Math.abs(text.y - p[1]) < 14,
    );
    const at = this.onSheet(p);
    this.dialogFormService.open({
      arcTitle: this.translateService.instant('maps.drawing.text.title'),
      arcOkText: this.translateService.instant('maps.item.save'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      fields: [
        {
          id: 'text',
          type: 'input',
          label: 'maps.drawing.text.label',
          placeholder: 'maps.drawing.text.placeholder',
          translate: true,
        },
      ],
      values: { text: index >= 0 ? texts[index].s : '' },
      onSubmit: (form) => {
        const s = String(form.getValues()['text'] ?? '').trim();
        const list = this.current().texts;
        if (index < 0) {
          if (s) {
            this.commit({ texts: [...list, { x: at[0], y: at[1], s }] });
          }
        } else if (s) {
          this.commit({ texts: list.map((text, i) => (i === index ? { ...text, s } : text)) });
        } else {
          this.commit({ texts: list.filter((_, i) => i !== index) });
        }
        return undefined;
      },
    });
  }

  // --- Keyboard ----------------------------------------------------------------------------------------------

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.target as HTMLElement).closest('input, textarea, select')) {
      return;
    }

    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === 'z') {
        event.preventDefault();
        event.shiftKey ? this.redo() : this.undo();
      } else if (key === 'y') {
        event.preventDefault();
        this.redo();
      }
      return;
    }

    if (key === 'shift') {
      this.setErase(true);
    } else if (key === 'e') {
      this.setErase(!this.isErasing());
    } else if (key === 'escape') {
      this.points = [];
      this.drag = null;
      this.schedule();
    } else if (key === 'enter' && this.tool() === 'poly') {
      this.closePoly();
    } else {
      const tool = DRAWING_TOOLS.find((item) => item.key.toLowerCase() === key);
      if (tool) {
        this.setTool(tool.id);
      }
    }
  }

  protected onKeyup(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.setErase(false);
    }
  }

  // --- Canvas ------------------------------------------------------------------------------------------------

  private resize(): void {
    const canvas = this.canvas().nativeElement;
    const element = this.host.nativeElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = element.clientWidth * dpr;
    canvas.height = element.clientHeight * dpr;
    if (!this.hasFitted && element.clientWidth > 0) {
      this.hasFitted = true;
      this.fit();
    }
    this.schedule();
  }

  private schedule(): void {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
    }
  }

  private draw(): void {
    const canvas = this.canvas().nativeElement;
    const g = canvas.getContext('2d');
    const drawing = this.state();
    if (!g || !drawing) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const { x, y, z } = this.view;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * x, dpr * y);
    const w = drawing.cols * CELL;
    const h = drawing.rows * CELL;
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    drawScene(g, drawing, { x: 0, y: 0, w, h });
    g.restore();

    // The chrome of the editor follows the app theme; the map itself keeps its own colours.
    const css = getComputedStyle(this.host.nativeElement);
    g.strokeStyle = css.getPropertyValue('--border').trim() || '#888';
    g.lineWidth = 1.5 / z;
    g.strokeRect(0, 0, w, h);

    const preview =
      css.getPropertyValue(this.isErasing() ? '--destructive' : '--primary').trim() || '#48f';
    g.fillStyle = preview;
    g.strokeStyle = preview;
    g.lineWidth = 1.5 / z;
    const tool = this.tool();
    if (this.drag?.shape && (tool === 'rect' || tool === 'circle' || tool === 'corr')) {
      for (const shape of shapes(tool, this.drag.a, this.drag.b)) {
        this.trace(g, shape[0]);
      }
    }
    if (this.points.length > 0) {
      this.trace(g, [...this.points, snap(this.onSheet(this.mouse))]);
    }
  }

  private trace(g: CanvasRenderingContext2D, ring: readonly MapDrawingPoint[]): void {
    g.beginPath();
    ring.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.globalAlpha = 0.25;
    g.fill();
    g.globalAlpha = 1;
    g.stroke();
  }
}
