import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { internalLink } from '../../../core/search/internal-link';
import { LocalDatePipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { ProgressRing } from '../../../shared/ui/progress-ring/progress-ring';
import {
  frameworkLabelKey,
  labelOr,
  metricBreakdowns,
  metricNumbers,
  moduleLabelKey,
  readHeatMap,
  readPercent,
  scoreColor,
} from '../data/report-display';
import { ModuleCount, ReadinessItem } from '../data/reports.models';

interface ListRow {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly date: string | null;
  readonly overdue: boolean;
  readonly link: ReturnType<typeof internalLink>;
}

/** Severity order for breakdowns (unknown keys keep their order after these). */
const SEVERITY_ORDER = ['critical', 'high', 'major', 'medium', 'minor', 'low'];

/**
 * Renders the data of a report metric (a dashboard widget, or a module metric
 * on the compliance overview) by its `kind`: readiness rings, a headline number,
 * breakdown bars, a short list, a risk heat map or a training percentage. Data
 * in an unexpected shape falls back to its numeric fields, so a metric another
 * module registers still shows something meaningful.
 */
@Component({
  selector: 'app-metric-view',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    LocalNumberPipe,
    LocalDatePipe,
    ProgressRing,
    ProgressBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @switch (view()) {
      @case ('readiness') {
        <div class="flex items-center gap-4">
          <app-progress-ring
            [value]="average() ?? 0"
            [size]="72"
            [color]="color(average())"
            [label]="'reports.metric.readinessLabel' | transloco: { score: average() ?? 0 }"
          />
          <ul class="flex min-w-0 flex-1 flex-col gap-2">
            @for (item of readinessItems(); track item.standard_key) {
              <li class="min-w-0">
                <div class="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span class="truncate font-semibold text-fg">{{ standardLabel(item) }}</span>
                  <span class="font-mono text-fg-muted">{{ item.score }}%</span>
                </div>
                <app-progress-bar
                  [value]="item.score"
                  [color]="color(item.score)"
                  [label]="standardLabel(item)"
                />
              </li>
            } @empty {
              <li class="text-[13px] text-fg-muted">
                {{ 'reports.metric.noStandards' | transloco }}
              </li>
            }
          </ul>
        </div>
      }
      @case ('list') {
        <p class="mb-2 text-[12.5px] text-fg-muted">
          {{ 'reports.metric.listTotal' | transloco: { count: total() } }}
        </p>
        <ul class="flex flex-col divide-y divide-border">
          @for (row of listRows(); track row.id) {
            <li class="flex items-center justify-between gap-3 py-1.5 text-[13px]">
              @if (row.link; as link) {
                <a
                  [routerLink]="link.path"
                  [queryParams]="link.queryParams"
                  class="min-w-0 truncate text-fg hover:text-accent hover:underline"
                >
                  @if (row.code) {
                    <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                  }
                  {{ row.title }}
                </a>
              } @else {
                <span class="min-w-0 truncate text-fg">{{ row.title }}</span>
              }
              @if (row.date) {
                <span
                  class="flex-none text-[12px]"
                  [class.text-fail]="row.overdue"
                  [class.font-semibold]="row.overdue"
                  [class.text-fg-muted]="!row.overdue"
                >
                  {{ row.date | localDate }}
                </span>
              }
            </li>
          } @empty {
            <li class="py-2 text-[13px] text-fg-muted">
              {{ 'reports.metric.nothing' | transloco }}
            </li>
          }
        </ul>
      }
      @case ('heatmap') {
        @if (heat(); as map) {
          <div
            class="grid gap-1"
            [style.grid-template-columns]="'repeat(' + map.cols + ', minmax(0, 1fr))'"
            role="img"
            [attr.aria-label]="'reports.metric.heatMapLabel' | transloco: { count: heatTotal() }"
          >
            @for (cell of heatGrid(); track $index) {
              <div
                class="flex aspect-square items-center justify-center rounded-[6px] text-[12px] font-semibold"
                [style.background]="cell.color ?? heatColor(cell.row, cell.col, map.rows, map.cols)"
                [class.text-white]="cell.count > 0"
                [class.text-fg-subtle]="cell.count === 0"
              >
                {{ cell.count || '' }}
              </div>
            }
          </div>
          <div class="mt-1.5 flex justify-between text-[11px] text-fg-subtle">
            <span>{{ 'reports.metric.consequence' | transloco }} →</span>
            <span>↑ {{ 'reports.metric.likelihood' | transloco }}</span>
          </div>
        } @else {
          <ng-container *ngTemplateOutlet="numbersTpl" />
        }
      }
      @default {
        @if (headline(); as head) {
          <p class="font-display text-[34px] leading-none font-bold tracking-[-0.03em] text-fg">
            {{ head.value | localNumber }}{{ head.percent ? '%' : '' }}
          </p>
          @if (head.field) {
            <p class="mt-1 text-[12.5px] text-fg-muted">{{ fieldLabel(head.field) }}</p>
          }
        }
        @if (secondary().length) {
          <dl class="mt-3 grid grid-cols-2 gap-2">
            @for (n of secondary(); track n.field) {
              <div class="rounded-[8px] bg-surface-2 px-2.5 py-1.5">
                <dt class="text-[11.5px] text-fg-muted">{{ fieldLabel(n.field) }}</dt>
                <dd class="font-mono text-[15px] font-semibold text-fg">
                  {{ n.value | localNumber }}
                </dd>
              </div>
            }
          </dl>
        }
        @for (group of bars(); track group.field) {
          <div class="mt-3">
            <p class="mb-1 text-[11.5px] font-semibold tracking-[0.04em] text-fg-subtle uppercase">
              {{ fieldLabel(group.field) }}
            </p>
            <ul class="flex flex-col gap-1">
              @for (bar of group.entries; track bar.label) {
                <li class="flex items-center gap-2 text-[12.5px]">
                  <span class="w-28 flex-none truncate text-fg-muted">{{ bar.label }}</span>
                  <span class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      class="block h-full rounded-full bg-accent"
                      [style.width.%]="bar.width"
                    ></span>
                  </span>
                  <span class="w-8 flex-none text-right font-mono text-fg">{{ bar.value }}</span>
                </li>
              }
            </ul>
          </div>
        }
      }
    }
    <ng-template #numbersTpl>
      <dl class="grid grid-cols-2 gap-2">
        @for (n of numbers(); track n.field) {
          <div class="rounded-[8px] bg-surface-2 px-2.5 py-1.5">
            <dt class="text-[11.5px] text-fg-muted">{{ fieldLabel(n.field) }}</dt>
            <dd class="font-mono text-[15px] font-semibold text-fg">{{ n.value | localNumber }}</dd>
          </div>
        } @empty {
          <p class="text-[13px] text-fg-muted">{{ 'reports.metric.nothing' | transloco }}</p>
        }
      </dl>
    </ng-template>
  `,
})
export class MetricView {
  private readonly language = inject(LanguageService);

  /** Metric kind (`readiness`, `findings`, `number`, `breakdown`, `list`, `heatmap`, `training`). */
  readonly kind = input<string | null>(null);
  readonly data = input<Readonly<Record<string, unknown>> | null>(null);

  protected readonly view = computed(() => {
    const kind = this.kind();
    const data = this.data();
    if (kind === 'readiness' && Array.isArray(data?.['items'])) return 'readiness';
    if (kind === 'list' && Array.isArray(data?.['items'])) return 'list';
    if (kind === 'heatmap') return 'heatmap';
    return 'summary';
  });

  protected readonly numbers = computed(() => metricNumbers(this.data()));

  protected readonly average = computed(() => {
    const value = this.data()?.['average'];
    return typeof value === 'number' ? value : null;
  });

  protected readonly readinessItems = computed(
    () => (this.data()?.['items'] as readonly ReadinessItem[] | undefined) ?? [],
  );

  protected readonly total = computed(() => {
    const total = this.data()?.['total'];
    return typeof total === 'number' ? total : this.listRows().length;
  });

  protected readonly listRows = computed<ListRow[]>(() => {
    const items = (this.data()?.['items'] as readonly Record<string, unknown>[] | undefined) ?? [];
    return items.slice(0, 10).map((item, index) => {
      const url = (item['url'] as string | undefined) ?? null;
      return {
        id: String(item['id'] ?? item['entity_id'] ?? index),
        title: String(item['title'] ?? item['name'] ?? ''),
        code: (item['code'] as string | null | undefined) ?? null,
        date: (item['due_at'] ?? item['generated_at'] ?? null) as string | null,
        overdue: item['overdue'] === true,
        link: internalLink(url),
      };
    });
  });

  /** The headline number: `value`, else a percentage, else `open`/`total`/`overdue`. */
  protected readonly headline = computed(() => {
    const data = this.data();
    if (this.kind() === 'training') {
      const percent = readPercent(data);
      if (percent !== null) {
        return { field: null, value: percent, percent: true };
      }
    }
    for (const field of ['value', 'open', 'total', 'overdue']) {
      const v = data?.[field];
      if (typeof v === 'number') {
        return { field: field === 'value' ? null : field, value: v, percent: false };
      }
    }
    return null;
  });

  protected readonly secondary = computed(() => {
    const head = this.headline();
    return this.numbers().filter(
      (n) =>
        !(head && !head.percent && n.field === (head.field ?? 'value')) &&
        !(head?.percent && ['percent', 'rate', 'compliance', 'score'].includes(n.field)),
    );
  });

  protected readonly bars = computed(() => {
    const data = this.data();
    const groups: { field: string; entries: { label: string; value: number; width: number }[] }[] =
      [];
    const byModule = data?.['by_module'];
    if (Array.isArray(byModule) && byModule.length) {
      const rows = byModule as readonly ModuleCount[];
      const max = Math.max(...rows.map((r) => r.count), 1);
      groups.push({
        field: 'by_module',
        entries: rows.map((r) => ({
          label: labelOr((k) => this.language.translate(k), moduleLabelKey(r.module), r.module),
          value: r.count,
          width: (r.count / max) * 100,
        })),
      });
    }
    for (const group of metricBreakdowns(data)) {
      if (group.field === 'by_standard') {
        continue;
      }
      const entries = [...group.entries].sort(
        (a, b) => rank(a.field) - rank(b.field) || b.value - a.value,
      );
      const max = Math.max(...entries.map((e) => e.value), 1);
      groups.push({
        field: group.field,
        entries: entries.map((e) => ({
          label: this.valueLabel(group.field, e.field),
          value: e.value,
          width: (e.value / max) * 100,
        })),
      });
    }
    return groups;
  });

  protected readonly heat = computed(() => readHeatMap(this.data()));

  protected readonly heatTotal = computed(
    () => this.heat()?.cells.reduce((sum, c) => sum + c.count, 0) ?? 0,
  );

  /** Cells in display order: highest likelihood row first. */
  protected readonly heatGrid = computed(() => {
    const map = this.heat();
    if (!map) {
      return [];
    }
    const out: { row: number; col: number; count: number; color: string | null }[] = [];
    for (let row = map.rows; row >= 1; row--) {
      for (let col = 1; col <= map.cols; col++) {
        const cell = map.cells.find((c) => c.row === row && c.col === col);
        out.push({ row, col, count: cell?.count ?? 0, color: cell?.color ?? null });
      }
    }
    return out;
  });

  protected color(score: number | null): string {
    return scoreColor(score);
  }

  protected heatColor(row: number, col: number, rows: number, cols: number): string {
    const level = (row / rows + col / cols) / 2;
    if (level >= 0.75) return 'var(--fail)';
    if (level >= 0.5) return 'var(--warn)';
    return 'var(--pass)';
  }

  protected standardLabel(item: ReadinessItem): string {
    return item.framework
      ? labelOr(
          (k) => this.language.translate(k),
          frameworkLabelKey(item.framework),
          item.framework,
        )
      : item.standard_key;
  }

  protected fieldLabel(field: string): string {
    return labelOr((k) => this.language.translate(k), `reports.fields.${field}`, field);
  }

  private valueLabel(group: string, value: string): string {
    const key = group === 'by_severity' ? `reports.severity.${value}` : `reports.values.${value}`;
    return labelOr((k) => this.language.translate(k), key, value);
  }
}

function rank(value: string): number {
  const index = SEVERITY_ORDER.indexOf(value);
  return index === -1 ? SEVERITY_ORDER.length : index;
}
