import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Switch } from '../../../shared/ui/switch/switch';
import { wrapLabel } from '../data/map-model';
import { PROCESS_NAV } from '../data/process-nav';
import { InteractionMap, PROCESS_MODULE } from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';
import {
  BAND_HEIGHT,
  BOX_HEIGHT,
  BOX_WIDTH,
  BandKey,
  PlacedBox,
  layoutInteractions,
} from './interaction-layout';

/** Table row: one interaction in words. */
interface FlowRow {
  readonly id: string;
  readonly from: string;
  readonly fromLink: string | null;
  readonly to: string;
  readonly toLink: string | null;
  readonly label: string | null;
}

/**
 * The process interaction map (`/processes/interaction-map`): every process in
 * management / core / support bands, and the interested parties it receives
 * from or delivers to (customers, authorities …) in a band on top, with arrows
 * for what flows between them (ISO 9001 4.4.1 b, linked to Context 4.2).
 * Clicking a box opens it. The table lists the same interactions in words; on
 * phones it is the default view.
 */
@Component({
  selector: 'app-interaction-map-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    Switch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="processes.interactionMap.title"
        descriptionKey="processes.interactionMap.description"
        [breadcrumbs]="[
          { labelKey: 'modules.names.processes', link: '/processes' },
          { labelKey: 'processes.nav.interactionMap' },
        ]"
      />
      <app-module-nav class="mb-4 block" labelKey="modules.names.processes" [items]="nav" />
      <app-help-strip scope="processes" page="interactionMap" />

      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="inline-flex overflow-hidden rounded-tile border border-border" role="group">
          @for (v of views; track v) {
            <button
              type="button"
              class="min-h-9 px-3 text-ui font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class]="
                view() === v ? 'bg-accent text-white' : 'bg-surface text-fg-muted hover:text-fg'
              "
              [attr.aria-pressed]="view() === v"
              (click)="view.set(v)"
              [attr.data-testid]="'im-view-' + v"
            >
              {{ 'processes.interactionMap.view.' + v | transloco }}
            </button>
          }
        </div>
        <div class="w-auto">
          <app-switch [checked]="includeRetired()" (checkedChange)="includeRetired.set($event)">
            {{ 'processes.interactionMap.includeRetired' | transloco }}
          </app-switch>
        </div>
      </div>

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (!data()) {
        <app-loading-state [rows]="4" />
      } @else if (layout().nodes.length === 0) {
        <app-card>
          <app-empty-state
            icon="projects"
            titleKey="processes.interactionMap.emptyTitle"
            bodyKey="processes.interactionMap.empty"
            ctaKey="processes.nav.register"
            ctaLink="/processes"
          />
        </app-card>
      } @else {
        @if (view() === 'map') {
          <div class="overflow-x-auto rounded-card border border-border bg-surface">
            <svg
              width="100%"
              [style.max-width.px]="layout().width"
              [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height"
              [style.min-width.px]="layout().width * 0.62"
              preserveAspectRatio="xMidYMin meet"
              role="group"
              [attr.aria-label]="'processes.interactionMap.svgLabel' | transloco"
              class="block"
              data-testid="interaction-svg"
            >
              <defs>
                <marker
                  id="cf-im-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fg-muted)" />
                </marker>
              </defs>
              @for (band of layout().bands; track band.key; let i = $index) {
                <rect
                  x="0"
                  [attr.y]="band.y"
                  [attr.width]="layout().width"
                  [attr.height]="bandHeight"
                  [attr.fill]="i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'"
                />
                <text
                  x="14"
                  [attr.y]="band.y + 18"
                  font-size="11.5"
                  font-weight="700"
                  fill="var(--fg-muted)"
                  letter-spacing="0.04em"
                >
                  {{ bandLabel(band.key) | transloco }}
                </text>
              }
              @for (edge of layout().edges; track edge.id) {
                <path
                  [attr.d]="edge.path"
                  fill="none"
                  [attr.stroke]="
                    isActive(edge.sourceId, edge.targetId) ? 'var(--accent)' : 'var(--fg-muted)'
                  "
                  [attr.stroke-width]="isActive(edge.sourceId, edge.targetId) ? 2.2 : 1.4"
                  [attr.stroke-dasharray]="edge.party ? '6 4' : null"
                  marker-end="url(#cf-im-arrow)"
                />
              }
              @for (p of layout().nodes; track p.kind + p.id) {
                <g
                  role="link"
                  tabindex="0"
                  class="cursor-pointer outline-none"
                  [attr.aria-label]="(p.code ? p.code + ' ' : '') + p.title"
                  [attr.transform]="'translate(' + p.x + ' ' + p.y + ')'"
                  (click)="open(p)"
                  (keydown.enter)="open(p)"
                  (mouseenter)="hovered.set(p.id)"
                  (mouseleave)="hovered.set(null)"
                  (focus)="hovered.set(p.id)"
                  (blur)="hovered.set(null)"
                  [attr.data-testid]="'im-node-' + p.id"
                >
                  <title>{{ p.title }}</title>
                  <rect
                    [attr.width]="boxWidth"
                    [attr.height]="boxHeight"
                    [attr.rx]="p.kind === 'party' ? 32 : 10"
                    [attr.fill]="fill(p)"
                    [attr.stroke]="hovered() === p.id ? 'var(--accent)' : 'var(--border-strong)'"
                    [attr.stroke-width]="hovered() === p.id ? 2.2 : 1.2"
                    [attr.stroke-dasharray]="p.status === 'draft' ? '5 3' : null"
                  />
                  @if (p.code) {
                    <text
                      x="14"
                      y="18"
                      font-size="10.5"
                      font-family="monospace"
                      fill="var(--fg-subtle)"
                    >
                      {{ p.code }}
                    </text>
                  }
                  @for (line of titleLines(p.title); track $index; let li = $index) {
                    <text
                      x="14"
                      [attr.y]="(p.code ? 35 : 28) + li * 15"
                      font-size="12.5"
                      font-weight="600"
                      fill="var(--fg)"
                    >
                      {{ line }}
                    </text>
                  }
                </g>
              }
              <!-- Labels last, so no box covers them. -->
              @for (edge of layout().edges; track edge.id) {
                @if (edge.label) {
                  <text
                    [attr.x]="edge.labelX"
                    [attr.y]="edge.labelY"
                    [attr.text-anchor]="edge.anchor"
                    font-size="11"
                    fill="var(--fg-muted)"
                    paint-order="stroke"
                    stroke="var(--surface)"
                    stroke-width="4"
                    pointer-events="none"
                  >
                    {{ edge.label }}
                  </text>
                }
              }
            </svg>
          </div>
          <p class="mt-2 text-meta text-fg-subtle">
            {{ 'processes.interactionMap.legend' | transloco }}
          </p>
        } @else {
          <app-card [padded]="false">
            @if (rows().length === 0) {
              <p class="px-4 py-6 text-ui text-fg-muted">
                {{ 'processes.interactionMap.noEdges' | transloco }}
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-left text-ui" data-testid="im-table">
                  <caption class="sr-only">
                    {{
                      'processes.interactionMap.table' | transloco
                    }}
                  </caption>
                  <thead>
                    <tr class="text-meta text-fg-muted">
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'processes.interactionMap.from' | transloco }}
                      </th>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'processes.interactionMap.flow' | transloco }}
                      </th>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'processes.interactionMap.to' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows(); track row.id) {
                      <tr class="border-t border-border align-top">
                        <td class="px-4 py-2">
                          @if (row.fromLink) {
                            <a [routerLink]="row.fromLink" class="text-accent hover:underline">{{
                              row.from
                            }}</a>
                          } @else {
                            {{ row.from }}
                          }
                        </td>
                        <td class="px-4 py-2 text-fg-muted">{{ row.label || '—' }}</td>
                        <td class="px-4 py-2">
                          @if (row.toLink) {
                            <a [routerLink]="row.toLink" class="text-accent hover:underline">{{
                              row.to
                            }}</a>
                          } @else {
                            {{ row.to }}
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-card>
        }
        @if (!hasParties()) {
          <p class="mt-3 text-meta text-fg-muted">
            {{ 'processes.interactionMap.noParties' | transloco }}
          </p>
        }
      }
      <app-why-it-matters class="mt-8 block" scope="processes" page="interactionMap" />
    </div>
  `,
})
export class InteractionMapPage {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  protected readonly nav = PROCESS_NAV;
  protected readonly views = ['map', 'table'] as const;
  protected readonly bandHeight = BAND_HEIGHT;
  protected readonly boxWidth = BOX_WIDTH;
  protected readonly boxHeight = BOX_HEIGHT;

  /** Phones start on the table: the drawing needs more width than they have. */
  protected readonly view = signal<'map' | 'table'>(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 639px)').matches
      ? 'table'
      : 'map',
  );
  protected readonly includeRetired = signal(false);
  protected readonly data = signal<InteractionMap | null>(null);
  protected readonly error = signal(false);
  protected readonly hovered = signal<string | null>(null);

  protected readonly layout = computed(() =>
    layoutInteractions(this.data() ?? { nodes: [], edges: [] }),
  );
  protected readonly hasParties = computed(() => (this.data()?.parties?.length ?? 0) > 0);

  protected readonly rows = computed<FlowRow[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const nodes = new Map(data.nodes.map((n) => [n.id, n]));
    const parties = new Map((data.parties ?? []).map((p) => [p.id, p]));
    const rows: FlowRow[] = [];
    for (const e of data.edges) {
      const from = nodes.get(e.source_process_id);
      const to = nodes.get(e.target_process_id);
      if (from && to) {
        rows.push({
          id: e.id,
          from: `${from.code} · ${from.title}`,
          fromLink: `/processes/${from.id}`,
          to: `${to.code} · ${to.title}`,
          toLink: `/processes/${to.id}`,
          label: e.label,
        });
      }
    }
    for (const e of data.party_edges ?? []) {
      const process = nodes.get(e.process_id);
      const party = parties.get(e.party_id);
      if (!process || !party) {
        continue;
      }
      const p = { text: `${process.code} · ${process.title}`, link: `/processes/${process.id}` };
      const q = { text: party.name, link: party.url ?? null };
      const [from, to] = e.direction === 'incoming' ? [q, p] : [p, q];
      rows.push({
        id: e.id,
        from: from.text,
        fromLink: from.link,
        to: to.text,
        toLink: to.link,
        label: e.label,
      });
    }
    return rows;
  });

  constructor() {
    providePageContext(() => ({
      module: PROCESS_MODULE,
      view: 'other',
      title: this.language.translate('processes.interactionMap.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const includeRetired = this.includeRetired();
      if (!orgId) {
        return;
      }
      untracked(() => this.load(orgId, includeRetired));
    });
  }

  private load(orgId: string, includeRetired: boolean): void {
    this.error.set(false);
    this.api.interactionMap(orgId, includeRetired).subscribe({
      next: (data) => this.data.set(data),
      error: () => this.error.set(true),
    });
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId, this.includeRetired());
    }
  }

  protected bandLabel(key: BandKey): string {
    return key === 'parties'
      ? 'processes.interactionMap.partiesBand'
      : `processes.category.${key}Plural`;
  }

  protected titleLines(title: string): string[] {
    return wrapLabel(title, 22, 2);
  }

  protected fill(p: PlacedBox): string {
    if (p.kind === 'party') {
      return 'var(--info-soft)';
    }
    return p.status === 'retired' ? 'var(--surface-3)' : 'var(--surface)';
  }

  protected isActive(sourceId: string, targetId: string): boolean {
    const hovered = this.hovered();
    return hovered !== null && (hovered === sourceId || hovered === targetId);
  }

  protected open(p: PlacedBox): void {
    if (p.kind === 'process') {
      void this.router.navigate(['/processes', p.id]);
    } else if (p.url) {
      void this.router.navigateByUrl(p.url);
    }
  }
}
