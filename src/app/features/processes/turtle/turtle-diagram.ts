import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { kpiResultValue, sparkPoints } from '../data/process-display';
import {
  Kpi,
  KpiStatus,
  LinkedRecord,
  PartyInteraction,
  Interaction,
  Turtle,
  TurtleLeg,
} from '../data/process.models';

/** A KPI row with its live result (when linked to a KPI record). */
interface KpiView {
  readonly kpi: Kpi;
  readonly status: KpiStatus | null;
}

/** Create-from-here flows the turtle offers (P4 keys, registered by the backend). */
export type TurtleFlow = 'process.to_risk' | 'process.to_kpi';

/**
 * "Prosessen på én side" (the turtle diagram): the process in the middle with
 * its owner and purpose, inputs left and outputs right, the four legs (with
 * what, with whom, how, how measured), risks and opportunities, and who it
 * receives from and delivers to (processes and interested parties).
 *
 * Every leg shows the real records linked to the process (suppliers, assets,
 * courses, procedures, KPIs, risks …) as entity chips next to the free-text
 * items. KPI rows linked to "Mål og KPI-er" show the latest value against the
 * target and a small trend; linked risks show their level and owner. Editors
 * get "Koble" per leg and create-from-here buttons for a risk and a KPI.
 */
@Component({
  selector: 'app-turtle-diagram',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    EntityChip,
    LocalNumberPipe,
    Icon,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let t = turtle();
    <div
      class="grid grid-cols-1 gap-3 md:grid-cols-3"
      role="group"
      [attr.aria-label]="'processes.turtle.label' | transloco"
      data-testid="turtle"
    >
      <ng-container *ngTemplateOutlet="leg; context: { key: 'resources', items: t.resources }" />
      <ng-container
        *ngTemplateOutlet="
          flows;
          context: { key: 'upstream', processes: t.upstream, parties: t.upstream_parties ?? [] }
        "
      />
      <ng-container *ngTemplateOutlet="leg; context: { key: 'competence', items: t.competence }" />

      <ng-container *ngTemplateOutlet="leg; context: { key: 'inputs', items: t.inputs }" />
      <section
        class="flex flex-col justify-center rounded-card border-2 border-accent bg-accent-soft p-4 text-center"
      >
        <p class="font-mono text-meta text-fg-subtle">{{ t.process.code }}</p>
        <h3 class="font-display text-section font-bold text-fg">{{ t.process.title }}</h3>
        <p class="mt-1 text-meta text-fg-muted">
          @if (t.owner?.name) {
            {{ 'processes.turtle.owner' | transloco: { name: t.owner?.name } }}
          } @else {
            {{ 'processes.list.noOwner' | transloco }}
          }
        </p>
        @if (t.purpose) {
          <p class="mt-2 line-clamp-4 text-ui text-fg">{{ t.purpose }}</p>
        }
      </section>
      <ng-container *ngTemplateOutlet="leg; context: { key: 'outputs', items: t.outputs }" />

      <section class="cf-leg" data-testid="leg-methods">
        <ng-container *ngTemplateOutlet="legHead; context: { key: 'methods' }" />
        <ul class="mt-1.5 flex flex-col gap-1.5 text-ui text-fg">
          @for (doc of t.procedures; track doc.id) {
            <li>
              @if (doc.accessible && doc.url) {
                <a [routerLink]="doc.url" class="text-accent hover:underline">
                  <span class="font-mono text-meta">{{ doc.doc_code }}</span> {{ doc.title }}
                </a>
                @if (doc.status && doc.status !== 'approved') {
                  <app-status-badge
                    class="ml-1"
                    meaning="lifecycle"
                    [value]="doc.status"
                    [labelKey]="'processes.document.status.' + doc.status"
                  />
                }
              } @else {
                <span class="text-fg-subtle">{{
                  'processes.document.restricted' | transloco
                }}</span>
              }
            </li>
          }
          <ng-container *ngTemplateOutlet="linkedList; context: { leg: 'methods' }" />
          @for (item of t.methods; track $index) {
            <li class="cf-text-item">{{ item }}</li>
          }
          @if (t.methods.length === 0 && t.procedures.length === 0 && !linked('methods').length) {
            <li class="text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
      </section>
      <ng-container
        *ngTemplateOutlet="
          flows;
          context: {
            key: 'downstream',
            processes: t.downstream,
            parties: t.downstream_parties ?? [],
          }
        "
      />
      <section class="cf-leg" data-testid="leg-kpis">
        <ng-container *ngTemplateOutlet="legHead; context: { key: 'kpis' }" />
        <ul class="mt-1.5 flex flex-col gap-2 text-ui text-fg">
          @for (row of kpiRows(); track $index) {
            <li data-testid="turtle-kpi">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                @if (row.status?.url) {
                  <a
                    [routerLink]="row.status?.url"
                    class="font-semibold text-accent hover:underline"
                  >
                    {{ row.kpi.name }}
                  </a>
                } @else {
                  <span class="font-semibold">{{ row.kpi.name }}</span>
                }
                @if (row.status?.kpi_id) {
                  <app-status-badge
                    meaning="compliance"
                    [value]="resultValue(row.status?.status)"
                    [labelKey]="'processes.kpi.result.' + (row.status?.status ?? 'none')"
                  />
                }
              </div>
              @if (row.status?.kpi_id && isNum(row.status?.latest_value)) {
                <p class="mt-0.5 flex items-center gap-2 text-meta text-fg-muted">
                  <span>
                    {{
                      'processes.kpi.latestVsTarget'
                        | transloco
                          : {
                              value: (row.status?.latest_value | localNumber),
                              target: isNum(row.status?.target_value)
                                ? (row.status?.target_value | localNumber)
                                : '—',
                              unit: row.status?.unit ?? row.kpi.unit ?? '',
                            }
                    }}
                  </span>
                  @if (spark(row.status); as points) {
                    <svg
                      width="64"
                      height="18"
                      viewBox="0 0 64 18"
                      class="flex-none"
                      role="img"
                      [attr.aria-label]="'processes.kpi.trend' | transloco"
                    >
                      <polyline
                        [attr.points]="points"
                        fill="none"
                        stroke="var(--accent)"
                        stroke-width="1.6"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                </p>
              } @else if (row.status?.kpi_id) {
                <p class="mt-0.5 text-meta text-fg-muted">
                  {{ 'processes.kpi.noValues' | transloco }}
                </p>
              } @else {
                <p class="mt-0.5 text-meta text-fg-muted">
                  @if (row.kpi.target) {
                    {{
                      'processes.kpi.targetShort'
                        | transloco: { target: row.kpi.target, unit: row.kpi.unit ?? '' }
                    }}
                    ·
                  }
                  {{ 'processes.kpi.notLinked' | transloco }}
                </p>
              }
            </li>
          }
          <ng-container *ngTemplateOutlet="linkedList; context: { leg: 'kpis' }" />
          @if (kpiRows().length === 0 && !linked('kpis').length) {
            <li class="text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
        @if (canEdit() && canCreate().includes('process.to_kpi') && hasUnlinkedKpi()) {
          <button
            type="button"
            class="cf-leg-action mt-2"
            (click)="createFlow.emit('process.to_kpi')"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'processes.turtle.createKpi' | transloco }}
          </button>
        }
      </section>

      <section class="cf-leg md:col-span-3" data-testid="leg-risks">
        <ng-container *ngTemplateOutlet="legHead; context: { key: 'risks' }" />
        <ul class="mt-1.5 flex flex-col gap-1.5 text-ui text-fg">
          @for (r of t.linked_risks; track r.entity_type + r.entity_id) {
            <li class="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="turtle-risk">
              <span class="min-w-0"><app-entity-chip [ref]="r" /></span>
              @if (r.level) {
                <app-status-badge
                  meaning="severity"
                  [value]="r.level"
                  [labelKey]="'processes.riskLevel.' + r.level"
                />
              }
              @if (r.owner?.name) {
                <span class="text-meta text-fg-muted">
                  {{ 'processes.turtle.riskOwner' | transloco: { name: r.owner?.name } }}
                </span>
              }
              @if (canEdit() && r.link_id) {
                <ng-container *ngTemplateOutlet="unlinkButton; context: { item: r }" />
              }
            </li>
          }
          @for (item of t.risks; track $index) {
            <li class="cf-text-item">{{ item }}</li>
          }
          @if (t.risks.length === 0 && t.linked_risks.length === 0) {
            <li class="text-fg-subtle">{{ 'processes.turtle.noRisks' | transloco }}</li>
          }
        </ul>
        @if (canEdit()) {
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="cf-leg-action"
              (click)="link.emit('risks')"
              data-testid="link-risk"
            >
              <app-icon name="link" [size]="13" />
              {{ 'processes.turtle.linkRisk' | transloco }}
            </button>
            @if (canCreate().includes('process.to_risk')) {
              <button
                type="button"
                class="cf-leg-action"
                (click)="createFlow.emit('process.to_risk')"
                data-testid="create-risk"
              >
                <app-icon name="plus" [size]="13" />
                {{ 'processes.turtle.createRisk' | transloco }}
              </button>
            }
          </div>
        }
      </section>
    </div>

    <ng-template #legHead let-key="key">
      <div class="flex items-start justify-between gap-2">
        <h3 class="cf-leg-title">{{ 'processes.turtle.' + key | transloco }}</h3>
        @if (canEdit() && key !== 'risks') {
          <button
            type="button"
            class="-mt-1 -mr-1 inline-flex h-7 flex-none items-center gap-1 rounded-lg px-1.5 text-meta font-semibold text-accent hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-label]="
              'processes.turtle.linkTo'
                | transloco: { leg: ('processes.turtle.' + key | transloco) }
            "
            (click)="link.emit(key)"
            [attr.data-testid]="'link-leg-' + key"
          >
            <app-icon name="link" [size]="13" />
            {{ 'processes.turtle.link' | transloco }}
          </button>
        }
      </div>
    </ng-template>

    <ng-template #linkedList let-leg="leg">
      @for (item of linked(leg); track item.entity_type + item.entity_id) {
        <li class="flex items-center gap-1.5">
          <span class="min-w-0 flex-1"><app-entity-chip [ref]="item" [stacked]="true" /></span>
          @if (canEdit() && item.link_id) {
            <ng-container *ngTemplateOutlet="unlinkButton; context: { item }" />
          }
        </li>
      }
    </ng-template>

    <ng-template #unlinkButton let-item="item">
      <button
        type="button"
        class="flex h-6 w-6 flex-none items-center justify-center rounded-md text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        [attr.aria-label]="'processes.turtle.unlink' | transloco: { title: item.title }"
        (click)="unlink.emit(item)"
      >
        <app-icon name="x" [size]="13" />
      </button>
    </ng-template>

    <ng-template #leg let-key="key" let-items="items">
      <section class="cf-leg h-full" [attr.data-testid]="'leg-' + key">
        <ng-container *ngTemplateOutlet="legHead; context: { key }" />
        <ul class="mt-1.5 flex flex-col gap-1.5 text-ui text-fg">
          <ng-container *ngTemplateOutlet="linkedList; context: { leg: key }" />
          @for (item of items; track $index) {
            <li class="cf-text-item">{{ item }}</li>
          }
          @if (items.length === 0 && !linked(key).length) {
            <li class="text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
      </section>
    </ng-template>

    <ng-template #flows let-key="key" let-processes="processes" let-parties="parties">
      <section class="cf-leg" [attr.data-testid]="'leg-' + key">
        <h3 class="cf-leg-title">{{ 'processes.turtle.' + key | transloco }}</h3>
        <ul class="mt-1.5 flex flex-col gap-1.5 text-ui">
          @for (i of asInteractions(processes); track i.id) {
            <li>
              <a [routerLink]="['/processes', i.process.id]" class="text-accent hover:underline">
                <span class="font-mono text-meta">{{ i.process.code }}</span> {{ i.process.title }}
              </a>
              @if (i.label) {
                <span class="block text-meta text-fg-muted">{{ i.label }}</span>
              }
            </li>
          }
          @for (i of asParties(parties); track i.id) {
            <li>
              <span class="mr-1 text-micro font-semibold tracking-wide text-fg-subtle uppercase">{{
                'processes.interactions.partyTag' | transloco
              }}</span>
              @if (i.party.url) {
                <a [routerLink]="i.party.url" class="text-accent hover:underline">{{
                  i.party.name
                }}</a>
              } @else {
                <span class="text-fg">{{ i.party.name }}</span>
              }
              @if (i.label) {
                <span class="block text-meta text-fg-muted">{{ i.label }}</span>
              }
            </li>
          }
          @if (asInteractions(processes).length === 0 && asParties(parties).length === 0) {
            <li class="text-fg-subtle">{{ 'processes.turtle.none' | transloco }}</li>
          }
        </ul>
      </section>
    </ng-template>
  `,
  styles: [
    `
      .cf-leg {
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--surface);
        padding: 12px;
      }
      .cf-leg-title {
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--fg-muted);
      }
      .cf-text-item {
        position: relative;
        padding-left: 14px;
      }
      .cf-text-item::before {
        content: '';
        position: absolute;
        left: 3px;
        top: 0.6em;
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: var(--fg-subtle);
      }
      .cf-leg-action {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 28px;
        border-radius: 8px;
        border: 1px solid var(--border);
        padding: 0 10px;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--fg);
        background: var(--surface);
      }
      .cf-leg-action:hover {
        border-color: var(--accent);
      }
      .cf-leg-action:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }
    `,
  ],
})
export class TurtleDiagram {
  readonly turtle = input.required<Turtle>();
  /** Show "Koble" / create actions. */
  readonly canEdit = input(false);
  /** Create flow keys the user may start (from `GET /create-flows`). */
  readonly canCreate = input<readonly string[]>([]);

  /** "Koble" on a leg: link an existing record to the process. */
  readonly link = output<TurtleLeg>();
  readonly unlink = output<LinkedRecord>();
  readonly createFlow = output<TurtleFlow>();

  protected readonly kpiRows = computed<KpiView[]>(() => {
    const t = this.turtle();
    const status = new Map((t.kpi_status ?? []).map((s) => [s.index, s]));
    return t.kpis.map((kpi, index) => ({ kpi, status: status.get(index) ?? null }));
  });

  protected readonly hasUnlinkedKpi = computed(() =>
    this.kpiRows().some((row) => !row.status?.kpi_id),
  );

  protected linked(leg: TurtleLeg): readonly LinkedRecord[] {
    const items = this.turtle().linked?.[leg] ?? [];
    if (leg !== 'kpis') {
      return items;
    }
    // KPIs already shown through a KPI row are not repeated.
    const shown = new Set(
      this.kpiRows()
        .map((r) => r.status?.kpi_id)
        .filter(Boolean),
    );
    return items.filter((i) => !shown.has(i.entity_id));
  }

  protected isNum(value: number | null | undefined): boolean {
    return typeof value === 'number' && Number.isFinite(value);
  }

  protected resultValue(status: string | null | undefined): string {
    return kpiResultValue(status);
  }

  protected spark(status: KpiStatus | null): string {
    return status?.trend && status.trend.length > 1 ? sparkPoints(status.trend) : '';
  }

  protected asInteractions(value: unknown): readonly Interaction[] {
    return (value as readonly Interaction[]) ?? [];
  }

  protected asParties(value: unknown): readonly PartyInteraction[] {
    return (value as readonly PartyInteraction[]) ?? [];
  }
}
