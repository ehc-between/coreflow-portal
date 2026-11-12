import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  LANE_HEADER_WIDTH,
  LANE_HEIGHT,
  canvasSize,
  edgeGeometry,
  nodeSize,
  wrapLabel,
} from '../data/map-model';
import { MapNode, ProcessMap } from '../data/process.models';
import { nodeTypeKey } from '../data/process-display';

export interface NodeMove {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface DrawnNode {
  readonly node: MapNode;
  readonly width: number;
  readonly height: number;
  readonly lines: readonly string[];
  readonly ariaLabel: string;
}

interface DrawnEdge {
  readonly id: string;
  readonly ariaLabel: string;
  readonly path: string;
  readonly label: string | null;
  readonly labelX: number;
  readonly labelY: number;
}

let nextCanvasId = 0;

/**
 * SVG drawing of a swimlane process map: lanes as horizontal bands with a header
 * column, steps as shapes by type (start/end pills, task boxes, decision diamonds,
 * sub-process boxes with side bars, document shapes, events) and orthogonal,
 * labelled connectors with arrowheads.
 *
 * Read-only by default. With `editable`, steps can be dragged with the pointer
 * (`nodeMove` while dragging, `dragStarted` once per drag) or moved with the arrow
 * keys (Shift for bigger steps); Delete/Backspace emits `deleteRequested`. Clicking
 * or pressing Enter on a step emits `nodeSelected`; on a connector, `edgeSelected`.
 * Every step is a focusable button with a spoken label, so the drawing is usable
 * with a keyboard and a screen reader.
 */
@Component({
  selector: 'app-process-map-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="overflow-auto rounded-[12px] border border-border bg-surface"
      [style.max-height]="maxHeight()"
    >
      <svg
        #svg
        role="group"
        [attr.aria-label]="ariaLabel()"
        [attr.width]="pixelWidth()"
        [attr.height]="pixelHeight()"
        [attr.viewBox]="viewBox()"
        class="block select-none"
        [class.touch-none]="editable()"
        (pointermove)="onPointerMove($event)"
        (pointerup)="endDrag()"
        (pointercancel)="endDrag()"
        (pointerleave)="endDrag()"
        (click)="onBackgroundClick($event)"
        (keydown.escape)="backgroundClicked.emit()"
        data-testid="map-canvas"
      >
        <defs>
          <marker
            [attr.id]="arrowId"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fg-muted)" />
          </marker>
          <marker
            [attr.id]="arrowActiveId"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
        </defs>

        @for (lane of map().lanes; track lane.id; let i = $index) {
          <g data-testid="map-lane">
            <rect
              [attr.x]="-headerWidth"
              [attr.y]="i * laneHeight"
              [attr.width]="size().width + headerWidth"
              [attr.height]="laneHeight"
              [attr.fill]="i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'"
              stroke="var(--border)"
            />
            <rect
              [attr.x]="-headerWidth"
              [attr.y]="i * laneHeight"
              [attr.width]="headerWidth - 10"
              [attr.height]="laneHeight"
              fill="var(--surface-3)"
            />
            @for (line of laneLines(lane.label); track $index; let li = $index) {
              <text
                [attr.x]="-headerWidth + 12"
                [attr.y]="i * laneHeight + 26 + li * 16"
                font-size="12.5"
                font-weight="600"
                fill="var(--fg)"
              >
                {{ line }}
              </text>
            }
          </g>
        }

        @for (edge of drawnEdges(); track edge.id) {
          <g
            class="cursor-pointer outline-none"
            role="button"
            tabindex="0"
            [attr.aria-label]="edge.ariaLabel"
            (click)="onEdgeClick($event, edge.id)"
            (keydown.enter)="edgeSelected.emit(edge.id)"
            [attr.data-testid]="'map-edge-' + edge.id"
          >
            <path [attr.d]="edge.path" fill="none" stroke="transparent" stroke-width="12" />
            <path
              [attr.d]="edge.path"
              fill="none"
              [attr.stroke]="edge.id === selectedId() ? 'var(--accent)' : 'var(--fg-muted)'"
              [attr.stroke-width]="edge.id === selectedId() ? 2.4 : 1.6"
              [attr.marker-end]="
                'url(#' + (edge.id === selectedId() ? arrowActiveId : arrowId) + ')'
              "
            />
            @if (edge.label) {
              <text
                [attr.x]="edge.labelX"
                [attr.y]="edge.labelY"
                text-anchor="middle"
                font-size="11.5"
                font-weight="600"
                fill="var(--fg-muted)"
                paint-order="stroke"
                stroke="var(--surface)"
                stroke-width="4"
              >
                {{ edge.label }}
              </text>
            }
          </g>
        }

        @for (d of drawnNodes(); track d.node.id) {
          <g
            role="button"
            tabindex="0"
            [attr.aria-label]="d.ariaLabel"
            [attr.aria-pressed]="d.node.id === selectedId()"
            [attr.transform]="'translate(' + d.node.x + ' ' + d.node.y + ')'"
            [class.cursor-move]="editable()"
            [class.cursor-pointer]="!editable()"
            class="outline-none [&:focus-visible>.cf-focus]:opacity-100"
            (pointerdown)="onPointerDown($event, d.node)"
            (click)="onNodeClick($event, d.node.id)"
            (keydown)="onNodeKeydown($event, d.node)"
            [attr.data-testid]="'map-node-' + d.node.id"
          >
            <rect
              class="cf-focus opacity-0"
              x="-5"
              y="-5"
              [attr.width]="d.width + 10"
              [attr.height]="d.height + 10"
              rx="12"
              fill="none"
              stroke="var(--accent)"
              stroke-width="2"
              stroke-dasharray="4 3"
            />
            @switch (d.node.type) {
              @case ('decision') {
                <polygon
                  [attr.points]="diamond(d.width, d.height)"
                  [attr.fill]="fill(d.node)"
                  [attr.stroke]="stroke(d.node)"
                  [attr.stroke-width]="strokeWidth(d.node)"
                />
              }
              @case ('document') {
                <path
                  [attr.d]="documentShape(d.width, d.height)"
                  [attr.fill]="fill(d.node)"
                  [attr.stroke]="stroke(d.node)"
                  [attr.stroke-width]="strokeWidth(d.node)"
                />
              }
              @default {
                <rect
                  [attr.width]="d.width"
                  [attr.height]="d.height"
                  [attr.rx]="radius(d.node.type, d.height)"
                  [attr.fill]="fill(d.node)"
                  [attr.stroke]="stroke(d.node)"
                  [attr.stroke-width]="strokeWidth(d.node)"
                  [attr.stroke-dasharray]="d.node.type === 'event' ? '5 3' : null"
                />
                @if (d.node.type === 'subprocess') {
                  <line
                    x1="12"
                    y1="0"
                    x2="12"
                    [attr.y2]="d.height"
                    [attr.stroke]="stroke(d.node)"
                  />
                  <line
                    [attr.x1]="d.width - 12"
                    y1="0"
                    [attr.x2]="d.width - 12"
                    [attr.y2]="d.height"
                    [attr.stroke]="stroke(d.node)"
                  />
                }
              }
            }
            @for (line of d.lines; track $index; let li = $index) {
              <text
                [attr.x]="d.width / 2"
                [attr.y]="d.height / 2 + (li - (d.lines.length - 1) / 2) * 14 + 4"
                text-anchor="middle"
                font-size="12"
                [attr.font-weight]="d.node.type === 'start' || d.node.type === 'end' ? 700 : 500"
                fill="var(--fg)"
                pointer-events="none"
              >
                {{ line }}
              </text>
            }
            @if (d.node.document_id) {
              <circle [attr.cx]="d.width - 4" cy="4" r="7" fill="var(--info)" />
              <text
                [attr.x]="d.width - 4"
                y="7.5"
                text-anchor="middle"
                font-size="9"
                font-weight="700"
                fill="#fff"
                pointer-events="none"
              >
                D
              </text>
            }
            @if (d.node.process_id) {
              <circle cx="4" cy="4" r="7" fill="var(--accent)" />
              <text
                x="4"
                y="7.5"
                text-anchor="middle"
                font-size="9"
                font-weight="700"
                fill="#fff"
                pointer-events="none"
              >
                P
              </text>
            }
          </g>
        }
      </svg>
    </div>
  `,
})
export class ProcessMapCanvas {
  private readonly language = inject(LanguageService);

  readonly map = input.required<ProcessMap>();
  readonly editable = input(false);
  /** Selected step or connector id. */
  readonly selectedId = input<string | null>(null);
  /** Step a connection is being drawn from (highlighted). */
  readonly connectFrom = input<string | null>(null);
  /** Steps to highlight (e.g. modelling issues). */
  readonly highlightIds = input<readonly string[]>([]);
  readonly zoom = input(1);
  readonly maxHeight = input<string | null>(null);

  readonly nodeSelected = output<string>();
  readonly edgeSelected = output<string>();
  readonly backgroundClicked = output<void>();
  readonly dragStarted = output<string>();
  readonly nodeMove = output<NodeMove>();
  readonly deleteRequested = output<string>();

  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');

  protected readonly headerWidth = LANE_HEADER_WIDTH;
  protected readonly laneHeight = LANE_HEIGHT;
  protected readonly arrowId = `cf-map-arrow-${++nextCanvasId}`;
  protected readonly arrowActiveId = `cf-map-arrow-active-${nextCanvasId}`;

  private drag: {
    id: string;
    startX: number;
    startY: number;
    nodeX: number;
    nodeY: number;
    started: boolean;
  } | null = null;
  /** Suppresses the click that ends a drag. */
  private readonly justDragged = signal(false);

  protected readonly size = computed(() => canvasSize(this.map()));
  protected readonly pixelWidth = computed(() =>
    Math.round((this.size().width + LANE_HEADER_WIDTH) * this.zoom()),
  );
  protected readonly pixelHeight = computed(() => Math.round(this.size().height * this.zoom()));
  protected readonly viewBox = computed(
    () => `${-LANE_HEADER_WIDTH} 0 ${this.size().width + LANE_HEADER_WIDTH} ${this.size().height}`,
  );

  protected readonly ariaLabel = computed(() =>
    this.language.translate('processes.map.canvasLabel', {
      steps: this.map().nodes.length,
      lanes: this.map().lanes.length,
    }),
  );

  protected readonly drawnNodes = computed<DrawnNode[]>(() => {
    const map = this.map();
    const lanes = new Map(map.lanes.map((l) => [l.id, l.label]));
    const outgoing = new Map<string, number>();
    for (const e of map.edges) {
      outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1);
    }
    return map.nodes.map((node) => {
      const { width, height } = nodeSize(node);
      const maxChars = Math.max(
        6,
        Math.floor((node.type === 'decision' ? width * 0.6 : width - 24) / 6.6),
      );
      const type = this.language.translate(nodeTypeKey(node.type));
      const lane = node.lane_id ? lanes.get(node.lane_id) : null;
      return {
        node,
        width,
        height,
        lines: wrapLabel(node.label || type, maxChars, node.type === 'decision' ? 2 : 3),
        ariaLabel: this.language.translate(
          lane ? 'processes.map.nodeAriaInLane' : 'processes.map.nodeAria',
          { type, label: node.label || type, lane: lane ?? '', next: outgoing.get(node.id) ?? 0 },
        ),
      };
    });
  });

  protected readonly drawnEdges = computed<DrawnEdge[]>(() => {
    const map = this.map();
    const nodes = new Map(map.nodes.map((n) => [n.id, n]));
    const edges: DrawnEdge[] = [];
    for (const e of map.edges) {
      const source = nodes.get(e.source);
      const target = nodes.get(e.target);
      if (!source || !target) {
        continue;
      }
      const geometry = edgeGeometry(source, target);
      const ariaLabel = this.language.translate('processes.map.edgeAria', {
        from: source.label || this.language.translate(nodeTypeKey(source.type)),
        to: target.label || this.language.translate(nodeTypeKey(target.type)),
        label: e.label ?? '',
      });
      edges.push({ id: e.id, label: e.label ?? null, ariaLabel, ...geometry });
    }
    return edges;
  });

  private readonly highlighted = computed(() => new Set(this.highlightIds()));

  protected laneLines(label: string): string[] {
    return wrapLabel(label, 18, 6);
  }

  protected radius(type: string, height: number): number {
    return type === 'start' || type === 'end' || type === 'event' ? height / 2 : 10;
  }

  protected diamond(width: number, height: number): string {
    return `${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`;
  }

  protected documentShape(width: number, height: number): string {
    const wave = height - 10;
    return (
      `M 0 6 Q 0 0 6 0 H ${width - 6} Q ${width} 0 ${width} 6 V ${wave} ` +
      `C ${width * 0.75} ${height + 6}, ${width * 0.25} ${wave - 12}, 0 ${wave} Z`
    );
  }

  protected fill(node: MapNode): string {
    if (node.id === this.selectedId() || node.id === this.connectFrom()) {
      return 'var(--accent-soft)';
    }
    switch (node.type) {
      case 'start':
        return 'var(--pass-soft)';
      case 'end':
        return 'var(--fail-soft)';
      case 'decision':
        return 'var(--warn-soft)';
      case 'document':
        return 'var(--info-soft)';
      default:
        return 'var(--surface)';
    }
  }

  protected stroke(node: MapNode): string {
    if (node.id === this.selectedId() || node.id === this.connectFrom()) {
      return 'var(--accent)';
    }
    if (this.highlighted().has(node.id)) {
      return 'var(--warn)';
    }
    return 'var(--border-strong)';
  }

  protected strokeWidth(node: MapNode): number {
    if (node.id === this.selectedId() || node.id === this.connectFrom()) {
      return 2.4;
    }
    return node.type === 'end' ? 2.6 : 1.4;
  }

  // --- interaction -------------------------------------------------------------------

  protected onPointerDown(event: PointerEvent, node: MapNode): void {
    if (!this.editable() || event.button !== 0) {
      return;
    }
    this.drag = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
      started: false,
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    const zoom = this.zoom() || 1;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    if (!drag.started) {
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        return;
      }
      drag.started = true;
      this.dragStarted.emit(drag.id);
    }
    this.nodeMove.emit({ id: drag.id, x: drag.nodeX + dx, y: drag.nodeY + dy });
  }

  protected endDrag(): void {
    if (this.drag?.started) {
      this.justDragged.set(true);
    }
    this.drag = null;
  }

  protected onNodeClick(event: MouseEvent, id: string): void {
    event.stopPropagation();
    if (this.justDragged()) {
      this.justDragged.set(false);
      return;
    }
    this.nodeSelected.emit(id);
  }

  protected onEdgeClick(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.edgeSelected.emit(id);
  }

  protected onBackgroundClick(event: MouseEvent): void {
    if (this.justDragged()) {
      this.justDragged.set(false);
      return;
    }
    if (event.target === this.svg()?.nativeElement || this.isLaneTarget(event.target)) {
      this.backgroundClicked.emit();
    }
  }

  private isLaneTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('[data-testid="map-lane"]') !== null;
  }

  protected onNodeKeydown(event: KeyboardEvent, node: MapNode): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.nodeSelected.emit(node.id);
      return;
    }
    if (!this.editable()) {
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteRequested.emit(node.id);
      return;
    }
    const step = event.shiftKey ? 50 : 10;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (move) {
      event.preventDefault();
      this.dragStarted.emit(node.id);
      this.nodeMove.emit({ id: node.id, x: node.x + move[0], y: node.y + move[1] });
    }
  }
}
