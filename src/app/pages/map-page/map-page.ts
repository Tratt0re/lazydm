import { CdkContextMenuTrigger } from '@angular/cdk/menu';
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
import { LocalPreferencesService } from '@/services/local-preferences.service';
import { MapService } from '@/services/map.service';
import { getNoteScopeKind, NoteScopeService } from '@/services/note-scope.service';
import { SectionService, toSubfolderLabel } from '@/services/section.service';
import { ToolbarContextService, type ToolbarItemAction } from '@/services/toolbar-context.service';
import { WorkspaceService } from '@/services/workspace.service';
import { ArcTechAlertDialogService } from '@/shared/components/alert-dialog';
import { ArcTechAlertComponent } from '@/shared/components/alert';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechDialogService } from '@/shared/components/dialog';
import { ARCTECH_ICONS, ArcTechIconComponent, type ArcTechIcon } from '@/shared/components/icon';
import { ArcTechMenuImports } from '@/shared/components/menu';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

type MapTool = 'interact' | 'select' | 'pin' | 'path' | 'note';
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

/** What the context menu is about: the empty map (the point under the pointer) or an item. */
type MenuTarget =
  | { readonly kind: 'map'; readonly point: MapPointDto | null; readonly anchor: L.Point }
  | { readonly kind: 'item'; readonly item: Selection };

/** The Leaflet layers drawn for an item, found again by id while a group of items is being moved. */
interface ItemLayers {
  marker?: L.Marker;
  /** Polylines and polygons (a polygon is a polyline in Leaflet, but the types do not say so). */
  lines: (L.Polyline | L.Polygon)[];
}

/** Items being moved together: where the pointer holds them and how far it has taken them. */
interface GroupDrag {
  readonly origin: L.LatLng;
  readonly anchorId: string;
  readonly ids: ReadonlySet<string>;
  readonly base: ReadonlyMap<string, readonly L.LatLng[]>;
  readonly limits: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  delta: { lat: number; lng: number };
}

interface PixelRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Fraction coordinates are rounded so the file stays small and diffs stay quiet. */
const COORDINATE_PRECISION = 100000;
const FIT_PADDING_PIXELS = 24;
const NOTE_LABEL_MAX_LENGTH = 60;
/** A click this close (px) to a point of the path being drawn lands on that point. */
const CLOSE_PATH_PIXELS = 14;
/** The zoom follows its target by this share of the distance each frame (about 120 ms to settle). */
const ZOOM_EASING = 0.22;
const ZOOM_SETTLED = 0.002;
/** Wheel / pinch deltas (px) become zoom levels with these factors; a pinch arrives as ctrl + wheel. */
const WHEEL_ZOOM_PER_PIXEL = 0.0022;
const PINCH_ZOOM_PER_PIXEL = 0.012;
const WHEEL_DELTA_MAX = 240;
const BUTTON_ZOOM_STEP = 0.75;
/** A rectangle smaller than this (px) is a click. */
const MARQUEE_MIN_PIXELS = 4;
/** The pointer has to travel this far (px) before holding an item becomes moving it. */
const DRAG_START_PIXELS = 4;
/** The click that ends a drag is ignored for this long (ms): it would collapse the selection just moved. */
const CLICK_AFTER_DRAG_MS = 80;
const VIEW_SAVE_DELAY_MS = 400;

function round(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

function isMapColor(value: unknown): value is MapColor {
  return MAP_COLORS.includes(value as MapColor);
}

function isPinIcon(value: unknown): value is MapPinIcon {
  return MAP_PIN_ICONS.includes(value as MapPinIcon);
}

function isInside(point: L.Point, rect: PixelRect): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

function orientation(a: L.Point, b: L.Point, c: L.Point): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function segmentsCross(a: L.Point, b: L.Point, c: L.Point, d: L.Point): boolean {
  return (
    orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b)
  );
}

