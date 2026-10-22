import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as L from 'leaflet';
import { toast } from 'ngx-sonner';

import {
  ENCOUNTER_EXTENSION_PATTERN,
  toAssetUrl,
  toInAppAssetRoute,
  toInAppMapRoute,
  toInAppNoteRoute,
} from '@/components/document-preview/document-preview.markdown';
import { AppDialogFormService } from '@/components/sheet-form/dialog-form.service';
import type { AppSheetField } from '@/components/sheet-form/sheet-form.types';
import {
  DEFAULT_NOTE_COLOR,
  DEFAULT_PATH_COLOR,
  DEFAULT_PATH_WIDTH,
  DEFAULT_PIN_COLOR,
  MAP_PATH_WIDTHS,
  mapColorVar,
} from '@/config/map.config';
import {
  MAP_COLORS,
  MAP_PIN_ICONS,
  type MapColor,
  type MapDto,
  type MapFileDto,
  type MapNoteDto,
  type MapPathDto,
  type MapPinDto,
  type MapPinIcon,
  type MapPointDto,
} from '@/dtos';
import { ASSET_FILE_PARAM, ASSET_SUBFOLDER_PARAM } from '@/pages/asset-page/asset-page';
import { CAMPAIGN_SECTION_PARAM } from '@/pages/campaign-section-page/campaign-section-page';
import { DocumentService } from '@/services/document.service';
import { FileActionsService } from '@/services/file-actions.service';
import { MapService } from '@/services/map.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import { ToolbarContextService, type ToolbarItemAction } from '@/services/toolbar-context.service';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechDialogService } from '@/shared/components/dialog';
import { ARCTECH_ICONS, ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

type MapTool = 'select' | 'pin' | 'path' | 'note';
type ItemKind = 'pin' | 'path' | 'note';
type ImageState = 'none' | 'loading' | 'ready' | 'missing';

interface Selection {
  readonly kind: ItemKind;
  readonly id: string;
}

/** A row of the panel's list of what the map holds. */
interface MapItemRow extends Selection {
  readonly label: string;
  readonly color: MapColor;
  readonly icon: ArcTechIcon;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Fraction coordinates are rounded so the file stays small and diffs stay quiet. */
const COORDINATE_PRECISION = 100000;
/** Clicks closer than this (px) to the last point of a path being drawn are one click (a double-click's first). */
const DUPLICATE_POINT_PIXELS = 4;
const FIT_PADDING_PIXELS = 24;
const NOTE_LABEL_MAX_LENGTH = 60;

function round(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

function isMapColor(value: unknown): value is MapColor {
  return MAP_COLORS.includes(value as MapColor);
}

function isPinIcon(value: unknown): value is MapPinIcon {
  return MAP_PIN_ICONS.includes(value as MapPinIcon);
}

/** A lucide icon as a DOM node, for the markers Leaflet draws outside Angular's templates. */
function createIconSvg(icon: ArcTechIcon): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes: Record<string, string> = {
    width: '16',
    height: '16',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  };
  for (const [name, value] of Object.entries(attributes)) {
    svg.setAttribute(name, value);
  }

  const data = typeof icon === 'string' ? ARCTECH_ICONS[icon] : icon;
  for (const [tag, nodeAttributes] of data) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(nodeAttributes)) {
      node.setAttribute(name, String(value));
    }

    svg.append(node);
  }

  return svg;
}

