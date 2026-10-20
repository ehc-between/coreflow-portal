import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  DeviationFilters,
  DeviationStats,
  DeviationStatus,
  Severity,
  Source,
  Standard,
} from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import {
  SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  STANDARD_OPTIONS,
  STATUS_OPTIONS,
  severityLabelKey,
  sourceLabelKey,
  standardLabelKey,
  statusLabelKey,
} from '../deviation-enums';
import { StatBarList } from './stat-bar-list';
import { RawBucket, StatBar, recordToBuckets, toBars } from './stats-bars';
import { TrendChart } from './trend-chart';

/** A breakdown section: a heading, its bars and the list filter key it drills into. */
interface Breakdown {
  readonly titleKey: string;
  readonly bars: readonly StatBar[];
  /** List filter param a bar drills into (e.g. 'status'); null when not drillable. */
  readonly filterKey: string | null;
}

const TOP_CLAUSES = 8;

/**
 * Deviation statistics dashboard, scoped to the current org. A filter bar
 * (mirroring the list filters) drives `getStats`; results render as KPI tiles,
 * dependency-free horizontal CSS bar breakdowns (status / severity / standard /
 * type / department / clause), and a monthly opened-over-time trend. Bars are
 * clickable, drilling into the filtered deviations list. Department and type ids
 * are resolved to names (types come named from the API; departments via
 * `listAccessSubjects`). Gated upstream on `deviations:read`.
 */
