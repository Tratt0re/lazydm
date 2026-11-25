import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import cytoscape from 'cytoscape';

import type { FolderGraphDto, FolderGraphNodeDto } from '@/dtos';
import {
  BUTTON_ZOOM_STEP,
  clampLevel,
  easeLevel,
  GRAPH_FIT_PADDING,
  GRAPH_MAX_LEVEL,
  GRAPH_MIN_LEVEL,
  gridFor,
  type IconShapes,
  iconToDataUrl,
  keyPan,
  keyZoom,
  levelToScale,
  neighbourhood,
  scaleToLevel,
  seedPositions,
  wheelLevelDelta,
} from '@/config/section-graph.config';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ARCTECH_ICONS, ArcTechIconComponent } from '@/shared/components/icon';
import type { SectionIcon } from '@/services/section.service';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

/** What a click on a node asks for: select it, open it, open it in a tab or to the side. */
export interface GraphNodeOpen {
  readonly path: string;
  readonly mode: 'here' | 'tab' | 'side';
}

interface GraphColours {
  readonly card: string;
  /** The node's fill: the lightest surface in light, the lifted one in dark, so a node reads against the frame. */
  readonly raised: string;
  /** The frame behind the graph: darker than the page in both themes (the label halo uses it too). */
  readonly frame: string;
  /** The tint of a node's drop shadow. */
  readonly shadow: string;
  readonly recessed: string;
  readonly foreground: string;
  readonly muted: string;
  readonly primary: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly ring: string;
}

const NODE_SIZE = 46;
/** The icon of a node's home folder, as a share of the node. */
const NODE_ICON_SHARE = '56%';
const LABEL_MAX_LENGTH = 22;

function readColours(host: HTMLElement): GraphColours {
  const styles = getComputedStyle(host);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const isDark = document.documentElement.classList.contains('dark');
  return {
    raised: read('--raised', '#fdfcfa'),
    frame: isDark ? read('--background', '#101114') : read('--accent', '#e2e4e2'),
    shadow: isDark ? '#000000' : read('--border-strong', '#676e71'),
    card: read('--card', '#fff'),
    recessed: read('--recessed', '#eee'),
    foreground: read('--foreground', '#222'),
    muted: read('--muted-foreground', '#666'),
    primary: read('--primary', '#6d5a3e'),
    border: read('--border', '#999'),
    borderStrong: read('--border-strong', '#666'),
    ring: read('--ring', '#8b724e'),
  };
}

function shorten(text: string): string {
  return text.length > LABEL_MAX_LENGTH ? `${text.slice(0, LABEL_MAX_LENGTH - 1)}…` : text;
}

/**
 * The graph of a folder: its notes as square nodes, a line for every link, the files they link to outside the
 * folder as dashed nodes. Cytoscape draws it and lays it out; pan, zoom and touch behave as on the map page
 * (drag the background, eased wheel zoom around the pointer, a pinch, the buttons, the keys).
 */