/** Whether the segment `p`-`q` touches the rectangle: an end inside it, or a crossing of one side. */
function segmentTouchesRect(p: L.Point, q: L.Point, rect: PixelRect): boolean {
  if (isInside(p, rect) || isInside(q, rect)) {
    return true;
  }

  const corners = [
    L.point(rect.left, rect.top),
    L.point(rect.right, rect.top),
    L.point(rect.right, rect.bottom),
    L.point(rect.left, rect.bottom),
  ];
  return corners.some((corner, index) =>
    segmentsCross(p, q, corner, corners[(index + 1) % corners.length]),
  );
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
 *
 * Tools: *Interact* (default: pan, click, move one item), *Select* (a rectangle selects several items that are
 * then moved or deleted together), *Pin*, *Path* and *Note*. Right-click opens a menu on the map or an item.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-map-page',
  imports: [
    TranslatePipe,
    ArcTechAlertComponent,
    ArcTechButtonComponent,
    ArcTechIconComponent,
    ArcTechMenuImports,
    ArcTechTooltipImports,
  ],
  templateUrl: './map-page.html',
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
    '(document:keydown)': 'onKeydown($event)',
    '(document:keyup)': 'onKeyup($event)',
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
  private readonly workspace = inject(WorkspaceService);
  private readonly preferences = inject(LocalPreferencesService);
  private readonly dialogFormService = inject(AppDialogFormService);
  private readonly dialogService = inject(ArcTechDialogService);
  private readonly alertDialogService = inject(ArcTechAlertDialogService);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly contextMenuTrigger = viewChild.required(CdkContextMenuTrigger);

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
  private readonly layerIndex = new Map<string, ItemLayers>();
  private groupDrag: GroupDrag | null = null;
  private readonly viewVersion = signal(0);
  private readonly isLeafletReady = signal(false);

  // The path being drawn.
  private drawPoints: MapPointDto[] = [];
  private cursor: L.LatLng | null = null;
  private isClosingHint = false;

  // Eased zoom: the wheel, a pinch and the buttons move a target that the map follows frame by frame.
  private zoomTarget: number | null = null;
  private zoomAnchor: L.Point | null = null;
  private zoomFrame = 0;
  private viewSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // The rectangle of the Select tool.
  private marquee: { readonly start: L.Point; element: HTMLElement; isAdditive: boolean } | null =
    null;
  private skipNextMapClick = false;
  private skipNextItemClick = false;

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
  protected readonly tool = signal<MapTool>('interact');
  protected readonly isPanelOpen = signal(true);
  protected readonly menuTarget = signal<MenuTarget | null>(null);
  /** Points of the path being drawn (*Done* and *Cancel* next to the tool need to know). */
  protected readonly drawCount = signal(0);
  /** Space held in the Select tool: the map pans instead of selecting. */
  private readonly isPanning = signal(false);

  /** Ids of the selected pins, paths and notes (they are unique across kinds). */
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());

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
    { tool: 'interact', icon: 'hand', label: 'maps.tools.interact' },
    { tool: 'select', icon: 'square-dashed-mouse-pointer', label: 'maps.tools.select' },
    { tool: 'pin', icon: 'map-pin', label: 'maps.tools.pin' },
    { tool: 'path', icon: 'route', label: 'maps.tools.path' },
    { tool: 'note', icon: 'sticky-note', label: 'maps.tools.note' },
  ];
  protected readonly hint = computed(() => {
    const tool = this.tool();
    return tool === 'interact' ? null : `maps.hint.${tool}`;
  });

  private readonly kindById = computed(() => {
    const kinds = new Map<string, ItemKind>();
    const data = this.data();
    data?.pins.forEach((item) => kinds.set(item.id, 'pin'));
    data?.paths.forEach((item) => kinds.set(item.id, 'path'));
    data?.notes.forEach((item) => kinds.set(item.id, 'note'));
    return kinds;
  });
  protected readonly selectedCount = computed(() => this.selectedIds().size);
  /** The one selected item (null for none or for several). */
  protected readonly selection = computed<Selection | null>(() => {
    const ids = this.selectedIds();
    if (ids.size !== 1) {
      return null;
    }

    const [id] = ids;
    const kind = this.kindById().get(id);
    return kind ? { kind, id } : null;
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
  protected readonly selectedRows = computed(() => {
    const ids = this.selectedIds();
    return this.rows().filter((row) => ids.has(row.id));
  });

  protected readonly colorVar = mapColorVar;

  /**
   * Releasing the right button fires an `auxclick` that the overlay would read as a click outside the menu just
   * opened (its trigger is a hidden element), closing it right away: swallowed while the menu is open, like the
   * tab bar's.
   */
  private readonly swallowMenuAuxClick = (event: MouseEvent) => {
    if (event.button === 2 && this.contextMenuTrigger().isOpen()) {
      event.stopPropagation();
    }
  };

  constructor() {
    document.addEventListener('auxclick', this.swallowMenuAuxClick, true);
    this.destroyRef.onDestroy(() =>
      document.removeEventListener('auxclick', this.swallowMenuAuxClick, true),
    );

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

    // Layers follow the data, the selection and the tool (items take no clicks while a path is drawn).
    effect(() => {
      this.data();
      this.selectedIds();
      this.tool();
      this.viewVersion();
      this.isEditable();
      untracked(() => this.renderLayers());
    });

    effect(() => {
      const tool = this.tool();
      untracked(() => this.onToolChanged(tool));
    });

    // The Select tool drags a rectangle, so the map only pans with Space held; every other tool pans.
    effect(() => {
      const isSelecting = this.tool() === 'select' && !this.isPanning();
      if (this.isLeafletReady()) {
        untracked(() => {
          const dragging = this.leaflet?.dragging;
          if (isSelecting) {
            dragging?.disable();
          } else {
            dragging?.enable();
          }
        });
      }
    });

    // Items that no longer exist (deleted, or the other version of the file was loaded) leave the selection.
    effect(() => {
      const kinds = this.kindById();
      const selected = untracked(this.selectedIds);
      const kept = [...selected].filter((id) => kinds.has(id));
      if (kept.length !== selected.size) {
        this.selectedIds.set(new Set(kept));
      }
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
      zoomAnimation: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      minZoom: -6,
      maxZoom: 6,
    });
    this.layers = L.layerGroup().addTo(instance);
    this.drawLayer = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => this.onMapClick(event));
    instance.on('mousemove', (event: L.LeafletMouseEvent) => this.onMouseMove(event));
    instance.on('mousedown', (event: L.LeafletMouseEvent) => this.onMapMouseDown(event));
    instance.on('contextmenu', (event: L.LeafletMouseEvent) => this.onMapContextMenu(event));
    instance.on('moveend', () => this.scheduleViewSave());

    // Our own wheel / pinch zoom: Leaflet's jumps by whole steps, this one eases towards its target.
    const onWheel = (event: WheelEvent) => this.onWheel(event);
    container.addEventListener('wheel', onWheel, { passive: false });
    // The app's menu replaces the system one everywhere on the map.
    const onNativeContextMenu = (event: Event) => event.preventDefault();
    container.addEventListener('contextmenu', onNativeContextMenu);

    // The panel slides in and out: the map's size follows.
    const observer = new ResizeObserver(() => instance.invalidateSize({ animate: false }));
    observer.observe(container);
    this.destroyRef.onDestroy(() => {
      this.persistView();
      if (this.viewSaveTimer) {
        clearTimeout(this.viewSaveTimer);
      }

      cancelAnimationFrame(this.zoomFrame);
      this.endMarquee();
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('contextmenu', onNativeContextMenu);
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
    this.cancelDraw();
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
      const fitZoom = this.currentFitZoom();
      this.leaflet.setMinZoom(fitZoom - 2);
      this.leaflet.setMaxZoom(fitZoom + 5);
      this.applyView();
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

  /** The zoom at which the whole image is in view; saved zooms are relative to it, so they survive a resize. */
  private currentFitZoom(): number {
    if (!this.leaflet || !this.bounds) {
      return 0;
    }

    return this.leaflet.getBoundsZoom(
      this.bounds,
      false,
      L.point(FIT_PADDING_PIXELS * 2, FIT_PADDING_PIXELS * 2),
    );
  }

  /** Back to where the map was left on this device, or fitted when it never was moved. */
  private applyView(): void {
    const instance = this.leaflet;
    if (!instance || !this.bounds) {
      return;
    }

    const saved = this.preferences.getMapView(this.mapPath());
    if (!saved) {
      this.fit();
      return;
    }

    const zoom = Math.min(
      instance.getMaxZoom(),
      Math.max(instance.getMinZoom(), this.currentFitZoom() + saved.zoom),
    );
    instance.setView(this.toLatLng({ x: saved.x, y: saved.y }), zoom, { animate: false });
  }

  private scheduleViewSave(): void {
    if (this.viewSaveTimer) {
      clearTimeout(this.viewSaveTimer);
    }

    this.viewSaveTimer = setTimeout(() => {
      this.viewSaveTimer = null;
      this.persistView();
    }, VIEW_SAVE_DELAY_MS);
  }

  private persistView(): void {
    const instance = this.leaflet;
    const size = this.imageSize;
    if (!instance || !size || !this.bounds || this.imageState() !== 'ready') {
      return;
    }

    const center = instance.getCenter();
    this.preferences.setMapView(this.mapPath(), {
      x: Math.round((center.lng / size.width) * COORDINATE_PRECISION) / COORDINATE_PRECISION,
      y: Math.round((1 - center.lat / size.height) * COORDINATE_PRECISION) / COORDINATE_PRECISION,
      zoom: Math.round((instance.getZoom() - this.currentFitZoom()) * 1000) / 1000,
    });
  }

  // --- Zoom --------------------------------------------------------------------------------------------

  protected zoomIn(anchor?: L.Point): void {
    this.zoomBy(BUTTON_ZOOM_STEP, anchor);
  }

  protected zoomOut(anchor?: L.Point): void {
    this.zoomBy(-BUTTON_ZOOM_STEP, anchor);
  }

  /** Moves the zoom target by `delta` levels around `anchor` (container pixels; default: the centre). */
  private zoomBy(delta: number, anchor?: L.Point): void {
    const instance = this.leaflet;
    if (!instance || this.imageState() !== 'ready') {
      return;
    }

    const base = this.zoomTarget ?? instance.getZoom();
    this.zoomTarget = Math.min(
      instance.getMaxZoom(),
      Math.max(instance.getMinZoom(), base + delta),
    );
    this.zoomAnchor = anchor ?? instance.getSize().divideBy(2);
    if (!this.zoomFrame) {
      this.zoomFrame = requestAnimationFrame(() => this.stepZoom());
    }
  }

  private stepZoom(): void {
    this.zoomFrame = 0;
    const instance = this.leaflet;
    const target = this.zoomTarget;
    const anchor = this.zoomAnchor;
    if (!instance || target === null || !anchor) {
      return;
    }

    const current = instance.getZoom();
    const difference = target - current;
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReducedMotion || Math.abs(difference) < ZOOM_SETTLED) {
      instance.setZoomAround(anchor, target, { animate: false });
      this.zoomTarget = null;
      return;
    }

    instance.setZoomAround(anchor, current + difference * ZOOM_EASING, { animate: false });
    this.zoomFrame = requestAnimationFrame(() => this.stepZoom());
  }

  private onWheel(event: WheelEvent): void {
    const instance = this.leaflet;
    if (!instance || this.imageState() !== 'ready') {
      return;
    }

    event.preventDefault();
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    const delta = Math.max(-WHEEL_DELTA_MAX, Math.min(WHEEL_DELTA_MAX, event.deltaY * unit));
    const perPixel = event.ctrlKey ? PINCH_ZOOM_PER_PIXEL : WHEEL_ZOOM_PER_PIXEL;
    this.zoomBy(-delta * perPixel, instance.mouseEventToContainerPoint(event));
  }

  protected fit(): void {
    if (this.leaflet && this.bounds) {
      this.zoomTarget = null;
      this.leaflet.invalidateSize({ animate: false });
      this.leaflet.fitBounds(this.bounds, {
        padding: [FIT_PADDING_PIXELS, FIT_PADDING_PIXELS],
        animate: false,
      });
    }
  }

  private toLatLng(point: MapPointDto): L.LatLng {
    const size = this.imageSize ?? { width: 1, height: 1 };
    return L.latLng((1 - point.y) * size.height, point.x * size.width);
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
    this.layerIndex.clear();
    if (!layers || !data || !this.imageSize) {
      return;
    }

    const selected = this.selectedIds();
    const tool = this.tool();
    const canTouch = tool === 'interact' || tool === 'select';
    const canReshape = this.isEditable() && tool === 'interact' && selected.size === 1;

    for (const path of data.paths) {
      this.addPathLayers(layers, path, selected.has(path.id), canTouch, canReshape);
    }

    for (const pin of data.pins) {
      const marker = L.marker(this.toLatLng(pin), {
        icon: L.divIcon({
          html: this.buildPinElement(pin, selected.has(pin.id)),
          className: 'arc-map-marker',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        interactive: canTouch,
        title: pin.label,
        keyboard: true,
      });
      this.bindItem(marker, 'pin', pin.id);
      marker.addTo(layers);
    }

    for (const note of data.notes) {
      const marker = L.marker(this.toLatLng(note), {
        icon: L.divIcon({
          html: this.buildNoteElement(note, selected.has(note.id)),
          className: 'arc-map-marker',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: canTouch,
        keyboard: true,
      });
      this.bindItem(marker, 'note', note.id);
      marker.addTo(layers);
    }
  }

  /** Click selects, double-click edits (or opens a pin's file), a drag moves the item and its selection. */
  private bindItem(marker: L.Marker, kind: ItemKind, id: string): void {
    this.layerIndex.set(id, { marker, lines: [] });
    marker.on('click', (event: L.LeafletMouseEvent) =>
      this.onItemClick(kind, id, event.originalEvent),
    );
    marker.on('dblclick', () => this.onItemDoubleClick(kind, id));
    marker.on('contextmenu', (event: L.LeafletMouseEvent) =>
      this.onItemContextMenu(kind, id, event.originalEvent),
    );
    marker.on('mousedown', (event: L.LeafletMouseEvent) => this.onItemMouseDown(id, event));
  }

  private addPathLayers(
    layers: L.LayerGroup,
    path: MapPathDto,
    isSelected: boolean,
    isClickable: boolean,
    canReshape: boolean,
  ): void {
    const latlngs = path.points.map((point) => this.toLatLng(point));
    const className = `arc-map-path arc-map-color-${path.color}${isSelected ? ' is-selected' : ''}`;
    // A closed path is a polygon: the same line, plus the area it surrounds.
    const line = path.closed
      ? L.polygon(latlngs, {
          weight: path.width,
          className: `${className} arc-map-polygon`,
          interactive: false,
        })
      : L.polyline(latlngs, { weight: path.width, className, interactive: false });
    line.addTo(layers);
    // A wide invisible line under the pointer: a 3 px stroke is hard to hit.
    const hitOptions: L.PolylineOptions = {
      weight: 16,
      className: 'arc-map-path-hit',
      interactive: isClickable,
      bubblingMouseEvents: false,
    };
    const hit = path.closed ? L.polygon(latlngs, hitOptions) : L.polyline(latlngs, hitOptions);
    hit
      .on('click', (event: L.LeafletMouseEvent) =>
        this.onItemClick('path', path.id, event.originalEvent),
      )
      .on('dblclick', () => this.onItemDoubleClick('path', path.id))
      .on('contextmenu', (event: L.LeafletMouseEvent) =>
        this.onItemContextMenu('path', path.id, event.originalEvent),
      )
      .on('mousedown', (event: L.LeafletMouseEvent) => this.onItemMouseDown(path.id, event))
      .addTo(layers);
    this.layerIndex.set(path.id, { lines: [line, hit] });

    if (!isSelected || !canReshape) {
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

  // --- Selection ---------------------------------------------------------------------------------------

  private selectOnly(id: string | null): void {
    this.selectedIds.set(id ? new Set([id]) : new Set());
  }

  private toggleSelected(id: string): void {
    const next = new Set(this.selectedIds());
    if (!next.delete(id)) {
      next.add(id);
    }

    this.selectedIds.set(next);
  }

  protected clearSelection(): void {
    this.selectOnly(null);
  }

  private selectAll(): void {
    this.selectedIds.set(new Set(this.kindById().keys()));
  }

  private onItemClick(kind: ItemKind, id: string, event: MouseEvent): void {
    if (this.skipNextItemClick) {
      this.skipNextItemClick = false;
      return;
    }

    const tool = this.tool();
    const isModifier = event.metaKey || event.ctrlKey;
    if (tool === 'select') {
      if (event.shiftKey || isModifier) {
        this.toggleSelected(id);
      } else {
        this.selectOnly(id);
      }

      return;
    }

    if (tool !== 'interact') {
      return;
    }

    // Cmd / Ctrl-click on a pin goes to its linked file, in a background tab like any link of the app.
    const link = kind === 'pin' ? this.data()?.pins.find((pin) => pin.id === id)?.link : null;
    if (isModifier && link) {
      this.openLink(link, true);
      return;
    }

    this.selectOnly(id);
  }

  private onItemDoubleClick(kind: ItemKind, id: string): void {
    if (this.tool() !== 'interact' && this.tool() !== 'select') {
      return;
    }

    const link = kind === 'pin' ? this.data()?.pins.find((pin) => pin.id === id)?.link : null;
    if (link) {
      this.openLink(link, false);
    } else if (this.isEditable()) {
      this.selectOnly(id);
      void this.openEdit({ kind, id });
    }
  }

  // --- Moving items together ---------------------------------------------------------------------------

  private latLngOf(id: string): L.LatLng {
    const data = this.data();
    const item =
      data?.pins.find((pin) => pin.id === id) ?? data?.notes.find((note) => note.id === id);
    return item ? this.toLatLng(item) : L.latLng(0, 0);
  }

  /** The Leaflet positions of an item's points, from the data (so they stay right while layers are redrawn). */
  private baseLatLngs(id: string): L.LatLng[] {
    const path = this.data()?.paths.find((item) => item.id === id);
    return path ? path.points.map((point) => this.toLatLng(point)) : [this.latLngOf(id)];
  }

  /**
   * Starts moving an item with the selection it belongs to (an item outside the selection moves alone).
   * `origin` is where the pointer holds it; the selection changes only when the move ends, so the layer
   * being dragged is never redrawn under the pointer.
   */
  private beginGroupDrag(anchorId: string, origin: L.LatLng): void {
    const bounds = this.bounds;
    if (!bounds) {
      return;
    }

    const selected = this.selectedIds();
    const ids = selected.has(anchorId) ? new Set(selected) : new Set([anchorId]);
    const base = new Map<string, readonly L.LatLng[]>();
    const all: L.LatLng[] = [];
    for (const id of ids) {
      const points = this.baseLatLngs(id);
      base.set(id, points);
      all.push(...points);
    }

    const lats = all.map((point) => point.lat);
    const lngs = all.map((point) => point.lng);
    this.groupDrag = {
      origin,
      anchorId,
      ids,
      base,
      limits: {
        minLat: bounds.getSouth() - Math.min(...lats),
        maxLat: bounds.getNorth() - Math.max(...lats),
        minLng: bounds.getWest() - Math.min(...lngs),
        maxLng: bounds.getEast() - Math.max(...lngs),
      },
      delta: { lat: 0, lng: 0 },
    };
  }

  private updateGroupDrag(current: L.LatLng): void {
    const drag = this.groupDrag;
    if (!drag) {
      return;
    }

    // Kept inside the image as a whole, so the group never loses its shape at an edge.
    const lat = Math.min(
      drag.limits.maxLat,
      Math.max(drag.limits.minLat, current.lat - drag.origin.lat),
    );
    const lng = Math.min(
      drag.limits.maxLng,
      Math.max(drag.limits.minLng, current.lng - drag.origin.lng),
    );
    drag.delta = { lat, lng };
    for (const id of drag.ids) {
      const layers = this.layerIndex.get(id);
      const base = drag.base.get(id) ?? [];
      layers?.marker?.setLatLng(L.latLng(base[0].lat + lat, base[0].lng + lng));
      layers?.lines.forEach((line) =>
        line.setLatLngs(base.map((point) => L.latLng(point.lat + lat, point.lng + lng))),
      );
    }
  }

  private endGroupDrag(): void {
    const drag = this.groupDrag;
    this.groupDrag = null;
    const size = this.imageSize;
    if (!drag || !size) {
      return;
    }

    const dx = drag.delta.lng / size.width;
    const dy = -drag.delta.lat / size.height;
    if (dx === 0 && dy === 0) {
      this.viewVersion.update((version) => version + 1);
      return;
    }

    const move = (point: MapPointDto) => ({ x: round(point.x + dx), y: round(point.y + dy) });
    this.update((data) => ({
      ...data,
      pins: data.pins.map((pin) => (drag.ids.has(pin.id) ? { ...pin, ...move(pin) } : pin)),
      notes: data.notes.map((note) => (drag.ids.has(note.id) ? { ...note, ...move(note) } : note)),
      paths: data.paths.map((path) =>
        drag.ids.has(path.id) ? { ...path, points: path.points.map(move) } : path,
      ),
    }));
    if (!this.selectedIds().has(drag.anchorId)) {
      this.selectOnly(drag.anchorId);
    }
  }

  /**
   * Holding a pin, a note or a path moves it with its selection: one pointer-driven move for all three kinds
   * (Leaflet's marker dragging only knows markers and ends a drag in ways that are hard to follow). Nothing
   * moves before the pointer has travelled `DRAG_START_PIXELS`, so clicks and double-clicks stay clicks; the
   * click that ends a real move is swallowed so it does not collapse the selection that was just moved.
   */
  private onItemMouseDown(id: string, event: L.LeafletMouseEvent): void {
    const instance = this.leaflet;
    const original = event.originalEvent;
    const tool = this.tool();
    if (
      !instance ||
      (tool !== 'interact' && tool !== 'select') ||
      !this.isEditable() ||
      original.button !== 0 ||
      original.shiftKey ||
      original.metaKey ||
      original.ctrlKey
    ) {
      return; // modifier clicks only change the selection or follow a link (see the click handlers)
    }

    // The map must not pan while an item is held (its own drag already started on this mousedown: disabling
    // it ends that drag), and the browser must not start dragging the icon or selecting text.
    original.preventDefault();
    instance.dragging.disable();
    const start = instance.mouseEventToContainerPoint(original);
    let isMoving = false;
    const onMove = (move: MouseEvent) => {
      const point = instance.mouseEventToContainerPoint(move);
      if (!isMoving) {
        if (point.distanceTo(start) < DRAG_START_PIXELS) {
          return;
        }

        isMoving = true;
        instance.getContainer().classList.add('arc-map-moving');
        this.beginGroupDrag(id, instance.mouseEventToLatLng(original));
      }

      this.updateGroupDrag(instance.mouseEventToLatLng(move));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
      instance.getContainer().classList.remove('arc-map-moving');
      // The Select tool keeps the map still (a rectangle is dragged instead) unless Space is held.
      if (this.tool() !== 'select' || this.isPanning()) {
        instance.dragging.enable();
      }

      if (isMoving) {
        this.skipNextItemClick = true;
        setTimeout(() => (this.skipNextItemClick = false), CLICK_AFTER_DRAG_MS);
        this.endGroupDrag();
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
  }

  // --- Select tool: a rectangle ------------------------------------------------------------------------

  private onMapMouseDown(event: L.LeafletMouseEvent): void {
    const instance = this.leaflet;
    const original = event.originalEvent;
    if (
      !instance ||
      this.tool() !== 'select' ||
      this.isPanning() ||
      !this.isEditable() ||
      original.button !== 0
    ) {
      return;
    }

    original.preventDefault();
    const element = document.createElement('div');
    element.className = 'arc-map-marquee';
    instance.getContainer().append(element);
    this.marquee = {
      start: event.containerPoint,
      element,
      isAdditive: original.shiftKey || original.metaKey || original.ctrlKey,
    };
    this.positionMarquee(event.containerPoint);
    document.addEventListener('mousemove', this.onMarqueeMove);
    document.addEventListener('mouseup', this.onMarqueeUp);
  }

  private readonly onMarqueeMove = (event: MouseEvent) => {
    if (this.leaflet) {
      this.positionMarquee(this.leaflet.mouseEventToContainerPoint(event));
    }
  };

  private readonly onMarqueeUp = (event: MouseEvent) => {
    const instance = this.leaflet;
    const marquee = this.marquee;
    this.endMarquee();
    if (!instance || !marquee) {
      return;
    }

    const end = instance.mouseEventToContainerPoint(event);
    const rect: PixelRect = {
      left: Math.min(marquee.start.x, end.x),
      top: Math.min(marquee.start.y, end.y),
      right: Math.max(marquee.start.x, end.x),
      bottom: Math.max(marquee.start.y, end.y),
    };
    if (
      rect.right - rect.left < MARQUEE_MIN_PIXELS &&
      rect.bottom - rect.top < MARQUEE_MIN_PIXELS
    ) {
      return; // a click: the map's click handler clears the selection
    }

    const hits = this.itemsInside(rect);
    this.selectedIds.set(
      marquee.isAdditive ? new Set([...this.selectedIds(), ...hits]) : new Set(hits),
    );
    // The mouse-up that ends the rectangle is also a click on the map, which would clear what it selected.
    this.skipNextMapClick = true;
    setTimeout(() => (this.skipNextMapClick = false), 50);
  };

  private positionMarquee(point: L.Point): void {
    const marquee = this.marquee;
    if (!marquee) {
      return;
    }

    const style = marquee.element.style;
    style.left = `${Math.min(marquee.start.x, point.x)}px`;
    style.top = `${Math.min(marquee.start.y, point.y)}px`;
    style.width = `${Math.abs(point.x - marquee.start.x)}px`;
    style.height = `${Math.abs(point.y - marquee.start.y)}px`;
  }

  private endMarquee(): void {
    document.removeEventListener('mousemove', this.onMarqueeMove);
    document.removeEventListener('mouseup', this.onMarqueeUp);
    this.marquee?.element.remove();
    this.marquee = null;
  }

  /** Items the rectangle (container pixels) touches: a pin or note by its box, a path by any of its segments. */
  private itemsInside(rect: PixelRect): string[] {
    const instance = this.leaflet;
    const data = this.data();
    if (!instance || !data) {
      return [];
    }

    const container = instance.getContainer().getBoundingClientRect();
    const touchesBox = (id: string) => {
      const element = this.layerIndex.get(id)?.marker?.getElement()?.firstElementChild;
      if (!element) {
        return false;
      }

      const box = element.getBoundingClientRect();
      return (
        box.right - container.left >= rect.left &&
        box.left - container.left <= rect.right &&
        box.bottom - container.top >= rect.top &&
        box.top - container.top <= rect.bottom
      );
    };
    const hits: string[] = [
      ...data.pins.filter((pin) => touchesBox(pin.id)).map((pin) => pin.id),
      ...data.notes.filter((note) => touchesBox(note.id)).map((note) => note.id),
    ];
    for (const path of data.paths) {
      const pixels = path.points.map((point) =>
        instance.latLngToContainerPoint(this.toLatLng(point)),
      );
      const segments = pixels.map((pixel, index): [L.Point, L.Point] => [
        pixel,
        pixels[(index + 1) % pixels.length],
      ]);
      const used = path.closed ? segments : segments.slice(0, -1);
      if (used.some(([from, to]) => segmentTouchesRect(from, to, rect))) {
        hits.push(path.id);
      }
    }

    return hits;
  }

  // --- Tools -------------------------------------------------------------------------------------------

  protected selectTool(tool: MapTool): void {
    this.tool.set(tool);
  }

  private onToolChanged(tool: MapTool): void {
    this.leaflet?.getContainer().classList.toggle('arc-map-drawing', tool !== 'interact');
    if (tool !== 'path') {
      this.cancelDraw();
    }
  }

  private onMapClick(event: L.LeafletMouseEvent): void {
    if (this.skipNextMapClick) {
      this.skipNextMapClick = false;
      return;
    }

    const tool = this.tool();
    const original = event.originalEvent;
    if (tool === 'interact' || tool === 'select') {
      if (!original.shiftKey && !original.metaKey && !original.ctrlKey) {
        this.clearSelection();
      }

      return;
    }

    if (!this.isEditable()) {
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
      this.addDrawPoint(point, event.containerPoint);
    }
  }

  private onMouseMove(event: L.LeafletMouseEvent): void {
    if (this.tool() !== 'path' || this.drawPoints.length === 0) {
      return;
    }

    this.cursor = event.latlng;
    this.isClosingHint =
      this.drawPoints.length >= 3 && this.hitDrawPoint(event.containerPoint) === 0;
    this.refreshDraw();
  }

  /** Index of the point of the path being drawn under the pointer (container pixels), -1 for none. */
  private hitDrawPoint(containerPoint: L.Point): number {
    const instance = this.leaflet;
    return instance
      ? this.drawPoints.findIndex(
          (point) =>
            instance.latLngToContainerPoint(this.toLatLng(point)).distanceTo(containerPoint) <=
            CLOSE_PATH_PIXELS,
        )
      : -1;
  }

  /**
   * One click of the path tool. On the first point (three points at least) the shape closes and the drawing
   * ends; on any other earlier point the path loops back to it and ends there. Elsewhere it adds a point.
   * A double-click does not end the path.
   */
  private addDrawPoint(point: MapPointDto, containerPoint: L.Point): void {
    const hit = this.hitDrawPoint(containerPoint);
    if (hit >= 0) {
      if (hit === this.drawPoints.length - 1) {
        return; // the point just added (the second click of a double-click)
      }

      if (hit === 0) {
        if (this.drawPoints.length >= 3) {
          this.completePath(true);
        }

        return;
      }

      this.drawPoints = [...this.drawPoints, this.drawPoints[hit]];
      this.completePath(false);
      return;
    }

    this.drawPoints = [...this.drawPoints, point];
    this.drawCount.set(this.drawPoints.length);
    this.refreshDraw();
  }

  /** The path being drawn: the points so far, and a line to the cursor (to the first point when it would close). */
  private refreshDraw(): void {
    const layer = this.drawLayer;
    if (!layer) {
      return;
    }

    layer.clearLayers();
    if (this.drawPoints.length === 0) {
      return;
    }

    const latlngs = this.drawPoints.map((point) => this.toLatLng(point));
    const end = this.isClosingHint ? latlngs[0] : this.cursor;
    L.polyline(end ? [...latlngs, end] : latlngs, {
      weight: DEFAULT_PATH_WIDTH,
      className: 'arc-map-draw',
      interactive: false,
    }).addTo(layer);
    latlngs.forEach((latlng, index) => {
      L.marker(latlng, {
        icon: L.divIcon({
          className: 'arc-map-marker',
          html: `<span class="arc-map-vertex${index === 0 && this.isClosingHint ? ' is-closing' : ''}"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        interactive: false,
      }).addTo(layer);
    });
  }

  private cancelDraw(): void {
    this.drawPoints = [];
    this.cursor = null;
    this.isClosingHint = false;
    this.drawCount.set(0);
    this.drawLayer?.clearLayers();
  }

  /** *Cancel* of the path tool: the points drawn so far are dropped and the tool stays. */
  protected cancelPath(): void {
    this.cancelDraw();
  }

  /** *Done* of the path tool (also Enter): an open path through the points drawn so far. */
  protected finishPath(): void {
    if (this.tool() === 'path' && this.drawPoints.length >= 2) {
      this.completePath(false);
    }
  }

  private completePath(isClosed: boolean): void {
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
      closed: isClosed && points.length >= 3,
    };
    this.update((data) => ({ ...data, paths: [...data.paths, path] }));
    this.afterAdd({ kind: 'path', id: path.id });
  }

  /** A new item is selected, the tool goes back to *Interact* and its form opens for the first details. */
  private afterAdd(selection: Selection): void {
    this.selectOnly(selection.id);
    this.tool.set('interact');
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

    const isModifier = event.metaKey || event.ctrlKey;
    if (event.key === 'Escape') {
      if (this.drawPoints.length > 0) {
        this.cancelDraw();
      } else if (this.tool() !== 'interact') {
        this.tool.set('interact');
      } else {
        this.clearSelection();
      }
    } else if (event.key === 'Enter' && this.tool() === 'path') {
      event.preventDefault();
      this.finishPath();
    } else if (event.key === ' ' && this.tool() === 'select') {
      event.preventDefault();
      this.isPanning.set(true);
    } else if (isModifier && event.key.toLowerCase() === 'a' && this.tool() === 'select') {
      event.preventDefault();
      this.selectAll();
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.selectedCount() > 0 &&
      this.isEditable()
    ) {
      event.preventDefault();
      this.confirmDelete();
    }
  }

  protected onKeyup(event: KeyboardEvent): void {
    if (event.key === ' ') {
      this.isPanning.set(false);
    }
  }

  // --- Context menu ------------------------------------------------------------------------------------

  private onMapContextMenu(event: L.LeafletMouseEvent): void {
    event.originalEvent.preventDefault();
    this.openContextMenu(
      { kind: 'map', point: this.toPoint(event.latlng), anchor: event.containerPoint },
      event.originalEvent,
    );
  }

  private onItemContextMenu(kind: ItemKind, id: string, event: MouseEvent): void {
    event.preventDefault();
    if (!this.selectedIds().has(id)) {
      this.selectOnly(id);
    }

    this.openContextMenu({ kind: 'item', item: { kind, id } }, event);
  }

  private openContextMenu(target: MenuTarget, event: MouseEvent): void {
    if (this.tool() === 'path' && this.drawPoints.length > 0) {
      return; // a right-click while drawing does nothing; Done and Cancel are next to the tool
    }

    const trigger = this.contextMenuTrigger();
    trigger.close();
    this.menuTarget.set(target);
    trigger.open({ x: event.clientX, y: event.clientY });
  }

  protected menuZoomIn(): void {
    const target = this.menuTarget();
    this.zoomIn(target?.kind === 'map' ? target.anchor : undefined);
  }

  protected menuZoomOut(): void {
    const target = this.menuTarget();
    this.zoomOut(target?.kind === 'map' ? target.anchor : undefined);
  }

  protected menuAddPin(point: MapPointDto): void {
    this.addPin(point);
  }

  protected menuAddNote(point: MapPointDto): void {
    this.addNote(point);
  }

  /** *Draw a path from here*: the path tool, with this point as its first. */
  protected menuDrawPath(point: MapPointDto): void {
    this.tool.set('path');
    this.drawPoints = [point];
    this.drawCount.set(1);
    this.refreshDraw();
  }

  protected menuEdit(item: Selection): void {
    void this.openEdit(item);
  }

  protected pinLink(id: string): string | null {
    return this.data()?.pins.find((pin) => pin.id === id)?.link ?? null;
  }

  // --- Panel -------------------------------------------------------------------------------------------

  protected selectRow(row: MapItemRow): void {
    this.selectOnly(row.id);
    const data = this.data();
    const point =
      row.kind === 'path'
        ? data?.paths.find((path) => path.id === row.id)?.points[0]
        : (row.kind === 'pin' ? data?.pins : data?.notes)?.find((item) => item.id === row.id);
    if (point && this.imageSize) {
      this.leaflet?.panTo(this.toLatLng(point));
    }
  }

  protected editSelected(): void {
    const selection = this.selection();
    if (selection) {
      void this.openEdit(selection);
    }
  }

  /** In-app route of a linked file, null for a file the app opens in the system's viewer. */
  protected linkRoute(link: string): string | null {
    return toInAppAssetRoute(link) ?? toInAppNoteRoute(link) ?? toInAppMapRoute(link);
  }

  /** Goes to a linked file: in this tab, or in a background tab like Cmd / Ctrl-click anywhere in the app. */
  protected openLink(link: string, isBackground = false): void {
    const route = this.linkRoute(link);
    if (route) {
      if (isBackground && this.workspace.isCampaignUrl(route)) {
        void this.workspace.openTab(route, { background: true });
      } else {
        void this.router.navigateByUrl(route);
      }

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
  protected async openEdit(selection: Selection, isNew = false): Promise<void> {
    const data = this.data();
    if (!data || !this.isEditable()) {
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
          {
            id: 'closed',
            type: 'checkbox',
            checkboxLabel: this.translateService.instant('maps.item.closedLabel'),
            disabled: path.points.length < 3,
          },
        ],
        values: {
          label: path.label,
          color: path.color,
          width: String(path.width),
          closed: path.closed,
        },
        onSubmit: (form) => {
          const values = form.getValues();
          const color = values['color'];
          const width = Number(values['width']);
          this.updatePath(path.id, {
            label: String(values['label'] ?? '').trim(),
            color: isMapColor(color) ? color : path.color,
            width: (MAP_PATH_WIDTHS as readonly number[]).includes(width) ? width : path.width,
            closed: values['closed'] === true && path.points.length >= 3,
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
          this.removeItems(new Set([selection.id]));
        }
      },
    });
  }

  /** *Delete…*: the selected items, after one confirmation. */
  protected confirmDelete(): void {
    const ids = this.selectedIds();
    if (ids.size === 0) {
      return;
    }

    this.alertDialogService.confirm({
      arcTitle: this.translateService.instant(
        ids.size === 1 ? 'maps.item.deleteTitle' : 'maps.item.deleteManyTitle',
        { count: ids.size },
      ),
      arcDescription: this.translateService.instant('maps.item.deleteDescription'),
      arcOkText: this.translateService.instant('maps.item.delete'),
      arcCancelText: this.translateService.instant('campaigns.sections.newNote.cancel'),
      arcOkDestructive: true,
      arcOnOk: () => this.removeItems(new Set(ids)),
    });
  }

  private removeItems(ids: ReadonlySet<string>): void {
    this.update((data) => ({
      ...data,
      pins: data.pins.filter((item) => !ids.has(item.id)),
      paths: data.paths.filter((item) => !ids.has(item.id)),
      notes: data.notes.filter((item) => !ids.has(item.id)),
    }));
    this.selectedIds.set(new Set([...this.selectedIds()].filter((id) => !ids.has(id))));
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
        this.selectedIds.set(new Set());
        this.tool.set('interact');
        // Another map with the same image reuses the page: it still has to show its own view.
        if (this.imageSize && this.shownImage === file.map.image) {
          this.applyView();
        }
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
