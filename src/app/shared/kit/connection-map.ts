import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  Injector,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { ConnectionGraph, GraphEdge, GraphNode } from '../../core/kit/connections.models';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { KitApi } from '../../core/kit/kit-api';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { trapTabKey } from '../ui/focus-trap';
import { Icon } from '../ui/icon/icon';
import { provideKitScope } from './kit-scope';

/** Height of one node box and the step between rows (px); the SVG connectors use them. */
export const NODE_HEIGHT = 44;
export const ROW_STEP = 52;
const CONNECTOR_WIDTH = 44;

export type MapColumn = 'requirements' | 'record' | 'related' | 'further';

/** A node placed in a column of the map. */
export interface PlacedNode {
  readonly node: GraphNode;
  readonly column: MapColumn;
  readonly row: number;
}

export interface MapLayout {
  readonly columns: Readonly<Record<MapColumn, readonly PlacedNode[]>>;
  readonly height: number;
  readonly edges: readonly GraphEdge[];
}

/**
 * Place the graph in four columns: requirements the record documents | the
 * record itself (and its people) | records and tasks it is connected to |
 * records two steps away (depth 2, incl. their requirements). Pure, for tests.
 */
export function layoutGraph(graph: ConnectionGraph): MapLayout | null {
  const root = graph.nodes.find((n) => n.depth === 0);
  if (!root) {
    return null;
  }
  const touchesRoot = new Set<string>();
  for (const e of graph.edges) {
    if (e.from === root.id) {
      touchesRoot.add(e.to);
    } else if (e.to === root.id) {
      touchesRoot.add(e.from);
    }
  }
  const cols: Record<MapColumn, GraphNode[]> = {
    requirements: [],
    record: [root],
    related: [],
    further: [],
  };
  for (const node of graph.nodes) {
    if (node === root) {
      continue;
    }
    const direct = touchesRoot.has(node.id);
    if (node.kind === 'requirement' && direct) {
      cols.requirements.push(node);
    } else if (node.kind === 'person' && direct) {
      cols.record.push(node);
    } else if (node.kind !== 'person' && (direct || node.depth <= 1)) {
      cols.related.push(node);
    } else {
      cols.further.push(node);
    }
  }
  // Records before tasks, then by type so groups stay together.
  const order = (n: GraphNode) => (n.kind === 'task' ? 1 : 0);
  cols.related.sort((a, b) => order(a) - order(b) || a.entity_type.localeCompare(b.entity_type));
  // Two steps away: next to the neighbour they hang off, to keep lines short.
  const rowOf = new Map(cols.related.map((n, i) => [n.id, i]));
  const anchor = (n: GraphNode) => {
    let best = Number.MAX_SAFE_INTEGER;
    for (const e of graph.edges) {
      const other = e.from === n.id ? e.to : e.to === n.id ? e.from : null;
      const row = other ? rowOf.get(other) : undefined;
      if (row !== undefined && row < best) {
        best = row;
      }
    }
    return best;
  };
  cols.further.sort((a, b) => anchor(a) - anchor(b) || order(a) - order(b));
  const tallest = Math.max(...Object.values(cols).map((c) => c.length), 1);
  const height = tallest * ROW_STEP - (ROW_STEP - NODE_HEIGHT);
  const place = (column: MapColumn): PlacedNode[] =>
    cols[column].map((node, row) => ({ node, column, row }));
  return {
    columns: {
      requirements: place('requirements'),
      record: place('record'),
      related: place('related'),
      further: place('further'),
    },
    height,
    edges: graph.edges,
  };
}

/** Vertical centre (px) of row `row` in a column of `count` nodes, centred in `height`. */
export function rowCentre(row: number, count: number, height: number): number {
  const columnHeight = count * ROW_STEP - (ROW_STEP - NODE_HEIGHT);
  return (height - columnHeight) / 2 + row * ROW_STEP + NODE_HEIGHT / 2;
}

