import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { teachingClause } from '../../../shared/guidance/clause-chips';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import { findingStatusBadge, planPrefillParams, planStatusBadge } from '../data/audit-display';
import { AuditFrameworks } from '../data/audit-frameworks';
import {
  ClauseHistory,
  Coverage,
  CoverageCell,
  CoverageClauseRow,
  CoverageRowBase,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

export type CoverageView = 'clauses' | 'processes' | 'departments';
export const COVERAGE_VIEWS: readonly CoverageView[] = ['clauses', 'processes', 'departments'];

/** One row of the matrix, whatever the dimension. */
export interface MatrixRow {
  readonly key: string;
  readonly label: string;
  readonly sub: string | null;
  readonly link: readonly string[] | string | null;
  readonly clauseRef: string | null;
  readonly row: CoverageRowBase;
}

/** What a cell says: done / planned counts and findings, or nothing. */
export function cellState(cell: CoverageCell | undefined): 'done' | 'planned' | 'none' {
  if (!cell) {
    return 'none';
  }
  if (cell.done > 0) {
    return 'done';
  }
  return cell.planned > 0 ? 'planned' : 'none';
}

/**
 * Audit programme coverage (ISO 19011 5.4, ISO HS 9.2.2): which clauses, processes
 * and departments were audited in each year of the cycle, with findings, and the
 * gaps nobody has looked at yet. Every gap offers "Planlegg revisjon" with the
 * programme, clause, process or department filled in. A clause opens its history:
 * when it was last audited, with what result, and its open findings.
 */
@Component({
  selector: 'app-audit-programme-coverage',
  imports: [RouterLink, TranslocoPipe, LocalDayPipe, Icon, SlideOver, StatusBadge, AuditLoadState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-audit-load-state [state]="data.state()" [rows]="4" (retry)="load()" />
    @if (data.value(); as c) {
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          class="flex gap-1 rounded-tile bg-surface-2 p-1"
          [attr.aria-label]="'audits.coverage.views' | transloco"
        >
          @for (v of views; track v) {
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="view() === v"
              class="rounded-lg px-3 py-1.5 text-ui font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class]="
                view() === v ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
              "
              (click)="view.set(v)"
              [attr.data-testid]="'coverage-view-' + v"
            >
              {{ 'audits.coverage.view.' + v | transloco }}
              <span class="ml-1 text-micro text-fg-subtle">
                {{ c.summary[v].covered }}/{{ c.summary[v].total }}
              </span>
            </button>
          }
        </div>
        <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="gapsOnly()"
            (change)="gapsOnly.set($any($event.target).checked)"
          />
          {{ 'audits.coverage.gapsOnly' | transloco }}
        </label>
      </div>
      <p class="mb-3 text-meta text-fg-muted" data-testid="coverage-summary">
        {{
          'audits.coverage.summary.' + view()
            | transloco
              : {
                  covered: c.summary[view()].covered,
                  total: c.summary[view()].total,
                  years: c.years.length,
                  gaps: c.summary[view()].total - c.summary[view()].covered,
                }
        }}
      </p>

      @if (rows().length) {
        <div class="overflow-x-auto rounded-tile border border-border">
          <table class="w-full min-w-[560px] text-left text-ui">
            <caption class="sr-only">
              {{
                'audits.coverage.caption.' + view() | transloco
              }}
            </caption>
            <thead class="border-b border-border bg-surface-2 text-meta text-fg-muted">
              <tr>
                <th scope="col" class="px-3 py-2 font-semibold">
                  {{ 'audits.coverage.view.' + view() | transloco }}
                </th>
                @for (y of c.years; track y) {
                  <th scope="col" class="w-[92px] px-2 py-2 text-center font-semibold">{{ y }}</th>
                }
                <th scope="col" class="w-[150px] px-3 py-2 font-semibold">
                  <span class="sr-only">{{ 'audits.coverage.action' | transloco }}</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              @for (r of rows(); track r.key) {
                <tr
                  [class]="r.row.gap ? 'bg-warn-soft/40' : ''"
                  [attr.data-gap]="r.row.gap || null"
                >
                  <th scope="row" class="px-3 py-2 align-top font-normal">
                    @if (r.clauseRef) {
                      <button
                        type="button"
                        class="text-left font-semibold text-fg hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        [attr.aria-label]="
                          'audits.coverage.historyOf' | transloco: { clause: r.label }
                        "
                        (click)="openHistory(r)"
                      >
                        {{ r.label }}
                      </button>
                    } @else if (r.link) {
                      <a
                        [routerLink]="r.link"
                        class="font-semibold text-fg hover:text-accent hover:underline"
                      >
                        {{ r.label }}
                      </a>
                    } @else {
                      <span class="font-semibold text-fg">{{ r.label }}</span>
                    }
                    @if (r.sub) {
                      <span class="block text-meta text-fg-muted">{{ r.sub }}</span>
                    }
                    @if (r.row.open_findings) {
                      <span class="mt-0.5 block text-meta font-semibold text-warn-ink">
                        {{
                          'audits.coverage.openFindings' | transloco: { count: r.row.open_findings }
                        }}
                      </span>
                    }
                  </th>
                  @for (y of c.years; track y) {
                    @let cell = r.row.cells[y + ''];
                    @let state = stateOf(cell);
                    <td class="px-2 py-2 text-center align-top">
                      @switch (state) {
                        @case ('done') {
                          <span
                            class="inline-flex items-center gap-1 rounded-full bg-pass-soft px-2 py-0.5 text-meta font-semibold text-pass-ink"
                            [title]="cellTitle(cell)"
                          >
                            <app-icon name="check" [size]="11" />
                            {{ cell!.done }}
                          </span>
                        }
                        @case ('planned') {
                          <span
                            class="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-meta font-semibold text-info-ink"
                            [title]="cellTitle(cell)"
                          >
                            <app-icon name="clock" [size]="11" />
                            {{ cell!.planned }}
                          </span>
                        }
                        @default {
                          <span class="text-fg-subtle" aria-hidden="true">·</span>
                          <span class="sr-only">{{ 'audits.coverage.cell.none' | transloco }}</span>
                        }
                      }
                      @if (cell && cell.findings) {
                        <span class="mt-0.5 block text-micro text-fg-muted">
                          {{
                            'audits.coverage.cell.findings' | transloco: { count: cell.findings }
                          }}
                        </span>
                      }
                    </td>
                  }
                  <td class="px-3 py-2 align-top">
                    @if (r.row.gap) {
                      <span class="block text-meta font-semibold text-warn-ink">
                        {{ 'audits.coverage.gap' | transloco }}
                      </span>
                      @if (access.canWrite()) {
                        <a
                          routerLink="/audits/plans/new"
                          [queryParams]="prefill(r)"
                          class="mt-0.5 inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
                          data-testid="coverage-plan-gap"
                        >
                          <app-icon name="plus" [size]="11" />
                          {{ 'audits.coverage.planThis' | transloco }}
                        </a>
                      }
                    } @else if (r.row.last_audited_at) {
                      <span class="text-meta text-fg-muted">
                        {{
                          'audits.coverage.lastAudited'
                            | transloco: { date: (r.row.last_audited_at | localDay) }
                        }}
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-fg-muted">
          <span class="inline-flex items-center gap-1"
            ><app-icon name="check" [size]="11" class="text-pass-ink" />
            {{ 'audits.coverage.legend.done' | transloco }}</span
          >
          <span class="inline-flex items-center gap-1"
            ><app-icon name="clock" [size]="11" class="text-info-ink" />
            {{ 'audits.coverage.legend.planned' | transloco }}</span
          >
          <span>{{ 'audits.coverage.legend.gap' | transloco }}</span>
        </p>
      } @else {
        <p
          class="rounded-tile border border-dashed border-border px-4 py-6 text-center text-body text-fg-muted"
        >
          {{
            (gapsOnly() ? 'audits.coverage.noGaps' : 'audits.coverage.empty.' + view()) | transloco
          }}
        </p>
      }
    }

    <app-slide-over
      [open]="!!historyFor()"
      [title]="historyFor()?.label ?? ''"
      [subtitle]="historyFor()?.sub ?? ''"
      [closeLabel]="'audits.common.close' | transloco"
      (closed)="historyFor.set(null)"
    >
      <app-audit-load-state [state]="history.state()" (retry)="loadHistory()" />
      @if (history.value(); as h) {
        <div class="flex flex-col gap-5" data-testid="clause-history">
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-tile border border-border p-3">
              <p class="text-meta text-fg-muted">
                {{ 'audits.coverage.history.last' | transloco }}
              </p>
              <p class="mt-0.5 text-body font-semibold text-fg">
                {{
                  (h.last_audited_at | localDay) || ('audits.coverage.history.never' | transloco)
                }}
              </p>
            </div>
            <div class="rounded-tile border border-border p-3">
              <p class="text-meta text-fg-muted">
                {{ 'audits.coverage.history.result' | transloco }}
              </p>
              <p class="mt-0.5 text-body font-semibold text-fg">
                {{
                  h.last_result
                    ? ('audits.checklistResult.' + h.last_result | transloco)
                    : ('common.empty.notSet' | transloco)
                }}
              </p>
            </div>
          </div>
          <section>
            <h3 class="mb-2 text-ui font-semibold text-fg">
              {{ 'audits.coverage.history.audits' | transloco: { count: h.audits_total } }}
            </h3>
            <ul class="divide-y divide-border">
              @for (a of h.audits; track a.id) {
                @let ab = planBadge(a.status);
                <li class="flex flex-wrap items-center gap-2 py-2">
                  <a
                    [routerLink]="['/audits/plans', a.id]"
                    class="min-w-0 flex-1 text-ui font-semibold text-fg hover:text-accent"
                  >
                    <span class="font-mono text-meta font-normal text-fg-subtle">{{ a.code }}</span>
                    {{ a.title }}
                  </a>
                  <span class="text-meta text-fg-muted">{{
                    a.actual_end ?? a.planned_start | localDay
                  }}</span>
                  <app-status-badge
                    [meaning]="ab.meaning"
                    [value]="ab.value"
                    [labelKey]="ab.labelKey"
                  />
                </li>
              } @empty {
                <li class="py-2 text-meta text-fg-muted">
                  {{ 'audits.coverage.history.noAudits' | transloco }}
                </li>
              }
            </ul>
          </section>
          <section>
            <h3 class="mb-2 text-ui font-semibold text-fg">
              {{ 'audits.coverage.history.findings' | transloco }}
            </h3>
            <ul class="divide-y divide-border">
              @for (f of h.open_findings; track f.id) {
                @let fb = findingBadge(f.status);
                <li class="flex flex-wrap items-center gap-2 py-2">
                  <a
                    [routerLink]="['/audits/findings', f.id]"
                    class="min-w-0 flex-1 text-ui font-semibold text-fg hover:text-accent"
                  >
                    <span class="font-mono text-meta font-normal text-fg-subtle">{{ f.code }}</span>
                    {{ f.title }}
                  </a>
                  <app-status-badge
                    [meaning]="fb.meaning"
                    [value]="fb.value"
                    [labelKey]="fb.labelKey"
                  />
                </li>
              } @empty {
                <li class="py-2 text-meta text-fg-muted">
                  {{ 'audits.coverage.history.noFindings' | transloco }}
                </li>
              }
            </ul>
          </section>
          @if (historyLink(); as link) {
            <a
              [routerLink]="link"
              class="inline-flex items-center gap-1 text-ui font-semibold text-accent hover:underline"
            >
              <app-icon name="book" [size]="14" />
              {{ 'audits.coverage.history.openRequirement' | transloco }}
            </a>
          }
        </div>
      }
    </app-slide-over>
  `,
})
export class ProgrammeCoverage {
  private readonly api = inject(AuditsApi);
  private readonly language = inject(LanguageService);
  private readonly frameworks = inject(AuditFrameworks);
  protected readonly access = inject(AuditAccess);

  readonly programmeId = input.required<string>();

  protected readonly views = COVERAGE_VIEWS;
  protected readonly planBadge = planStatusBadge;
  protected readonly findingBadge = findingStatusBadge;
  protected readonly stateOf = cellState;
  protected readonly data = loadable<Coverage>();
  protected readonly history = loadable<ClauseHistory>();
  protected readonly view = signal<CoverageView>('clauses');
  protected readonly gapsOnly = signal(false);
  protected readonly historyFor = signal<MatrixRow | null>(null);
  protected readonly historyLink = computed(() => {
    const ref = this.historyFor()?.clauseRef;
    return ref ? this.frameworks.clauseLink(ref) : null;
  });

  protected readonly rows = computed<readonly MatrixRow[]>(() => {
    const c = this.data.value();
    if (!c) {
      return [];
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    let rows: MatrixRow[];
    switch (this.view()) {
      case 'clauses':
        rows = c.clauses.map((r: CoverageClauseRow) => ({
          key: r.ref,
          label: teachingClause(r.ref, t).label,
          sub: r.title || null,
          link: null,
          clauseRef: r.ref,
          row: r,
        }));
        break;
      case 'processes':
        rows = c.processes.map((r) => ({
          key: r.id,
          label: r.code ? `${r.code} · ${r.title}` : r.title,
          sub: null,
          link: r.url,
          clauseRef: null,
          row: r,
        }));
        break;
      default:
        rows = c.departments.map((r) => ({
          key: r.id,
          label: r.name,
          sub: null,
          link: null,
          clauseRef: null,
          row: r,
        }));
    }
    return this.gapsOnly() ? rows.filter((r) => r.row.gap) : rows;
  });

  constructor() {
    effect(() => {
      this.access.orgId();
      this.programmeId();
      this.language.active();
      untracked(() => this.load());
    });
  }

  load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      const lang = this.language.active() === 'nb' ? 'nb' : 'en';
      this.data.load(this.api.coverage(orgId, this.programmeId(), lang), true);
    }
  }

  protected prefill(r: MatrixRow): Record<string, string> {
    const params = planPrefillParams(r.row.suggest, this.programmeId());
    if (this.view() === 'processes' && params['processes']) {
      params['processTitle'] = r.label;
    }
    return params;
  }

  protected cellTitle(cell: CoverageCell | undefined): string {
    if (!cell) {
      return '';
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const audits = cell.plans.map((p) => [p.code, p.title].filter(Boolean).join(' ')).join(', ');
    return t('audits.coverage.cell.title', {
      done: cell.done,
      planned: cell.planned,
      findings: cell.findings,
      audits,
    });
  }

  protected openHistory(r: MatrixRow): void {
    this.historyFor.set(r);
    this.loadHistory();
  }

  protected loadHistory(): void {
    const orgId = this.access.orgId();
    const ref = this.historyFor()?.clauseRef;
    if (orgId && ref) {
      this.history.load(this.api.clauseHistory(orgId, ref));
    }
  }
}