/**
 * An interactive map on its own page: an image of the scope's assets under Leaflet (zoom and pan), with pins,
 * coloured paths and free text notes on top. Everything is stored as fractions of the image, so the map survives
 * a replaced image of another size. Every edit is saved right away, with the conflict check of a note save.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-map-page',
  imports: [
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechTooltipImports,
  ],
  templateUrl: './map-page.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class MapPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scope = inject(NoteScopeService).scopeOf(getNoteScopeKind(this.route));
  private readonly sectionService = inject(SectionService);
  private readonly toolbarContext = inject(ToolbarContextService);
  private readonly translateService = inject(TranslateService);
  private readonly fileActions = inject(FileActionsService);
  private readonly mapService = inject(MapService);
  private readonly documentService = inject(DocumentService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly dialogService = inject(ArcTechDialogService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  private loadToken = 0;
  private isSaving = false;
  private needsSave = false;

  // Leaflet objects live outside signals; `viewVersion` tells the render effect when they changed.
  private leaflet: L.Map | null = null;
  private overlay: L.ImageOverlay | null = null;
  private layers: L.LayerGroup | null = null;
  private drawLayer: L.LayerGroup | null = null;
  private bounds: L.LatLngBounds | null = null;
  private imageSize: { readonly width: number; readonly height: number } | null = null;
  private shownImage: string | null = null;
  private drawPoints: MapPointDto[] = [];
  private cursor: L.LatLng | null = null;
  private readonly viewVersion = signal(0);
  private readonly isLeafletReady = signal(false);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly sectionKey = computed(() => this.params().get(CAMPAIGN_SECTION_PARAM) ?? '');
  private readonly subfolder = computed(() => this.params().get(ASSET_SUBFOLDER_PARAM));
  protected readonly fileName = computed(() => this.params().get(ASSET_FILE_PARAM) ?? '');

  /** Vault-relative path of the map file. */
  protected readonly mapPath = computed(() => {
    const folder = this.subfolder()
      ? `${this.sectionKey()}/${this.subfolder()}`
      : this.sectionKey();
    return `${this.scope()?.rootPath ?? ''}/${folder}/${this.fileName()}`;
  });
  /** The file as loaded or last saved (its hash is what the next save is checked against). */
  private readonly file = signal<MapFileDto | null>(null);
  protected readonly data = signal<MapDto | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly imageState = signal<ImageState>('none');
  protected readonly tool = signal<MapTool>('select');
  protected readonly selection = signal<Selection | null>(null);
  protected readonly isPanelOpen = signal(true);

  protected readonly parseError = computed(() => this.file()?.parseError ?? null);
  protected readonly title = computed(
    () => this.data()?.name ?? this.fileName().replace(ENCOUNTER_EXTENSION_PATTERN, ''),
  );
  /** A file that is not valid JSON opens empty; editing would replace it, so it stays read-only. */
  protected readonly isEditable = computed(
    () => this.data() !== null && !this.parseError() && this.imageState() === 'ready',
  );
  private readonly imagePath = computed(() => this.data()?.image ?? null);

  protected readonly tools: readonly {
    readonly tool: MapTool;
    readonly icon: ArcTechIcon;
    readonly label: string;
  }[] = [
    { tool: 'select', icon: 'mouse-pointer-2', label: 'maps.tools.select' },
    { tool: 'pin', icon: 'map-pin', label: 'maps.tools.pin' },
    { tool: 'path', icon: 'route', label: 'maps.tools.path' },
    { tool: 'note', icon: 'sticky-note', label: 'maps.tools.note' },
  ];
  protected readonly hint = computed(() => {
    const tool = this.tool();
    return tool === 'select' ? null : `maps.hint.${tool}`;
  });

  protected readonly selectedPin = computed(() => {
    const selection = this.selection();
    return selection?.kind === 'pin'
      ? (this.data()?.pins.find((pin) => pin.id === selection.id) ?? null)
      : null;
  });
  protected readonly selectedPath = computed(() => {
    const selection = this.selection();
    return selection?.kind === 'path'
      ? (this.data()?.paths.find((path) => path.id === selection.id) ?? null)
      : null;
  });
  protected readonly selectedNote = computed(() => {
    const selection = this.selection();
    return selection?.kind === 'note'
      ? (this.data()?.notes.find((note) => note.id === selection.id) ?? null)
      : null;
  });
  /** Everything on the map, for the panel's list. */
  protected readonly rows = computed<readonly MapItemRow[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }

    const unnamed = this.translateService.instant('maps.item.unnamed');
    return [
      ...data.pins.map((pin) => ({
        kind: 'pin' as const,
        id: pin.id,
        label: pin.label || unnamed,
        color: pin.color,
        icon: pin.icon,
      })),
      ...data.paths.map((path) => ({
        kind: 'path' as const,
        id: path.id,
        label: path.label || unnamed,
        color: path.color,
        icon: 'route' as const,
      })),
      ...data.notes.map((note) => ({
        kind: 'note' as const,
        id: note.id,
        label: this.noteSummary(note) || unnamed,
        color: note.color,
        icon: 'sticky-note' as const,
      })),
    ];
  });

  protected readonly colorVar = mapColorVar;

  constructor() {
    afterNextRender(() => this.initLeaflet());

    effect(() => {
      if (this.scope()) {
        void this.load(this.mapPath());
      }
    });

    effect(() => {
      const image = this.imagePath();
      if (this.isLeafletReady()) {
        untracked(() => this.showImage(image));
      }
    });

    // Layers follow the data, the selection and the tool (paths take no clicks while one is being drawn).
    effect(() => {
      this.data();
      this.selection();
      this.tool();
      this.viewVersion();
      this.isEditable();
      untracked(() => this.renderLayers());
    });

    effect(() => {
      const tool = this.tool();
      untracked(() => this.onToolChanged(tool));
    });

    effect((onCleanup) => {
      const scope = this.scope();
      if (!scope) {
        return;
      }

      const sectionPath = `${scope.routeBase}/${this.sectionKey()}`;
      const subfolder = this.subfolder();
      const actions: ToolbarItemAction[] = [
        {
          id: 'details',
          label: this.translateService.instant('maps.panel.toggle'),
          icon: 'panel-right',
          buttonType: this.isPanelOpen() ? 'default' : 'outline',
          iconOnly: true,
          action: () => this.isPanelOpen.update((isOpen) => !isOpen),
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
          buttonType: 'secondary',
          destructive: true,
          iconOnly: true,
          action: () => this.openDeleteSheet(),
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
          itemActions: actions,
        }),
      );
    });
  }

  // --- Leaflet -----------------------------------------------------------------------------------------

  private initLeaflet(): void {
    const container = this.canvas().nativeElement;
    const instance = L.map(container, {
      crs: L.CRS.Simple,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      doubleClickZoom: false,
      boxZoom: false,
      minZoom: -6,
      maxZoom: 6,
    });
    this.layers = L.layerGroup().addTo(instance);
    this.drawLayer = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => this.onMapClick(event));
    instance.on('dblclick', () => this.finishPath());
    instance.on('mousemove', (event: L.LeafletMouseEvent) => this.onMouseMove(event));

    // The panel slides in and out: the map's size follows.
    const observer = new ResizeObserver(() => instance.invalidateSize({ animate: false }));
    observer.observe(container);
    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      instance.remove();
      this.leaflet = null;
    });

    this.leaflet = instance;
    this.isLeafletReady.set(true);
  }

  /** Puts the map's image under Leaflet; a missing or unreadable one is a state of the page, not a crash. */
  private showImage(image: string | null): void {
    const instance = this.leaflet;
    if (!instance || image === this.shownImage) {
      return;
    }

    this.shownImage = image;
    this.overlay?.remove();
    this.overlay = null;
    this.imageSize = null;
    this.bounds = null;
    this.drawPoints = [];
    this.viewVersion.update((version) => version + 1);
    if (!image) {
      this.imageState.set('none');
      return;
    }

    this.imageState.set('loading');
    const url = toAssetUrl(image);
    const probe = new Image();
    probe.onload = () => {
      if (this.shownImage !== image || !this.leaflet) {
        return;
      }

      // An SVG without a size reports 0: give it a square to live in.
      const width = probe.naturalWidth || 1000;
      const height = probe.naturalHeight || 1000;
      this.imageSize = { width, height };
      this.bounds = L.latLngBounds([0, 0], [height, width]);
      this.overlay = L.imageOverlay(url, this.bounds).addTo(this.leaflet);
      this.leaflet.setMaxBounds(this.bounds.pad(0.5));
      this.leaflet.invalidateSize({ animate: false });
      const fitZoom = this.leaflet.getBoundsZoom(
        this.bounds,
        false,
        L.point(FIT_PADDING_PIXELS * 2, FIT_PADDING_PIXELS * 2),
      );
      this.leaflet.setMinZoom(fitZoom - 2);
      this.leaflet.setMaxZoom(fitZoom + 5);
      this.fit();
      this.imageState.set('ready');
      this.viewVersion.update((version) => version + 1);
    };
    probe.onerror = () => {
      if (this.shownImage === image) {
        this.imageState.set('missing');
      }
    };
    probe.src = url;
  }

  protected zoomIn(): void {
    this.leaflet?.zoomIn();
  }

  protected zoomOut(): void {
    this.leaflet?.zoomOut();
  }

  protected fit(): void {
    if (this.leaflet && this.bounds) {
      this.leaflet.invalidateSize({ animate: false });
      this.leaflet.fitBounds(this.bounds, {
        padding: [FIT_PADDING_PIXELS, FIT_PADDING_PIXELS],
        animate: false,
      });
    }
  }

  private toLatLng(point: MapPointDto): L.LatLngTuple {
    const size = this.imageSize ?? { width: 1, height: 1 };
    return [(1 - point.y) * size.height, point.x * size.width];
  }

  /** The point of the image under a Leaflet position; null outside the image. */
  private toPoint(latlng: L.LatLng): MapPointDto | null {
    const size = this.imageSize;
    if (!size || !this.bounds?.contains(latlng)) {
      return null;
    }

    return { x: round(latlng.lng / size.width), y: round(1 - latlng.lat / size.height) };
  }

  // --- Layers ------------------------------------------------------------------------------------------

  private renderLayers(): void {
    const layers = this.layers;
    const data = this.data();
    layers?.clearLayers();
    if (!layers || !data || !this.imageSize) {
      return;
    }

    const selection = this.selection();
    const tool = this.tool();
    const canEdit = this.isEditable() && tool === 'select';

    for (const path of data.paths) {
      this.addPathLayers(layers, path, selection?.id === path.id, tool === 'select', canEdit);
    }

    for (const pin of data.pins) {
      const marker = L.marker(this.toLatLng(pin), {
        icon: L.divIcon({
          html: this.buildPinElement(pin, selection?.id === pin.id),
          className: 'arc-map-marker',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        draggable: canEdit,
        interactive: tool !== 'path',
        title: pin.label,
        keyboard: true,
      });
      this.bindItem(marker, 'pin', pin.id, (point) => this.updatePin(pin.id, point));
      marker.addTo(layers);
    }

    for (const note of data.notes) {
      const marker = L.marker(this.toLatLng(note), {
        icon: L.divIcon({
          html: this.buildNoteElement(note, selection?.id === note.id),
          className: 'arc-map-marker',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        draggable: canEdit,
        interactive: tool !== 'path',
        keyboard: true,
      });
      this.bindItem(marker, 'note', note.id, (point) => this.updateNote(note.id, point));
      marker.addTo(layers);
    }
  }

  /** Click selects, double-click edits, a drag (select tool) moves the item. */
  private bindItem(
    marker: L.Marker,
    kind: ItemKind,
    id: string,
    move: (point: MapPointDto) => void,
  ): void {
    marker.on('click', () => this.selection.set({ kind, id }));
    marker.on('dblclick', () => {
      if (this.isEditable()) {
        void this.openEdit({ kind, id });
      }
    });
    marker.on('dragend', () => {
      const point = this.toPoint(marker.getLatLng());
      if (point) {
        move(point);
      } else {
        this.viewVersion.update((version) => version + 1); // dropped outside the image: back where it was
      }
    });
  }

  private addPathLayers(
    layers: L.LayerGroup,
    path: MapPathDto,
    isSelected: boolean,
    isClickable: boolean,
    canEdit: boolean,
  ): void {
    const latlngs = path.points.map((point) => this.toLatLng(point));
    const line = L.polyline(latlngs, {
      weight: path.width,
      className: `arc-map-path arc-map-color-${path.color}${isSelected ? ' is-selected' : ''}`,
      interactive: false,
    }).addTo(layers);
    // A wide invisible line under the pointer: a 3 px stroke is hard to hit.
    L.polyline(latlngs, {
      weight: 16,
      className: 'arc-map-path-hit',
      interactive: isClickable,
      bubblingMouseEvents: false,
    })
      .on('click', () => this.selection.set({ kind: 'path', id: path.id }))
      .on('dblclick', () => {
        if (this.isEditable()) {
          void this.openEdit({ kind: 'path', id: path.id });
        }
      })
      .addTo(layers);

    if (!isSelected || !canEdit) {
      return;
    }

    const vertices = path.points.map((point) =>
      L.marker(this.toLatLng(point), {
        icon: L.divIcon({
          className: 'arc-map-marker',
          html: '<span class="arc-map-vertex"></span>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        draggable: true,
      }),
    );
    vertices.forEach((vertex) => {
      vertex.on('drag', () => line.setLatLngs(vertices.map((item) => item.getLatLng())));
      vertex.on('dragend', () => {
        const points = vertices.map((item) => this.toPoint(item.getLatLng()));
        if (points.every((point): point is MapPointDto => point !== null)) {
          this.updatePath(path.id, { points });
        } else {
          this.viewVersion.update((version) => version + 1);
        }
      });
      vertex.addTo(layers);
    });
  }

  private buildPinElement(pin: MapPinDto, isSelected: boolean): HTMLElement {
    const root = document.createElement('div');
    root.className = `arc-map-pin arc-map-color-${pin.color}${isSelected ? ' is-selected' : ''}`;
    const dot = document.createElement('span');
    dot.className = 'arc-map-pin-dot';
    dot.append(createIconSvg(pin.icon));
    root.append(dot);
    if (pin.label) {
      const label = document.createElement('span');
      label.className = 'arc-map-pin-label';
      label.textContent = pin.label;
      root.append(label);
    }

    return root;
  }

  private buildNoteElement(note: MapNoteDto, isSelected: boolean): HTMLElement {
    const root = document.createElement('div');
    root.className = `arc-map-note arc-map-color-${note.color}${isSelected ? ' is-selected' : ''}`;
    root.textContent = note.text;
    return root;
  }

  // --- Tools -------------------------------------------------------------------------------------------

  protected selectTool(tool: MapTool): void {
    this.tool.set(tool);
  }

  private onToolChanged(tool: MapTool): void {
    this.leaflet?.getContainer().classList.toggle('arc-map-drawing', tool !== 'select');
    if (tool !== 'path') {
      this.cancelDraw();
    }
  }

  private onMapClick(event: L.LeafletMouseEvent): void {
    if (!this.isEditable()) {
      return;
    }

    const tool = this.tool();
    if (tool === 'select') {
      this.selection.set(null);
      return;
    }

    const point = this.toPoint(event.latlng);
    if (!point) {
      return;
    }

    if (tool === 'pin') {
      this.addPin(point);
    } else if (tool === 'note') {
      this.addNote(point);
    } else {
      this.addDrawPoint(point, event.latlng);
    }
  }

  private onMouseMove(event: L.LeafletMouseEvent): void {
    if (this.tool() === 'path' && this.drawPoints.length > 0) {
      this.cursor = event.latlng;
      this.refreshDraw();
    }
  }

  private addDrawPoint(point: MapPointDto, latlng: L.LatLng): void {
    const instance = this.leaflet;
    const last = this.drawPoints[this.drawPoints.length - 1];
    if (instance && last) {
      const lastPixel = instance.latLngToContainerPoint(this.toLatLng(last));
      if (lastPixel.distanceTo(instance.latLngToContainerPoint(latlng)) < DUPLICATE_POINT_PIXELS) {
        return;
      }
    }

    this.drawPoints = [...this.drawPoints, point];
    this.refreshDraw();
  }

  /** The path being drawn: the points so far, and a line to the cursor. */
  private refreshDraw(): void {
    const layer = this.drawLayer;
    if (!layer) {
      return;
    }

    layer.clearLayers();
    if (this.drawPoints.length === 0) {
      return;
    }

    const latlngs = this.drawPoints.map((point) => L.latLng(this.toLatLng(point)));
    L.polyline(this.cursor ? [...latlngs, this.cursor] : latlngs, {
      weight: DEFAULT_PATH_WIDTH,
      className: 'arc-map-draw',
      interactive: false,
    }).addTo(layer);
    for (const latlng of latlngs) {
      L.marker(latlng, {
        icon: L.divIcon({
          className: 'arc-map-marker',
          html: '<span class="arc-map-vertex"></span>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        interactive: false,
      }).addTo(layer);
    }
  }

  private cancelDraw(): void {
    this.drawPoints = [];
    this.cursor = null;
    this.drawLayer?.clearLayers();
  }

  private finishPath(): void {
    if (this.tool() !== 'path') {
      return;
    }

    const points = this.drawPoints;
    this.cancelDraw();
    if (points.length < 2) {
      return;
    }

    const path: MapPathDto = {
      id: crypto.randomUUID(),
      points,
      color: DEFAULT_PATH_COLOR,
      width: DEFAULT_PATH_WIDTH,
      label: '',
    };
    this.update((data) => ({ ...data, paths: [...data.paths, path] }));
    this.afterAdd({ kind: 'path', id: path.id });
  }

  /** A new item is selected, the tool goes back to *Select* and its form opens for the first details. */
  private afterAdd(selection: Selection): void {
    this.selection.set(selection);
    this.tool.set('select');
    void this.openEdit(selection, true);
  }

  private addPin(point: MapPointDto): void {
    const pin: MapPinDto = {
      id: crypto.randomUUID(),
      ...point,
      label: '',
      color: DEFAULT_PIN_COLOR,
      icon: 'map-pin',
      link: null,
    };
    this.update((data) => ({ ...data, pins: [...data.pins, pin] }));
    this.afterAdd({ kind: 'pin', id: pin.id });
  }

  private addNote(point: MapPointDto): void {
    const note: MapNoteDto = {
      id: crypto.randomUUID(),
      ...point,
      text: '',
      color: DEFAULT_NOTE_COLOR,
    };
    this.update((data) => ({ ...data, notes: [...data.notes, note] }));
    this.afterAdd({ kind: 'note', id: note.id });
  }

  private updatePin(id: string, patch: Partial<MapPinDto>): void {
    this.update((data) => ({
      ...data,
      pins: data.pins.map((pin) => (pin.id === id ? { ...pin, ...patch } : pin)),
    }));
  }

  private updateNote(id: string, patch: Partial<MapNoteDto>): void {
    this.update((data) => ({
      ...data,
      notes: data.notes.map((note) => (note.id === id ? { ...note, ...patch } : note)),
    }));
  }

  private updatePath(id: string, patch: Partial<MapPathDto>): void {
    this.update((data) => ({
      ...data,
      paths: data.paths.map((path) => (path.id === id ? { ...path, ...patch } : path)),
    }));
  }

  private noteSummary(note: MapNoteDto): string {
    const line = note.text.trim().split('\n')[0] ?? '';
    return line.length > NOTE_LABEL_MAX_LENGTH ? `${line.slice(0, NOTE_LABEL_MAX_LENGTH)}…` : line;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (
      event.defaultPrevented ||
      !this.leaflet ||
      target?.closest('input, textarea, select, [contenteditable="true"]') ||
      document.querySelector('[role="dialog"], [role="alertdialog"]')
    ) {
      return;
    }

    if (event.key === 'Escape') {
      if (this.drawPoints.length > 0) {
        this.cancelDraw();
      } else if (this.tool() !== 'select') {
        this.tool.set('select');
      } else {
        this.selection.set(null);
      }
    } else if (event.key === 'Enter' && this.tool() === 'path') {
      event.preventDefault();
      this.finishPath();
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.selection() &&
      this.isEditable()
    ) {
      event.preventDefault();
      this.confirmDelete();
    }
  }

  // --- Panel -------------------------------------------------------------------------------------------

  protected selectRow(row: MapItemRow): void {
    this.selection.set({ kind: row.kind, id: row.id });
    const data = this.data();
    const point =
      row.kind === 'path'
        ? data?.paths.find((path) => path.id === row.id)?.points[0]
        : (row.kind === 'pin' ? data?.pins : data?.notes)?.find((item) => item.id === row.id);
    if (point && this.imageSize) {
      this.leaflet?.panTo(this.toLatLng(point));
    }
  }

  protected clearSelection(): void {
    this.selection.set(null);
  }

  protected editSelected(): void {
    const selection = this.selection();
    if (selection) {
      void this.openEdit(selection);
    }
  }

  protected openLink(link: string): void {
    const route = toInAppAssetRoute(link) ?? toInAppNoteRoute(link) ?? toInAppMapRoute(link);
    if (route) {
      void this.router.navigateByUrl(route);
      return;
    }

    this.documentService.openFile(link).catch((error: unknown) =>
      toast.error(this.translateService.instant('document.media.openError'), {
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  protected linkName(link: string): string {
    return link.split('/').pop() ?? link;
  }

  protected colorLabel(color: MapColor): string {
    return this.translateService.instant(`maps.colors.${color}`);
  }

  // --- Edit and delete ---------------------------------------------------------------------------------

  private colorField(): AppSheetField {
    return {
      id: 'color',
      type: 'select',
      label: 'maps.item.color',
      translate: true,
      width: '1/2',
      options: MAP_COLORS.map((color) => ({
        value: color,
        label: `maps.colors.${color}`,
        translate: true,
        colorHex: mapColorVar(color),
      })),
    };
  }

  /** The form of an item (a modal: forms are never sheets). New items start with it, to name them. */
  private async openEdit(selection: Selection, isNew = false): Promise<void> {
    const data = this.data();
    if (!data) {
      return;
    }

    const cancel = this.translateService.instant('campaigns.sections.newNote.cancel');
    const save = this.translateService.instant('maps.item.save');

    if (selection.kind === 'pin') {
      const pin = data.pins.find((item) => item.id === selection.id);
      if (!pin) {
        return;
      }

      const targets = (await this.documentService.linkTargets(this.mapPath())).filter(
        (target) => target.path !== this.mapPath(),
      );
      this.dialogFormService.open({
        arcTitle: this.translateService.instant('maps.item.editPin'),
        arcOkText: save,
        arcCancelText: cancel,
        fields: [
          {
            id: 'label',
            type: 'input',
            label: 'maps.item.label',
            placeholder: 'maps.item.labelPlaceholder',
            translate: true,
          },
          this.colorField(),
          {
            id: 'icon',
            type: 'select',
            label: 'maps.item.icon',
            translate: true,
            width: '1/2',
            options: MAP_PIN_ICONS.map((icon) => ({
              value: icon,
              label: `maps.icons.${icon}`,
              translate: true,
              icon,
            })),
          },
          {
            id: 'link',
            type: 'combobox',
            label: 'maps.item.link',
            placeholder: 'maps.item.linkPlaceholder',
            searchPlaceholder: 'maps.item.linkSearch',
            emptyText: 'maps.item.linkEmpty',
            searchable: true,
            translate: true,
            options: [
              { value: '', label: 'maps.item.noLink', translate: true },
              ...targets.map((target) => ({
                value: target.path,
                label: target.title || target.name,
                translate: false,
              })),
            ],
          },
        ],
        values: { label: pin.label, color: pin.color, icon: pin.icon, link: pin.link ?? '' },
        onSubmit: (form) => {
          const values = form.getValues();
          const color = values['color'];
          const icon = values['icon'];
          this.updatePin(pin.id, {
            label: String(values['label'] ?? '').trim(),
            color: isMapColor(color) ? color : pin.color,
            icon: isPinIcon(icon) ? icon : pin.icon,
            link: String(values['link'] ?? '') || null,
          });
          return undefined;
        },
      });
      return;
    }

    if (selection.kind === 'path') {
      const path = data.paths.find((item) => item.id === selection.id);
      if (!path) {
        return;
      }

      this.dialogFormService.open({
        arcTitle: this.translateService.instant('maps.item.editPath'),
        arcOkText: save,
        arcCancelText: cancel,
        fields: [
          {
            id: 'label',
            type: 'input',
            label: 'maps.item.label',
            placeholder: 'maps.item.labelPlaceholder',
            translate: true,
          },
          this.colorField(),
          {
            id: 'width',
            type: 'select',
            label: 'maps.item.width',
            translate: true,
            width: '1/2',
            options: MAP_PATH_WIDTHS.map((width) => ({
              value: String(width),
              label: `${width} px`,
              translate: false,
            })),
          },
        ],
        values: { label: path.label, color: path.color, width: String(path.width) },
        onSubmit: (form) => {
          const values = form.getValues();
          const color = values['color'];
          const width = Number(values['width']);
          this.updatePath(path.id, {
            label: String(values['label'] ?? '').trim(),
            color: isMapColor(color) ? color : path.color,
            width: (MAP_PATH_WIDTHS as readonly number[]).includes(width) ? width : path.width,
          });
          return undefined;
        },
      });
      return;
    }

    const note = data.notes.find((item) => item.id === selection.id);
    if (!note) {
      return;
    }

    this.dialogFormService.open({
      arcTitle: this.translateService.instant('maps.item.editNote'),
      arcOkText: save,
      arcCancelText: cancel,
      fields: [
        {
          id: 'text',
          type: 'input',
          multiline: true,
          label: 'maps.item.text',
          placeholder: 'maps.item.textPlaceholder',
          required: true,
          translate: true,
        },
        this.colorField(),
      ],
      values: { text: note.text, color: note.color },
      onSubmit: (form) => {
        const values = form.getValues();
        const color = values['color'];
        this.updateNote(note.id, {
          text: String(values['text'] ?? '').trim(),
          color: isMapColor(color) ? color : note.color,
        });
        return undefined;
      },
      // A note cancelled right after it was placed would stay as an empty box: drop it.
      arcOnCancel: () => {
        if (isNew) {
          this.removeItem(selection);
        }
      },
    });
  }

  protected confirmDelete(): void {
    const selection = this.selection();
    if (!selection) {
      return;
    }

    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant('maps.item.deleteTitle'),
      arcDescription: this.translateService.instant('maps.item.deleteDescription'),
      arcOkText: this.translateService.instant('maps.item.delete'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => this.removeItem(selection),
    });
  }

  private removeItem(selection: Selection): void {
    this.update((data) => ({
      ...data,
      pins: data.pins.filter((item) => item.id !== selection.id),
      paths: data.paths.filter((item) => item.id !== selection.id),
      notes: data.notes.filter((item) => item.id !== selection.id),
    }));
    if (this.selection()?.id === selection.id) {
      this.selection.set(null);
    }
  }

  // --- Loading and saving ------------------------------------------------------------------------------

  private update(change: (data: MapDto) => MapDto): void {
    this.data.update((data) => (data ? change(data) : data));
    void this.save();
  }

  private async load(path: string): Promise<void> {
    const token = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const file = await this.mapService.read(path);
      if (token === this.loadToken) {
        this.file.set(file);
        this.data.set(file.map);
        this.selection.set(null);
        this.tool.set('select');
      }
    } catch (error) {
      if (token === this.loadToken) {
        this.file.set(null);
        this.data.set(null);
        this.errorMessage.set(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (token === this.loadToken) {
        this.isLoading.set(false);
      }
    }
  }

  /** Saves the map; changes made while a save runs are saved right after it, in order. */
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
        const map = this.data();
        if (!file || !map || file.parseError) {
          return;
        }

        const result = await this.mapService.write({
          path: file.path,
          map,
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
      toast.error(this.translateService.instant('maps.page.saveError'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isSaving = false;
    }
  }

  /** The file changed elsewhere while it was open: keep this version, or load the other one. */
  private openConflictSheet(current: MapFileDto): void {
    const dialogRef = this.dialogService.create({
      arcTitle: this.translateService.instant('maps.page.conflictTitle'),
      arcContent: this.translateService.instant('maps.page.conflictDescription'),
      arcOkText: this.translateService.instant('maps.page.keepMine'),
      arcOkDestructive: true,
      arcCancelText: this.translateService.instant('maps.page.loadOther'),
      arcOnOk: () => {
        // Overwrite: the next save is checked against the other version.
        this.file.set(current);
        void this.save();
        dialogRef.close();
        return false;
      },
      arcOnCancel: () => {
        this.file.set(current);
        this.data.set(current.map);
      },
    });
  }

  // --- File actions ------------------------------------------------------------------------------------

  /** *Rename*: links follow; the page (and its tab, in a campaign) moves to the new file name. */
  private openRenameSheet(): void {
    const oldPath = this.mapPath();
    void this.fileActions.openRenameAssetSheet(
      { path: oldPath, name: this.fileName(), label: this.title() },
      (newPath) => void this.followRename(oldPath, newPath),
    );
  }

  /** *Delete…* (to the system Trash); the page, and its tab in a campaign, go to the folder page. */
  private openDeleteSheet(): void {
    void this.fileActions.openDeleteSheet(
      { path: this.mapPath(), label: this.title(), isNote: false },
      (folderRoute) => {
        if (folderRoute && this.scope()?.kind === 'system') {
          void this.router.navigateByUrl(folderRoute, { replaceUrl: true });
        }
      },
    );
  }

  /** The map's `name` (what the page, the tab and the lists show) follows the new file name. */
  private async followRename(oldPath: string, newPath: string): Promise<void> {
    const oldRoute = toInAppMapRoute(oldPath);
    const newRoute = toInAppMapRoute(newPath);
    if (!oldRoute || !newRoute || oldRoute === newRoute) {
      return;
    }

    const newName = newPath.split('/').pop()?.replace(ENCOUNTER_EXTENSION_PATTERN, '') ?? '';
    try {
      const file = await this.mapService.read(newPath);
      if (!file.parseError && newName && file.map.name !== newName) {
        await this.mapService.write({
          path: newPath,
          map: { ...file.map, name: newName },
          expectedHash: file.contentHash,
        });
      }
    } catch (error) {
      console.warn('[app] Failed to rename the map inside its file:', newPath, error);
    }

    // A campaign tab already moved to the new route (and loaded the file as it was): show the new name.
    if (this.mapPath() === newPath) {
      await this.load(newPath);
    }

    if (this.scope()?.kind === 'system') {
      await this.router.navigateByUrl(newRoute, { replaceUrl: true });
    }
  }
}