interface Connector {
  readonly key: string;
  readonly d: string;
  readonly dashed: boolean;
  readonly ends: readonly [string, string];
}

const COLUMN_ORDER: readonly MapColumn[] = ['requirements', 'record', 'related', 'further'];

/**
 * Connection map of one record (P4), as a dialog: the requirements it documents
 * on the left, the record in the middle, the records and tasks it is connected
 * to on the right, optionally one step further. Pure HTML / CSS with SVG
 * connectors (no chart library). Every node opens its record; Arrow keys move
 * between nodes. Below 640 px the map becomes a grouped list.
 */
@Component({
  selector: 'app-connection-map',
  imports: [TranslocoPipe, Icon],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
        <button
          type="button"
          tabindex="-1"
          class="absolute inset-0 cursor-default bg-black/40"
          [attr.aria-label]="'kit.map.close' | transloco"
          (click)="close()"
        ></button>
        <div
          #panel
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          [attr.aria-labelledby]="titleId"
          class="relative flex max-h-full w-full max-w-[1160px] flex-col rounded-card border border-border bg-surface shadow-pop outline-none"
          (keydown)="onKeydown($event)"
          data-testid="connection-map"
        >
          <div
            class="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5"
          >
            <div class="min-w-0">
              <h2 [id]="titleId" class="font-display text-section font-bold text-fg">
                {{ 'kit.map.title' | transloco }}
              </h2>
              @if (rootTitle(); as t) {
                <p class="truncate text-meta text-fg-muted">{{ t }}</p>
              }
            </div>
            <div class="flex flex-none items-center gap-3">
              <label class="hidden items-center gap-2 text-meta text-fg-muted sm:flex">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-accent"
                  [checked]="depth() === 2"
                  (change)="setDepth($any($event.target).checked ? 2 : 1)"
                  data-testid="map-depth"
                />
                {{ 'kit.map.depth2' | transloco }}
              </label>
              <button
                #closeButton
                type="button"
                class="flex h-9 w-9 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="'kit.map.close' | transloco"
                (click)="close()"
              >
                <app-icon name="x" [size]="18" />
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
            @if (loading()) {
              <p class="py-10 text-center text-ui text-fg-muted" aria-live="polite">
                {{ 'kit.map.loading' | transloco }}
              </p>
            } @else if (errorKey(); as key) {
              <div class="py-10 text-center">
                <p class="text-ui text-fg-muted">{{ key | transloco }}</p>
                <button
                  type="button"
                  class="mt-2 text-ui font-semibold text-accent hover:underline"
                  (click)="load()"
                >
                  {{ 'kit.connections.retry' | transloco }}
                </button>
              </div>
            } @else if (layout(); as l) {
              @if (onlyRoot()) {
                <p class="py-10 text-center text-ui text-fg-muted" data-testid="map-empty">
                  {{ 'kit.map.empty' | transloco }}
                </p>
              } @else {
                <!-- Desktop: columns with connectors -->
                <div class="hidden sm:block">
                  <div class="grid gap-y-2" [style.grid-template-columns]="gridColumns()">
                    @for (col of visibleColumns(); track col; let i = $index) {
                      @if (i > 0) {
                        <span></span>
                      }
                      <p
                        class="text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase"
                      >
                        {{ 'kit.map.columns.' + col | transloco }}
                        @if (col !== 'record') {
                          · {{ l.columns[col].length }}
                        }
                      </p>
                    }
                    @for (col of visibleColumns(); track col; let i = $index) {
                      @if (i > 0) {
                        <svg
                          [attr.width]="connectorWidth"
                          [attr.height]="l.height"
                          [attr.viewBox]="'0 0 ' + connectorWidth + ' ' + l.height"
                          aria-hidden="true"
                          class="overflow-visible"
                        >
                          @for (c of connectors()[i - 1]; track c.key) {
                            <path
                              [attr.d]="c.d"
                              fill="none"
                              stroke-width="1.5"
                              [attr.stroke-dasharray]="c.dashed ? '4 3' : null"
                              [class]="isLit(c) ? 'stroke-accent' : 'stroke-border-strong'"
                            />
                          }
                        </svg>
                      }
                      <ul class="relative min-w-0" [style.height.px]="l.height">
                        @if (l.columns[col].length === 0) {
                          <li
                            class="absolute inset-x-0 top-0 rounded-tile border border-dashed border-border px-2.5 py-2 text-micro text-fg-subtle"
                          >
                            {{ 'kit.map.columnEmpty.' + col | transloco }}
                          </li>
                        }
                        @for (p of l.columns[col]; track p.node.id) {
                          <li
                            class="absolute inset-x-0"
                            [style.top.px]="top(p, l.columns[col].length, l.height)"
                          >
                            <a
                              [attr.href]="p.node.url"
                              tabindex="0"
                              [attr.data-col]="i"
                              [attr.data-row]="p.row"
                              [attr.aria-label]="nodeLabel(p.node)"
                              class="flex flex-col justify-center overflow-hidden rounded-tile border px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              [style.height.px]="nodeHeight"
                              [class]="nodeClass(p)"
                              (mouseenter)="lit.set(p.node.id)"
                              (mouseleave)="lit.set(null)"
                              (focus)="lit.set(p.node.id)"
                              (blur)="lit.set(null)"
                              (click)="openNode($event, p.node)"
                              data-testid="map-node"
                            >
                              <span
                                class="truncate text-micro font-semibold tracking-[0.03em] text-fg-subtle uppercase"
                                >{{ kindLabel(p.node) }}</span
                              >
                              <span class="truncate text-meta text-fg">
                                @if (p.node.code) {
                                  <span class="font-mono text-fg-muted">{{
                                    nodeCode(p.node)
                                  }}</span>
                                }
                                {{ p.node.title }}
                              </span>
                            </a>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                  <p
                    class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-fg-subtle"
                  >
                    <span class="inline-flex items-center gap-1.5"
                      ><svg width="22" height="6" aria-hidden="true">
                        <line
                          x1="0"
                          y1="3"
                          x2="22"
                          y2="3"
                          class="stroke-border-strong"
                          stroke-width="1.5"
                        /></svg
                      >{{ 'kit.map.legend.confirmed' | transloco }}</span
                    >
                    <span class="inline-flex items-center gap-1.5"
                      ><svg width="22" height="6" aria-hidden="true">
                        <line
                          x1="0"
                          y1="3"
                          x2="22"
                          y2="3"
                          class="stroke-border-strong"
                          stroke-width="1.5"
                          stroke-dasharray="4 3"
                        /></svg
                      >{{ 'kit.map.legend.suggested' | transloco }}</span
                    >
                    <span>{{ 'kit.map.legend.keys' | transloco }}</span>
                  </p>
                </div>

                <!-- Phones: grouped list -->
                <div class="flex flex-col gap-4 sm:hidden" data-testid="map-list">
                  @for (col of listColumns(); track col) {
                    @if (l.columns[col].length > 0) {
                      <section>
                        <h3
                          class="mb-1.5 text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase"
                        >
                          {{ 'kit.map.columns.' + col | transloco }} · {{ l.columns[col].length }}
                        </h3>
                        <ul class="flex flex-col gap-1.5">
                          @for (p of l.columns[col]; track p.node.id) {
                            <li>
                              <a
                                [attr.href]="p.node.url"
                                class="flex min-h-11 flex-col justify-center rounded-tile border px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                [class]="nodeClass(p)"
                                (click)="openNode($event, p.node)"
                              >
                                <span class="text-micro font-semibold text-fg-subtle uppercase">{{
                                  kindLabel(p.node)
                                }}</span>
                                <span class="text-meta text-fg">
                                  @if (p.node.code) {
                                    <span class="font-mono text-fg-muted">{{
                                      nodeCode(p.node)
                                    }}</span>
                                  }
                                  {{ p.node.title }}
                                </span>
                              </a>
                            </li>
                          }
                        </ul>
                      </section>
                    }
                  }
                </div>
              }
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class ConnectionMap {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  readonly open = input(false);
  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  protected readonly titleId = `cf-map-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly nodeHeight = NODE_HEIGHT;
  protected readonly connectorWidth = CONNECTOR_WIDTH;
  protected readonly depth = signal<1 | 2>(1);
  protected readonly graph = signal<ConnectionGraph | null>(null);
  protected readonly loading = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  /** Node whose connectors are highlighted (hover / focus). */
  protected readonly lit = signal<string | null>(null);

  protected readonly layout = computed(() => {
    const g = this.graph();
    return g ? layoutGraph(g) : null;
  });

  protected readonly onlyRoot = computed(() => (this.graph()?.nodes.length ?? 0) <= 1);

  protected readonly rootTitle = computed(() => {
    const root = this.layout()?.columns.record[0]?.node;
    return root ? [root.code, root.title].filter(Boolean).join(' ') : null;
  });

  protected readonly visibleColumns = computed<readonly MapColumn[]>(() => {
    const l = this.layout();
    if (!l) {
      return [];
    }
    return COLUMN_ORDER.filter(
      (c) => c === 'record' || c === 'related' || c === 'requirements' || l.columns[c].length > 0,
    );
  });

  protected readonly listColumns = computed<readonly MapColumn[]>(() => [
    'record',
    'requirements',
    'related',
    'further',
  ]);

  protected readonly gridColumns = computed(() =>
    this.visibleColumns()
      .map((c) => (c === 'record' ? 'minmax(0,0.85fr)' : 'minmax(0,1fr)'))
      .join(` ${CONNECTOR_WIDTH}px `),
  );

  /** SVG paths per gap between two visible columns. */
  protected readonly connectors = computed<readonly (readonly Connector[])[]>(() => {
    const l = this.layout();
    if (!l) {
      return [];
    }
    const cols = this.visibleColumns();
    const where = new Map<string, { col: number; y: number }>();
    cols.forEach((col, index) => {
      const nodes = l.columns[col];
      for (const p of nodes) {
        where.set(p.node.id, { col: index, y: rowCentre(p.row, nodes.length, l.height) });
      }
    });
    const gaps: Connector[][] = cols.slice(1).map(() => []);
    for (const edge of l.edges) {
      const a = where.get(edge.from);
      const b = where.get(edge.to);
      if (!a || !b || Math.abs(a.col - b.col) !== 1) {
        continue;
      }
      const [left, right] = a.col < b.col ? [a, b] : [b, a];
      const w = CONNECTOR_WIDTH;
      gaps[left.col].push({
        key: `${edge.from}>${edge.to}:${edge.link_type}`,
        d: `M0,${left.y} C${w / 2},${left.y} ${w / 2},${right.y} ${w},${right.y}`,
        dashed: edge.origin === 'requirement_suggested' || edge.origin === 'suggested',
        ends: [edge.from, edge.to],
      });
    }
    return gaps;
  });

  private sub: Subscription | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const open = this.open();
      this.entityType();
      this.entityId();
      this.language.active();
      untracked(() => {
        if (open) {
          this.returnFocus = document.activeElement as HTMLElement | null;
          this.load();
          afterNextRender(() => this.closeButton()?.nativeElement.focus(), {
            injector: this.injector,
          });
        } else {
          this.sub?.unsubscribe();
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.errorKey.set(null);
    this.sub = this.api
      .connectionGraph(
        orgId,
        this.entityType(),
        this.entityId(),
        this.depth(),
        this.language.active(),
      )
      .subscribe({
        next: (g) => {
          this.graph.set(g);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.graph.set(null);
          this.errorKey.set(kitErrorKey(error));
          this.loading.set(false);
        },
      });
  }

  protected setDepth(depth: 1 | 2): void {
    this.depth.set(depth);
    this.load();
  }

  protected top(p: PlacedNode, count: number, height: number): number {
    return rowCentre(p.row, count, height) - NODE_HEIGHT / 2;
  }

  protected isLit(c: Connector): boolean {
    const id = this.lit();
    return id !== null && (c.ends[0] === id || c.ends[1] === id);
  }

  protected nodeClass(p: PlacedNode): string {
    if (p.column === 'record' && p.row === 0) {
      return 'border-accent bg-accent-soft';
    }
    switch (p.node.kind) {
      case 'requirement':
        return 'border-accent-border bg-surface hover:bg-surface-2';
      case 'person':
        return 'border-border bg-surface-2 hover:bg-surface';
      case 'task':
        return 'border-dashed border-border bg-surface hover:bg-surface-2';
      default:
        return 'border-border bg-surface hover:bg-surface-2';
    }
  }

  protected kindLabel(node: GraphNode): string {
    switch (node.kind) {
      case 'requirement':
        return this.frameworkName(node);
      case 'person':
        return this.language.translate('kit.map.kinds.person');
      default:
        return this.entityTypes.label(node.entity_type, node.label_key);
    }
  }

  /** Short standard name of a requirement node ("ISO 9001", "KI-forordningen"). */
  private frameworkName(node: GraphNode): string {
    const key = node.framework ? `kit.frameworks.${node.framework}` : null;
    const short = key ? this.language.translate(key) : '';
    if (short && short !== key) {
      return short;
    }
    return node.standard_name || this.language.translate('kit.map.kinds.requirement');
  }

  /**
   * Node code; requirements that share a clause number get "(requirement 2)" so
   * two boxes never read the same (polish plan 2.1: never show raw `.rN`).
   */
  protected nodeCode(node: GraphNode): string {
    const code = node.code ?? '';
    if (node.kind !== 'requirement' || !node.ref || !code) {
      return code;
    }
    const twins = this.sharedClauses().get(`${node.framework}:${code}`) ?? 0;
    const n = /\.r(\d+)$/.exec(node.ref)?.[1];
    return twins > 1 && n
      ? `${code} (${this.language.translate('kit.map.requirementPart', { n })})`
      : code;
  }

  /** How many requirement nodes share each framework + clause number. */
  private readonly sharedClauses = computed(() => {
    const counts = new Map<string, number>();
    for (const n of this.graph()?.nodes ?? []) {
      if (n.kind === 'requirement') {
        const key = `${n.framework}:${n.code}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  });

  protected nodeLabel(node: GraphNode): string {
    return [this.kindLabel(node), this.nodeCode(node), node.title].filter(Boolean).join(' ');
  }

  protected openNode(event: MouseEvent, node: GraphNode): void {
    if (!node.url) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.close(false);
    void this.router.navigateByUrl(node.url);
  }

  protected onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  protected close(restoreFocus = true): void {
    this.closed.emit();
    if (restoreFocus) {
      this.returnFocus?.focus?.();
    }
    this.returnFocus = null;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return;
    }
    if (event.key === 'Tab') {
      trapTabKey(panel, event);
      return;
    }
    const target = event.target as HTMLElement | null;
    const col = Number(target?.getAttribute('data-col'));
    const row = Number(target?.getAttribute('data-row'));
    if (!target?.hasAttribute('data-col') || Number.isNaN(col) || Number.isNaN(row)) {
      return;
    }
    const nodesIn = (c: number) =>
      Array.from(panel.querySelectorAll<HTMLElement>(`[data-col="${c}"]`));
    let next: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = nodesIn(col).find((el) => Number(el.getAttribute('data-row')) === row + 1);
        break;
      case 'ArrowUp':
        next = nodesIn(col).find((el) => Number(el.getAttribute('data-row')) === row - 1);
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const nodes = nodesIn(event.key === 'ArrowLeft' ? col - 1 : col + 1);
        next = nodes[Math.min(row, nodes.length - 1)];
        break;
      }
      default:
        return;
    }
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }
}