@Component({
  selector: 'app-section-graph',
  imports: [TranslatePipe, ArcTechButtonComponent, ArcTechIconComponent, ArcTechTooltipImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The frame is a step darker than the page (accent in light, the page's own dark in dark): the tiles are the
  // lightest things in it. The inset shadow makes it a well, not a flat panel.
  host: {
    class:
      'relative block h-[34rem] min-h-80 border border-border-strong bg-accent shadow-[inset_0_1px_6px_rgb(0_0_0/0.12)] dark:bg-background dark:shadow-[inset_0_1px_8px_rgb(0_0_0/0.5)]',
  },
  template: `
    <!-- Cytoscape makes its container position: relative, so the sized wrapper does the absolute positioning.
         The dots are the backdrop: they scale with the zoom and slide with the pan (see syncGrid), which makes
         the view feel like a surface and the movement readable. -->
    <div
      #backdrop
      class="absolute inset-0 overflow-hidden"
      style="background-image: radial-gradient(circle, var(--border) 1px, transparent 1.4px)"
    >
      <div
        #canvas
        class="size-full touch-none outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        tabindex="0"
        role="application"
        [attr.aria-label]="'campaigns.sections.graph.ariaLabel' | translate"
        [style.cursor]="cursor()"
        (keydown)="onKeydown($event)"
      ></div>
    </div>

    <div class="absolute top-2 right-2 z-10 flex flex-col border border-input bg-card">
      <button
        type="button"
        arc-button
        arcType="ghost"
        class="size-[30px] border-b border-border-subtle"
        [arcTooltip]="'campaigns.sections.graph.zoomIn' | translate"
        [attr.aria-label]="'campaigns.sections.graph.zoomIn' | translate"
        (click)="zoomIn()"
      >
        <arc-icon arcType="zoom-in" />
      </button>
      <button
        type="button"
        arc-button
        arcType="ghost"
        class="size-[30px] border-b border-border-subtle"
        [arcTooltip]="'campaigns.sections.graph.zoomOut' | translate"
        [attr.aria-label]="'campaigns.sections.graph.zoomOut' | translate"
        (click)="zoomOut()"
      >
        <arc-icon arcType="zoom-out" />
      </button>
      <button
        type="button"
        arc-button
        arcType="ghost"
        class="size-[30px]"
        [arcTooltip]="'campaigns.sections.graph.fit' | translate"
        [attr.aria-label]="'campaigns.sections.graph.fit' | translate"
        (click)="fit()"
      >
        <arc-icon arcType="maximize" />
      </button>
    </div>

    @if (graph().nodes.length > 0 && graph().edges.length === 0) {
      <div
        class="pointer-events-none absolute top-2.5 left-3 z-10 max-w-[46ch] border border-border-subtle bg-card px-3 py-2.5 text-[13px] text-foreground-secondary"
      >
        <p
          class="font-display text-lg font-bold tracking-[0.02em] text-foreground-strong uppercase"
        >
          {{
            (graph().nodes.length === 1
              ? 'campaigns.sections.graph.oneNoteTitle'
              : 'campaigns.sections.graph.noLinksTitle'
            ) | translate
          }}<span class="text-primary" aria-hidden="true">.</span>
        </p>
        <p>{{ 'campaigns.sections.graph.noLinksHint' | translate }}</p>
      </div>
    }

    @if (graph().truncated) {
      <p
        class="pointer-events-none absolute right-12 bottom-2 z-10 bg-recessed px-1.5 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase"
      >
        {{ 'campaigns.sections.graph.truncated' | translate }}
      </p>
    }

    <div
      class="absolute bottom-2 left-3 z-10 flex gap-3.5 bg-recessed px-1.5 py-0.5 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase"
      aria-hidden="true"
    >
      <span class="inline-flex items-center gap-1.5">
        <i class="inline-block size-3 border-2 border-border-strong bg-raised"></i>
        {{ 'campaigns.sections.graph.legendInside' | translate }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <i class="inline-block size-3 border-2 border-dashed border-border bg-transparent"></i>
        {{ 'campaigns.sections.graph.legendOutside' | translate }}
      </span>
    </div>

    <!-- The same graph as text, for a screen reader: each note and what it links to. -->
    <ul class="sr-only">
      @for (node of graph().nodes; track node.path) {
        <li>
          {{ node.title }}
          @if (node.external) {
            ({{ 'campaigns.sections.graph.legendOutside' | translate }})
          }
          : {{ linksOf(node.path) }}
        </li>
      }
    </ul>
  `,
})
export class AppSectionGraphComponent {
  readonly graph = input.required<FolderGraphDto>();
  /** Paths of the notes that pass the search and filters; the others are dimmed. Null: nothing is filtered. */
  readonly matching = input<ReadonlySet<string> | null>(null);
  readonly selected = input<string | null>(null);
  /** The icon of each node's home section, by node path (a section's own icon: skull for Enemies…). */
  readonly nodeIcons = input<Readonly<Record<string, SectionIcon>>>({});
  readonly nodeSelect = output<string>();
  readonly nodeOpen = output<GraphNodeOpen>();
  /** The background was clicked: the page closes the detail panel. */
  readonly backgroundClick = output<void>();

  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private cy: cytoscape.Core | null = null;
  private zoomTarget: number | null = null;
  private zoomAnchor: cytoscape.Position | null = null;
  private zoomFrame = 0;
  private themeObserver: MutationObserver | null = null;
  private layoutKey = '';
  protected readonly isPanning = signal(false);
  /** A node is under the pointer (`grab`) or being carried (`grabbing`, shared with panning). */
  private readonly isOverNode = signal(false);
  protected readonly cursor = computed(() =>
    this.isPanning() ? 'grabbing' : this.isOverNode() ? 'pointer' : 'grab',
  );
  private readonly outgoing = computed(() => {
    const map = new Map<string, string[]>();
    const titles = new Map(this.graph().nodes.map((node) => [node.path, node.title]));
    for (const edge of this.graph().edges) {
      map.set(edge.source, [
        ...(map.get(edge.source) ?? []),
        titles.get(edge.target) ?? edge.target,
      ]);
    }

    return map;
  });

  constructor() {
    // The canvas exists from the first render; the graph, the filter and the selection redraw it.
    effect(() => {
      const graph = this.graph();
      const canvas = this.canvas().nativeElement;
      if (!this.cy) {
        this.zone.runOutsideAngular(() => this.create(canvas));
      }

      this.sync(graph);
    });
    effect(() => {
      this.matching();
      this.selected();
      this.refreshClasses();
    });
    // The home-folder icon of each node: set again when the icons arrive or the theme changes the colour.
    effect(() => {
      this.nodeIcons();
      this.graph();
      this.paintIcons();
    });
    this.destroyRef.onDestroy(() => this.destroy());
  }

  protected linksOf(path: string): string {
    return this.outgoing().get(path)?.join(', ') ?? '';
  }

  protected zoomIn(): void {
    this.zoomBy(BUTTON_ZOOM_STEP);
  }

  protected zoomOut(): void {
    this.zoomBy(-BUTTON_ZOOM_STEP);
  }

  /** Fits the whole graph in view, as the map's "fit to window". */
  protected fit(): void {
    const cy = this.cy;
    if (!cy || cy.nodes().length === 0) {
      return;
    }

    this.zoomTarget = null;
    cy.resize();
    cy.fit(undefined, GRAPH_FIT_PADDING);
    if (cy.zoom() > 1.5) {
      cy.zoom({ level: 1.5, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      cy.center();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const cy = this.cy;
    if (!cy || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const pan = keyPan(event.key);
    if (pan) {
      event.preventDefault();
      cy.panBy(pan);
      return;
    }

    const zoom = keyZoom(event.key);
    if (zoom === 'fit') {
      event.preventDefault();
      this.fit();
    } else if (zoom) {
      event.preventDefault();
      this.zoomBy(zoom === 'in' ? BUTTON_ZOOM_STEP : -BUTTON_ZOOM_STEP);
    }
  }

  // --- Cytoscape ---------------------------------------------------------------------------------------

  private create(container: HTMLElement): void {
    const cy = cytoscape({
      container,
      elements: [],
      // The eased wheel zoom below replaces Cytoscape's own; its drag-pan, touch pan and pinch stay.
      userZoomingEnabled: false,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      // Nodes can be moved around by hand: it only changes this view (nothing is written to the vault).
      autoungrabify: false,
      minZoom: levelToScale(GRAPH_MIN_LEVEL),
      maxZoom: levelToScale(GRAPH_MAX_LEVEL),
      // No `pixelRatio`: left out, the canvas follows the screen's own (a retina display draws 2x). The value
      // 'auto' is not read as a number by the renderer, which then falls back to 1 and blurs everything.
      style: this.style(readColours(container)),
    });
    this.cy = cy;

    cy.on('tap', 'node', (event) => {
      const node = event.target as cytoscape.NodeSingular;
      const original = event.originalEvent as MouseEvent | undefined;
      const path = node.id();
      this.zone.run(() => {
        if (original && (original.metaKey || original.ctrlKey)) {
          this.nodeOpen.emit({ path, mode: original.altKey ? 'side' : 'tab' });
        } else {
          this.nodeSelect.emit(path);
        }
      });
    });
    cy.on('dbltap', 'node', (event) => {
      const path = (event.target as cytoscape.NodeSingular).id();
      this.zone.run(() => this.nodeOpen.emit({ path, mode: 'here' }));
    });
    cy.on('tap', (event) => {
      if (event.target === cy) {
        this.zone.run(() => this.backgroundClick.emit());
      }
    });
    cy.on('mouseover', 'node', (event) => {
      this.highlight((event.target as cytoscape.NodeSingular).id());
      this.zone.run(() => this.isOverNode.set(true));
    });
    cy.on('mouseout', 'node', () => {
      this.highlight(null);
      this.zone.run(() => this.isOverNode.set(false));
    });
    // A drag of the background pans and a drag of a node carries it: the closed hand shows for both.
    cy.on('vmousedown', () => this.zone.run(() => this.isPanning.set(true)));
    cy.on('vmouseup', () => this.zone.run(() => this.isPanning.set(false)));
    // The backdrop dots follow the view; carrying a node does not change what the others are linked to.
    cy.on('viewport', () => this.syncGrid());
    cy.on('resize', () => this.syncGrid());
    // A tap that moved a node must not count as a click: a drag is not a selection.
    cy.on('dragfree', 'node', () => this.zone.run(() => this.isPanning.set(false)));

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      this.zoomBy(wheelLevelDelta(event.deltaY, event.deltaMode, event.ctrlKey), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    const observer = new ResizeObserver(() => cy.resize());
    observer.observe(container);
    // Colours come from the theme tokens, which a canvas cannot read by itself: restyle on a theme change.
    this.themeObserver = new MutationObserver(() => {
      cy.style(this.style(readColours(container)));
      this.paintIcons();
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    this.destroyRef.onDestroy(() => {
      container.removeEventListener('wheel', onWheel);
      observer.disconnect();
    });
  }

  private destroy(): void {
    cancelAnimationFrame(this.zoomFrame);
    this.themeObserver?.disconnect();
    this.cy?.destroy();
    this.cy = null;
  }

  /** Puts the nodes and links of the graph in; the layout runs again only when the shape of the graph changed. */
  private sync(graph: FolderGraphDto): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }

    const key = `${graph.nodes.map((node) => node.path).join('|')}#${graph.edges
      .map((edge) => `${edge.source}>${edge.target}`)
      .join('|')}`;
    if (key === this.layoutKey) {
      this.refreshClasses();
      return;
    }

    this.layoutKey = key;
    const seeds = seedPositions(graph.nodes.length);
    cy.batch(() => {
      cy.elements().remove();
      cy.add([
        ...graph.nodes.map((node, index) => this.toElement(node, seeds[index])),
        ...graph.edges.map((edge) => ({
          group: 'edges' as const,
          data: { id: `${edge.source}>${edge.target}`, source: edge.source, target: edge.target },
        })),
      ]);
    });
    this.zone.runOutsideAngular(() => this.runLayout(cy, graph));
    this.refreshClasses();
  }

  private toElement(
    node: FolderGraphNodeDto,
    seed: { x: number; y: number },
  ): cytoscape.ElementDefinition {
    return {
      group: 'nodes',
      data: { id: node.path, label: shorten(node.title), full: node.title },
      position: seed,
      classes: node.external ? 'outside' : '',
    };
  }

  private runLayout(cy: cytoscape.Core, graph: FolderGraphDto): void {
    if (graph.edges.length === 0) {
      cy.layout({
        name: 'grid',
        fit: false,
        avoidOverlap: true,
        spacingFactor: 1.6,
        animate: false,
      }).run();
    } else {
      cy.layout({
        name: 'cose',
        // Start from our seeded spiral, so the same folder is laid out the same way every time.
        randomize: false,
        animate: false,
        fit: false,
        nodeRepulsion: () => 9000,
        idealEdgeLength: () => 90,
        gravity: 0.35,
        numIter: 1200,
        nodeDimensionsIncludeLabels: true,
      } as cytoscape.CoseLayoutOptions).run();
    }

    // Fit once the container has its final size (a new layout can arrive while the page is still settling).
    this.fit();
    this.syncGrid();
    requestAnimationFrame(() => {
      this.fit();
      this.syncGrid();
    });
  }

  private style(colours: GraphColours): cytoscape.StylesheetJson {
    return [
      {
        selector: 'node',
        style: {
          shape: 'rectangle',
          width: NODE_SIZE,
          height: NODE_SIZE,
          // A raised tile: the lightest surface with a firm border and a soft shadow, so it stands off the frame.
          'background-color': colours.raised,
          'border-width': 2,
          'border-color': colours.borderStrong,
          'underlay-color': colours.shadow,
          'underlay-opacity': 0.35,
          'underlay-padding': 2,
          // Cytoscape only offers a rounded underlay; the app is square, so keep the corners at nothing.
          'underlay-shape': 'round-rectangle',
          label: 'data(label)',
          color: colours.foreground,
          'font-size': 12,
          'font-weight': 500,
          'font-family': 'IBM Plex Sans, sans-serif',
          'text-valign': 'bottom',
          'text-margin-y': 7,
          'text-outline-color': colours.frame,
          'text-outline-width': 3,
          'text-outline-opacity': 1,
          'min-zoomed-font-size': 7,
          'overlay-opacity': 0,
        },
      },
      {
        selector: 'node.outside',
        style: {
          // Outside the folder: the same tile, but empty-looking (the frame's colour) and dashed.
          'background-color': colours.frame,
          'border-style': 'dashed',
          'border-color': colours.border,
          'underlay-opacity': 0,
          color: colours.muted,
        },
      },
      {
        selector: 'edge',
        style: {
          width: 1,
          'line-color': colours.borderStrong,
          'curve-style': 'straight',
          opacity: 0.8,
          'overlay-opacity': 0,
        },
      },
      { selector: 'node.selected', style: { 'border-color': colours.primary, 'border-width': 3 } },
      { selector: '.dim', style: { opacity: 0.3 } },
      { selector: 'edge.faded', style: { opacity: 0.12 } },
      { selector: 'node.faded', style: { opacity: 0.35 } },
      { selector: 'edge.near', style: { 'line-color': colours.primary, width: 1.75, opacity: 1 } },
    ];
  }

  /**
   * Gives every node the icon of its home section as a background image, in the theme's colour: a canvas cannot
   * use the icon components, so the icon becomes an SVG image first. Outside nodes keep it, a little quieter.
   */
  private paintIcons(): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }

    const colours = readColours(this.canvas().nativeElement);
    const urls = new Map<string, string>();
    const urlFor = (icon: SectionIcon, colour: string): string => {
      const key = `${icon}|${colour}`;
      let url = urls.get(key);
      if (!url) {
        url = iconToDataUrl(ARCTECH_ICONS[icon] as unknown as IconShapes, colour);
        urls.set(key, url);
      }

      return url;
    };

    const icons = this.nodeIcons();
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const icon = icons[node.id()];
        if (!icon || !(icon in ARCTECH_ICONS)) {
          node.removeStyle('background-image');
          return;
        }

        const colour = node.hasClass('outside') ? colours.muted : colours.primary;
        node.style({
          'background-image': urlFor(icon, colour),
          'background-fit': 'none',
          'background-width': NODE_ICON_SHARE,
          'background-height': NODE_ICON_SHARE,
          'background-clip': 'none',
          'background-image-containment': 'inside',
        });
      });
    });
  }

  /** The dotted backdrop follows the view: its spacing is the zoom, its offset the pan (set on every move). */
  private syncGrid(): void {
    const cy = this.cy;
    const element = this.backdrop().nativeElement;
    if (!cy) {
      return;
    }

    const grid = gridFor(cy.zoom(), cy.pan());
    if (!grid) {
      element.style.backgroundSize = '0 0';
      return;
    }

    element.style.backgroundSize = `${grid.size}px ${grid.size}px`;
    element.style.backgroundPosition = `${grid.x}px ${grid.y}px`;
  }

  /** The state the inputs ask for: the selected node, and the nodes that do not pass the filter. */
  private refreshClasses(): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }

    const matching = this.matching();
    const selected = this.selected();
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        node.toggleClass('selected', node.id() === selected);
        node.toggleClass(
          'dim',
          !!matching && !node.hasClass('outside') && !matching.has(node.id()),
        );
      });
    });
  }

  /** Hover lights the links of a node and fades the rest; null puts everything back. */
  private highlight(path: string | null): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }

    cy.batch(() => {
      cy.elements().removeClass('faded near');
      if (!path) {
        return;
      }

      const near = neighbourhood(this.graph().edges, path);
      cy.nodes().forEach((node) => {
        node.toggleClass('faded', !near.has(node.id()));
      });
      cy.edges().forEach((edge) => {
        const isNear = edge.source().id() === path || edge.target().id() === path;
        edge.toggleClass('near', isNear);
        edge.toggleClass('faded', !isNear);
      });
    });
  }

  // --- Zoom (the map's feel: eased, around the pointer) -----------------------------------------------

  private zoomBy(delta: number, anchor?: cytoscape.Position): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }

    const base = this.zoomTarget ?? scaleToLevel(cy.zoom());
    this.zoomTarget = clampLevel(base + delta);
    this.zoomAnchor = anchor ?? { x: cy.width() / 2, y: cy.height() / 2 };
    if (!this.zoomFrame) {
      this.zoomFrame = requestAnimationFrame(() => this.stepZoom());
    }
  }

  private stepZoom(): void {
    this.zoomFrame = 0;
    const cy = this.cy;
    const target = this.zoomTarget;
    const anchor = this.zoomAnchor;
    if (!cy || target === null || !anchor) {
      return;
    }

    const snap = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = easeLevel(scaleToLevel(cy.zoom()), target, snap);
    cy.zoom({ level: levelToScale(step.level), renderedPosition: anchor });
    if (step.done) {
      this.zoomTarget = null;
      return;
    }

    this.zoomFrame = requestAnimationFrame(() => this.stepZoom());
  }
}
