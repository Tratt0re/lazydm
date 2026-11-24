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
  keyPan,
  keyZoom,
  levelToScale,
  neighbourhood,
  scaleToLevel,
  seedPositions,
  wheelLevelDelta,
} from '@/config/section-graph.config';
import { ArcTechButtonComponent } from '@/shared/components/button';
import { ArcTechIconComponent } from '@/shared/components/icon';
import { ArcTechTooltipImports } from '@/shared/components/tooltip';

/** What a click on a node asks for: select it, open it, open it in a tab or to the side. */
export interface GraphNodeOpen {
  readonly path: string;
  readonly mode: 'here' | 'tab' | 'side';
}

interface GraphColours {
  readonly card: string;
  readonly recessed: string;
  readonly foreground: string;
  readonly muted: string;
  readonly primary: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly ring: string;
}

const NODE_SIZE = 32;
const LABEL_MAX_LENGTH = 22;

function readColours(host: HTMLElement): GraphColours {
  const styles = getComputedStyle(host);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
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
  host: { class: 'relative block h-[34rem] min-h-80 border border-border bg-recessed' },
  template: `
    <!-- Cytoscape makes its container position: relative, so the sized wrapper does the absolute positioning. -->
    <div class="absolute inset-0 overflow-hidden">
      <div
        #canvas
        class="size-full touch-none outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        tabindex="0"
        role="application"
        [attr.aria-label]="'campaigns.sections.graph.ariaLabel' | translate"
        [style.cursor]="isPanning() ? 'grabbing' : 'grab'"
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
        <p class="font-display text-lg font-bold tracking-[0.02em] text-foreground-strong uppercase">
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
        <i class="inline-block size-3 border-[1.5px] border-border-strong bg-card"></i>
        {{ 'campaigns.sections.graph.legendInside' | translate }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <i class="inline-block size-3 border-[1.5px] border-dashed border-border bg-recessed"></i>
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
  readonly nodeSelect = output<string>();
  readonly nodeOpen = output<GraphNodeOpen>();
  /** The background was clicked: the page closes the detail panel. */
  readonly backgroundClick = output<void>();

  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private cy: cytoscape.Core | null = null;
  private zoomTarget: number | null = null;
  private zoomAnchor: cytoscape.Position | null = null;
  private zoomFrame = 0;
  private themeObserver: MutationObserver | null = null;
  private layoutKey = '';
  protected readonly isPanning = signal(false);
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
      autoungrabify: true,
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
    cy.on('mouseover', 'node', (event) =>
      this.highlight((event.target as cytoscape.NodeSingular).id()),
    );
    cy.on('mouseout', 'node', () => this.highlight(null));
    // A drag of the background pans: show the closed hand while it does.
    cy.on('vmousedown', (event) => {
      if (event.target === cy) {
        this.zone.run(() => this.isPanning.set(true));
      }
    });
    cy.on('vmouseup', () => this.zone.run(() => this.isPanning.set(false)));

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
    this.themeObserver = new MutationObserver(() => cy.style(this.style(readColours(container))));
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
    requestAnimationFrame(() => this.fit());
  }

  private style(colours: GraphColours): cytoscape.StylesheetJson {
    return [
      {
        selector: 'node',
        style: {
          shape: 'rectangle',
          width: NODE_SIZE,
          height: NODE_SIZE,
          'background-color': colours.card,
          'border-width': 1.5,
          'border-color': colours.borderStrong,
          label: 'data(label)',
          color: colours.foreground,
          'font-size': 12,
          'font-family': 'IBM Plex Sans, sans-serif',
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'text-outline-color': colours.recessed,
          'text-outline-width': 3,
          'min-zoomed-font-size': 7,
          'overlay-opacity': 0,
        },
      },
      {
        selector: 'node.outside',
        style: {
          'background-color': colours.recessed,
          'border-style': 'dashed',
          'border-color': colours.border,
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
