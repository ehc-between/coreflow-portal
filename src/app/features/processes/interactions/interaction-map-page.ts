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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Switch } from '../../../shared/ui/switch/switch';
import { categoryKey } from '../data/process-display';
import { processErrorKey } from '../data/process-errors';
import { InteractionMap, PROCESS_MODULE } from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';
import { BAND_HEIGHT, BOX_HEIGHT, BOX_WIDTH, layoutInteractions } from './interaction-layout';

/**
 * The process interaction map (`/processes/interaction-map`): every process of the
 * org in management / core / support bands with arrows for what flows between
 * them (ISO 9001 4.4.1 b, "the sequence and interaction of these processes").
 * Clicking a process opens it; a table lists the same interactions for screen
 * readers and small screens.
 */
@Component({
  selector: 'app-interaction-map-page',
  imports: [RouterLink, TranslocoPipe, GuideIntro, WhyItMatters, Alert, Card, Icon, Switch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/processes"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'processes.interactionMap.back' | transloco }}
      </a>
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
          {{ 'processes.interactionMap.title' | transloco }}
        </h1>
        <div class="w-auto">
          <app-switch [checked]="includeRetired()" (checkedChange)="includeRetired.set($event)">
            {{ 'processes.interactionMap.includeRetired' | transloco }}
          </app-switch>
        </div>
      </div>
      <app-guide-intro class="mb-3" scope="processes" page="interactionMap" />

      @if (error(); as err) {
        <app-alert tone="error">{{ err | transloco }}</app-alert>
      } @else if (!data()) {
        <p class="text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (layout().nodes.length === 0) {
        <app-card>
          <p class="py-6 text-center text-[13.5px] text-fg-muted">
            {{ 'processes.interactionMap.empty' | transloco }}
          </p>
        </app-card>
      } @else {
        <div class="overflow-auto rounded-[12px] border border-border bg-surface">
          <svg
            [attr.width]="layout().width"
            [attr.height]="layout().height"
            [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height"
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
            @for (band of layout().bands; track band.category; let i = $index) {
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
                {{ categoryKey(band.category) + 'Plural' | transloco }}
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
                marker-end="url(#cf-im-arrow)"
              />
              @if (edge.label) {
                <text
                  [attr.x]="edge.labelX"
                  [attr.y]="edge.labelY"
                  text-anchor="middle"
                  font-size="11"
                  fill="var(--fg-muted)"
                  paint-order="stroke"
                  stroke="var(--surface)"
                  stroke-width="4"
                >
                  {{ edge.label }}
                </text>
              }
            }
            @for (p of layout().nodes; track p.node.id) {
              <g
                role="link"
                tabindex="0"
                class="cursor-pointer outline-none"
                [attr.aria-label]="p.node.code + ' ' + p.node.title"
                [attr.transform]="'translate(' + p.x + ' ' + p.y + ')'"
                (click)="open(p.node.id)"
                (keydown.enter)="open(p.node.id)"
                (mouseenter)="hovered.set(p.node.id)"
                (mouseleave)="hovered.set(null)"
                (focus)="hovered.set(p.node.id)"
                (blur)="hovered.set(null)"
                [attr.data-testid]="'im-node-' + p.node.id"
              >
                <rect
                  [attr.width]="boxWidth"
                  [attr.height]="boxHeight"
                  rx="10"
                  [attr.fill]="p.node.status === 'retired' ? 'var(--surface-3)' : 'var(--surface)'"
                  [attr.stroke]="hovered() === p.node.id ? 'var(--accent)' : 'var(--border-strong)'"
                  [attr.stroke-width]="hovered() === p.node.id ? 2.2 : 1.2"
                  [attr.stroke-dasharray]="p.node.status === 'draft' ? '5 3' : null"
                />
                <text x="12" y="22" font-size="11" font-family="monospace" fill="var(--fg-subtle)">
                  {{ p.node.code }}
                </text>
                <text x="12" y="42" font-size="12.5" font-weight="600" fill="var(--fg)">
                  {{ short(p.node.title) }}
                </text>
              </g>
            }
          </svg>
        </div>
        <p class="mt-2 text-[12px] text-fg-subtle">
          {{ 'processes.interactionMap.legend' | transloco }}
        </p>

        <details class="mt-4 rounded-[12px] border border-border bg-surface px-4 py-3" open>
          <summary class="cursor-pointer text-[13px] font-semibold text-fg">
            {{ 'processes.interactionMap.table' | transloco }}
          </summary>
          @if (rows().length === 0) {
            <p class="mt-2 text-[13px] text-fg-muted">
              {{ 'processes.interactionMap.noEdges' | transloco }}
            </p>
          } @else {
            <div class="mt-2 overflow-x-auto">
              <table class="w-full text-left text-[13px]">
                <thead>
                  <tr class="text-[12px] text-fg-muted">
                    <th class="py-1.5 pr-3 font-semibold">
                      {{ 'processes.interactionMap.from' | transloco }}
                    </th>
                    <th class="py-1.5 pr-3 font-semibold">
                      {{ 'processes.interactionMap.flow' | transloco }}
                    </th>
                    <th class="py-1.5 font-semibold">
                      {{ 'processes.interactionMap.to' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.id) {
                    <tr class="border-t border-border">
                      <td class="py-1.5 pr-3">
                        <a
                          [routerLink]="['/processes', row.fromId]"
                          class="text-accent hover:underline"
                          >{{ row.from }}</a
                        >
                      </td>
                      <td class="py-1.5 pr-3 text-fg-muted">{{ row.label || '—' }}</td>
                      <td class="py-1.5">
                        <a
                          [routerLink]="['/processes', row.toId]"
                          class="text-accent hover:underline"
                          >{{ row.to }}</a
                        >
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </details>
      }
      <app-why-it-matters class="mt-4" scope="processes" page="interactionMap" />
    </div>
  `,
})
export class InteractionMapPage {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);

  protected readonly categoryKey = categoryKey;
  protected readonly bandHeight = BAND_HEIGHT;
  protected readonly boxWidth = BOX_WIDTH;
  protected readonly boxHeight = BOX_HEIGHT;

  protected readonly includeRetired = signal(false);
  protected readonly data = signal<InteractionMap | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly hovered = signal<string | null>(null);

  protected readonly layout = computed(() =>
    layoutInteractions(this.data() ?? { nodes: [], edges: [] }),
  );

  protected readonly rows = computed(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const nodes = new Map(data.nodes.map((n) => [n.id, n]));
    return data.edges
      .filter((e) => nodes.has(e.source_process_id) && nodes.has(e.target_process_id))
      .map((e) => {
        const from = nodes.get(e.source_process_id)!;
        const to = nodes.get(e.target_process_id)!;
        return {
          id: e.id,
          fromId: from.id,
          toId: to.id,
          from: `${from.code} · ${from.title}`,
          to: `${to.code} · ${to.title}`,
          label: e.label,
        };
      });
  });

  constructor() {
    providePageContext(() => ({ module: PROCESS_MODULE, view: 'other' }));
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
    this.error.set(null);
    this.api.interactionMap(orgId, includeRetired).subscribe({
      next: (data) => this.data.set(data),
      error: (error) => this.error.set(processErrorKey(error)),
    });
  }

  protected isActive(sourceId: string, targetId: string): boolean {
    const hovered = this.hovered();
    return hovered !== null && (hovered === sourceId || hovered === targetId);
  }

  protected short(title: string): string {
    return title.length > 24 ? `${title.slice(0, 23)}…` : title;
  }

  protected open(id: string): void {
    void this.router.navigate(['/processes', id]);
  }
}