@Component({
  selector: 'app-deviation-stats',
  imports: [FormsModule, RouterLink, TranslocoPipe, Card, Icon, KpiTile, StatBarList, TrendChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-8 pt-7 pb-12">
      <a
        routerLink="/deviations"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.backToList' | transloco }}
      </a>

      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'deviations.stats.title' | transloco }}
        </h1>
        <div class="mt-1.5 text-[14px] text-fg-muted">
          {{ 'deviations.stats.subtitle' | transloco }}
        </div>
      </div>

      <div class="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <div class="cf-select">
          <select
            [ngModel]="status()"
            (ngModelChange)="setFilter('status', $event)"
            [attr.aria-label]="'deviations.filters.status' | transloco"
          >
            <option value="">{{ 'deviations.filters.allStatuses' | transloco }}</option>
            @for (option of statusOptions; track option) {
              <option [value]="option">{{ statusLabelKey(option) | transloco }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="typeId()"
            (ngModelChange)="setFilter('typeId', $event)"
            [attr.aria-label]="'deviations.filters.type' | transloco"
          >
            <option value="">{{ 'deviations.filters.allTypes' | transloco }}</option>
            @for (type of types(); track type.id) {
              <option [value]="type.id">{{ type.name }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="standard()"
            (ngModelChange)="setFilter('standard', $event)"
            [attr.aria-label]="'deviations.filters.standard' | transloco"
          >
            <option value="">{{ 'deviations.filters.allStandards' | transloco }}</option>
            @for (option of standardOptions; track option) {
              <option [value]="option">{{ standardLabelKey(option) | transloco }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="severity()"
            (ngModelChange)="setFilter('severity', $event)"
            [attr.aria-label]="'deviations.filters.severity' | transloco"
          >
            <option value="">{{ 'deviations.filters.allSeverities' | transloco }}</option>
            @for (option of severityOptions; track option) {
              <option [value]="option">{{ severityLabelKey(option) | transloco }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="source()"
            (ngModelChange)="setFilter('source', $event)"
            [attr.aria-label]="'deviations.filters.source' | transloco"
          >
            <option value="">{{ 'deviations.filters.allSources' | transloco }}</option>
            @for (option of sourceOptions; track option) {
              <option [value]="option">{{ sourceLabelKey(option) | transloco }}</option>
            }
          </select>
        </div>
        <div class="cf-select">
          <select
            [ngModel]="departmentId()"
            (ngModelChange)="setFilter('department', $event)"
            [attr.aria-label]="'deviations.filters.department' | transloco"
          >
            <option value="">{{ 'deviations.filters.allDepartments' | transloco }}</option>
            @for (dept of departments(); track dept.id) {
              <option [value]="dept.id">{{ dept.name }}</option>
            }
          </select>
        </div>
        <input
          type="text"
          [ngModel]="tag()"
          (ngModelChange)="setFilter('tag', $event)"
          [placeholder]="'deviations.filters.tag' | transloco"
          [attr.aria-label]="'deviations.filters.tag' | transloco"
          autocomplete="off"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        <input
          type="date"
          [ngModel]="dueAfter()"
          (ngModelChange)="setFilter('dueAfter', $event)"
          [attr.aria-label]="'deviations.filters.dueAfter' | transloco"
          [title]="'deviations.filters.dueAfter' | transloco"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        <input
          type="date"
          [ngModel]="dueBefore()"
          (ngModelChange)="setFilter('dueBefore', $event)"
          [attr.aria-label]="'deviations.filters.dueBefore' | transloco"
          [title]="'deviations.filters.dueBefore' | transloco"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        @if (hasActiveFilters()) {
          <button
            type="button"
            (click)="clearFilters()"
            class="flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <app-icon name="x" [size]="15" />
            {{ 'deviations.filters.clear' | transloco }}
          </button>
        }
      </div>

      @if (loading()) {
        <app-card>
          <p class="py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else if (stats(); as s) {
        <div class="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <app-kpi-tile
            [label]="'deviations.stats.cards.total' | transloco"
            [value]="s.total"
            tone="info"
          />
          <app-kpi-tile
            [label]="'deviations.stats.cards.open' | transloco"
            [value]="s.open"
            tone="accent"
          />
          <app-kpi-tile
            [label]="'deviations.stats.cards.overdue' | transloco"
            [value]="s.overdue"
            [tone]="s.overdue > 0 ? 'fail' : 'neutral'"
          />
          <app-kpi-tile
            [label]="'deviations.stats.cards.closed' | transloco"
            [value]="s.closed"
            tone="pass"
          />
          <app-kpi-tile
            [label]="'deviations.stats.cards.openActions' | transloco"
            [value]="s.open_actions"
            tone="info"
          />
          <app-kpi-tile
            [label]="'deviations.stats.cards.overdueActions' | transloco"
            [value]="s.overdue_actions"
            [tone]="s.overdue_actions > 0 ? 'fail' : 'neutral'"
          />
        </div>

        @if (s.total === 0) {
          <app-card>
            <p class="py-12 text-center text-[14px] text-fg-muted">
              {{ 'deviations.stats.empty' | transloco }}
            </p>
          </app-card>
        } @else {
          <div class="grid gap-4 lg:grid-cols-2">
            @for (breakdown of breakdowns(); track breakdown.titleKey) {
              <app-card>
                <p class="mb-3 text-[13px] font-semibold text-fg-muted">
                  {{ breakdown.titleKey | transloco }}
                </p>
                <app-stat-bar-list
                  [bars]="breakdown.bars"
                  [drillable]="breakdown.filterKey !== null"
                  (selectBar)="drillDown(breakdown.filterKey, $event)"
                />
              </app-card>
            }
          </div>

          <app-card class="mt-4 block">
            <p class="mb-4 text-[13px] font-semibold text-fg-muted">
              {{ 'deviations.stats.trend.title' | transloco }}
            </p>
            <app-trend-chart [points]="trend()" />
          </app-card>
        }
      }
    </div>
  `,
  styles: [
    `
      .cf-select select {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-select select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class DeviationStatsPage {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly severityOptions = SEVERITY_OPTIONS;
  protected readonly sourceOptions = SOURCE_OPTIONS;
  protected readonly standardOptions = STANDARD_OPTIONS;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly standardLabelKey = standardLabelKey;

  protected readonly status = signal<DeviationStatus | ''>('');
  protected readonly typeId = signal('');
  protected readonly standard = signal<Standard | ''>('');
  protected readonly severity = signal<Severity | ''>('');
  protected readonly source = signal<Source | ''>('');
  protected readonly departmentId = signal('');
  protected readonly tag = signal('');
  protected readonly dueBefore = signal('');
  protected readonly dueAfter = signal('');

  protected readonly stats = signal<DeviationStats | null>(null);
  protected readonly loading = signal(false);

  protected readonly types = signal<readonly { id: string; name: string }[]>([]);
  protected readonly departments = signal<readonly { id: string; name: string }[]>([]);

  private readonly departmentNames = computed(() => {
    const map: Record<string, string> = {};
    for (const dept of this.departments()) {
      map[dept.id] = dept.name;
    }
    return map;
  });

  protected readonly hasActiveFilters = computed(
    () =>
      this.status() !== '' ||
      this.typeId() !== '' ||
      this.standard() !== '' ||
      this.severity() !== '' ||
      this.source() !== '' ||
      this.departmentId() !== '' ||
      this.tag() !== '' ||
      this.dueBefore() !== '' ||
      this.dueAfter() !== '',
  );

  protected readonly breakdowns = computed<readonly Breakdown[]>(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    const t = (key: string) => this.transloco.translate(key);
    const deptNames = this.departmentNames();

    const statusBuckets = recordToBuckets(s.by_status, (k) => t(statusLabelKey(k)));
    const severityBuckets = recordToBuckets(s.by_severity, (k) => t(severityLabelKey(k)));
    const standardBuckets = recordToBuckets(s.by_standard, (k) => t(standardLabelKey(k)));
    const typeBuckets: RawBucket[] = s.by_type.map((row) => ({
      id: row.type_id,
      label: row.name,
      count: row.count,
    }));
    const deptBuckets = recordToBuckets(
      s.by_department,
      (id) => deptNames[id] ?? t('deviations.stats.unknownDepartment'),
    );
    const clauseBuckets: RawBucket[] = s.by_clause.map((row) => ({
      id: `${row.standard}|${row.clause}`,
      label: `${t(standardLabelKey(row.standard))} · ${row.clause}`,
      count: row.count,
    }));

    return [
      {
        titleKey: 'deviations.stats.breakdowns.byStatus',
        bars: toBars(statusBuckets),
        filterKey: 'status',
      },
      {
        titleKey: 'deviations.stats.breakdowns.bySeverity',
        bars: toBars(severityBuckets),
        filterKey: 'severity',
      },
      {
        titleKey: 'deviations.stats.breakdowns.byStandard',
        bars: toBars(standardBuckets),
        filterKey: 'standard',
      },
      {
        titleKey: 'deviations.stats.breakdowns.byType',
        bars: toBars(typeBuckets),
        filterKey: 'type_id',
      },
      {
        titleKey: 'deviations.stats.breakdowns.byDepartment',
        bars: toBars(deptBuckets),
        filterKey: 'department_id',
      },
      {
        titleKey: 'deviations.stats.breakdowns.byClause',
        bars: toBars(clauseBuckets, TOP_CLAUSES),
        filterKey: 'clause',
      },
    ];
  });

  protected readonly trend = computed(() => this.stats()?.opened_over_time ?? []);

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      this.resetFilters();
      this.stats.set(null);
      this.types.set([]);
      this.departments.set([]);
      if (orgId) {
        this.loadReferences(orgId);
        this.load();
      }
    });
  }

  protected setFilter(
    key:
      | 'status'
      | 'typeId'
      | 'standard'
      | 'severity'
      | 'source'
      | 'department'
      | 'tag'
      | 'dueBefore'
      | 'dueAfter',
    value: string,
  ): void {
    switch (key) {
      case 'status':
        this.status.set(value as DeviationStatus | '');
        break;
      case 'typeId':
        this.typeId.set(value);
        break;
      case 'standard':
        this.standard.set(value as Standard | '');
        break;
      case 'severity':
        this.severity.set(value as Severity | '');
        break;
      case 'source':
        this.source.set(value as Source | '');
        break;
      case 'department':
        this.departmentId.set(value);
        break;
      case 'tag':
        this.tag.set(value);
        break;
      case 'dueBefore':
        this.dueBefore.set(value);
        break;
      case 'dueAfter':
        this.dueAfter.set(value);
        break;
    }
    this.load();
  }

  protected clearFilters(): void {
    this.resetFilters();
    this.load();
  }

  protected drillDown(filterKey: string | null, value: string): void {
    if (!filterKey) {
      return;
    }
    const queryParams: Record<string, string> = {};
    if (filterKey === 'clause') {
      // Clause bucket ids are `standard|clause`; the list filters on the clause.
      queryParams['clause'] = value.split('|')[1] ?? value;
    } else {
      queryParams[filterKey] = value;
    }
    void this.router.navigate(['/deviations'], { queryParams });
  }

  private resetFilters(): void {
    this.status.set('');
    this.typeId.set('');
    this.standard.set('');
    this.severity.set('');
    this.source.set('');
    this.departmentId.set('');
    this.tag.set('');
    this.dueBefore.set('');
    this.dueAfter.set('');
  }

  private buildFilters(): DeviationFilters {
    return {
      status: this.status() || undefined,
      type_id: this.typeId() || undefined,
      standard: this.standard() || undefined,
      severity: this.severity() || undefined,
      source: this.source() || undefined,
      department_id: this.departmentId() || undefined,
      tag: this.tag().trim() || undefined,
      due_before: this.dueBefore() || undefined,
      due_after: this.dueAfter() || undefined,
    };
  }

  private load(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.api.getStats(orgId, this.buildFilters()).subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadReferences(orgId: string): void {
    this.api.listTypes(orgId).subscribe({
      next: (types) => this.types.set(types.map((t) => ({ id: t.id, name: t.name }))),
    });
    this.api.listAccessSubjects(orgId).subscribe({
      next: (subjects) =>
        this.departments.set(subjects.departments.map((d) => ({ id: d.id, name: d.name }))),
    });
  }
}
