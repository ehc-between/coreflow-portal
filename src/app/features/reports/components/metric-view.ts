import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { internalLink } from '../../../core/search/internal-link';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import {
  frameworkLabelKey,
  labelOr,
  localized,
  metricBreakdowns,
  metricFieldLabel,
  metricNumbers,
  moduleLabelKey,
  readHeatMap,
  readPercent,
  scoreColor,
} from '../data/report-display';
import { LocalizedLabel, ModuleCount, ReadinessItem } from '../data/reports.models';

interface ListRow {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly date: string | null;
  readonly overdue: boolean;
  readonly owner: string | null;
  readonly link: ReturnType<typeof internalLink>;
}

/** Severity / level order for breakdowns (unknown keys keep their order after these). */
const SEVERITY_ORDER = ['critical', 'very_high', 'high', 'major', 'medium', 'minor', 'low'];

/** Breakdowns whose keys are severities or risk levels. */
const SEVERITY_GROUPS = new Set(['by_severity', 'by_level']);

/** Fields that are context, not numbers to list (shown elsewhere or not at all). */
const HIDDEN_FIELDS = new Set(['rows', 'cols', 'average']);

/**
 * Renders the data of a report metric (a role-overview card, or a block of the
 * Reports overview) by its `kind`: coverage rows per standard, a headline number
 * with its context, breakdown bars, a short list, a risk heat map or a training
 * percentage. Labels come from the portal (`reports.fields.*`), else from the
 * metric's own words (`fieldLabels`), so a metric another module registers reads
 * well too. Never shows a raw key.
 */
@Component({
  selector: 'app-metric-view',
  imports: [RouterLink, TranslocoPipe, LocalNumberPipe, LocalDayPipe, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @switch (view()) {
      @case ('readiness') {
        <ul class="flex flex-col gap-3">
          @for (item of readinessItems(); track item.standard_key) {
            <li class="min-w-0">
              <div class="flex items-baseline justify-between gap-2 text-ui">
                @if (link(item.url); as target) {
                  <a
                    [routerLink]="target.path"
                    [queryParams]="target.queryParams"
                    class="min-w-0 truncate font-semibold text-fg hover:text-accent hover:underline"
                    >{{ standardLabel(item) }}</a
                  >
                } @else {
                  <span class="min-w-0 truncate font-semibold text-fg">{{
                    standardLabel(item)
                  }}</span>
                }
                <span class="flex-none font-mono text-fg-muted">{{ item.score }} %</span>
              </div>
              <app-progress-bar
                class="mt-1 block"
                [value]="item.score"
                [color]="color(item.score)"
                [label]="standardLabel(item)"
              />
              <p class="mt-1 text-meta text-fg-muted">
                {{
                  'reports.metric.documentedOf'
                    | transloco: { covered: item.covered, applicable: item.applicable }
                }}
              </p>
            </li>
          } @empty {
            <li class="text-ui text-fg-muted">
              {{ 'reports.metric.noStandards' | transloco }}
            </li>
          }
        </ul>
      }
      @case ('list') {
        <p class="mb-2 text-meta text-fg-muted">
          {{ 'reports.metric.listTotal' | transloco: { count: total() } }}
        </p>
        <ul class="flex flex-col divide-y divide-border">
          @for (row of listRows(); track row.id) {
            <li class="flex items-center justify-between gap-3 py-1.5 text-ui">
              <span class="min-w-0">
                @if (row.link; as target) {
                  <a
                    [routerLink]="target.path"
                    [queryParams]="target.queryParams"
                    class="block truncate text-fg hover:text-accent hover:underline"
                  >
                    @if (row.code) {
                      <span class="font-mono text-meta text-fg-muted">{{ row.code }}</span>
                    }
                    {{ row.title }}
                  </a>
                } @else {
                  <span class="block truncate text-fg">{{ row.title }}</span>
                }
                @if (row.owner) {
                  <span class="block truncate text-meta text-fg-subtle">{{ row.owner }}</span>
                }
              </span>
              @if (row.date) {
                <span
                  class="flex-none text-meta"
                  [class.text-warn-ink]="row.overdue"
                  [class.font-semibold]="row.overdue"
                  [class.text-fg-muted]="!row.overdue"
                >
                  {{ row.date | localDay }}
                </span>
              }
            </li>
          } @empty {
            <li class="py-2 text-ui text-fg-muted">
              {{ 'reports.metric.nothing' | transloco }}
            </li>
          }
        </ul>
      }
      @case ('heatmap') {
        @if (heat(); as map) {
          <div class="flex max-w-[300px] gap-2">
            <span
              class="flex flex-none items-center text-micro font-semibold text-fg-subtle [writing-mode:vertical-rl] rotate-180"
              aria-hidden="true"
              >{{ 'reports.metric.likelihood' | transloco }} →</span
            >
            <div class="min-w-0 flex-1">
              <div
                class="grid gap-1"
                [style.grid-template-columns]="'repeat(' + map.cols + ', minmax(0, 1fr))'"
                role="img"
                [attr.aria-label]="
                  'reports.metric.heatMapLabel' | transloco: { count: heatTotal() }
                "
                data-testid="heat-map"
              >
                @for (cell of heatGrid(); track $index) {
                  <div
                    class="flex aspect-square items-center justify-center rounded-tile text-meta font-semibold"
                    [style.background]="cell.count > 0 ? cell.color : null"
                    [class.bg-surface-2]="cell.count === 0"
                    [class.text-white]="cell.count > 0"
                    [class.text-fg-subtle]="cell.count === 0"
                    [attr.title]="cell.level ? levelLabel(cell.level) : null"
                  >
                    {{ cell.count || '' }}
                  </div>
                }
              </div>
              <p
                class="mt-1 text-center text-micro font-semibold text-fg-subtle"
                aria-hidden="true"
              >
                {{ 'reports.metric.consequence' | transloco }} →
              </p>
            </div>
          </div>
          @if (secondary().length) {
            <dl class="mt-3 grid grid-cols-3 gap-2">
              @for (n of secondary(); track n.field) {
                <div class="rounded-tile bg-surface-2 px-2.5 py-1.5">
                  <dt class="text-meta text-fg-muted">{{ fieldLabel(n.field) }}</dt>
                  <dd class="font-mono text-card font-semibold text-fg">
                    {{ n.value | localNumber }}
                  </dd>
                </div>
              }
            </dl>
          }
        } @else {
          <p class="text-ui text-fg-muted">{{ 'reports.metric.noRisks' | transloco }}</p>
        }
      }
      @default {
        @if (headline(); as head) {
          <p class="font-display text-page leading-none font-bold text-fg">
            {{ head.value | localNumber }}{{ head.percent ? ' %' : '' }}
          </p>
          @if (head.label) {
            <p class="mt-1 text-meta text-fg-muted">{{ head.label }}</p>
          }
          @if (head.percent) {
            <app-progress-bar
              class="mt-2 block"
              [value]="head.value"
              [color]="color(head.value)"
              [label]="head.label || ''"
            />
          }
        }
        @if (secondary().length) {
          <dl class="mt-3 grid grid-cols-2 gap-2">
            @for (n of secondary(); track n.field) {
              <div class="rounded-tile bg-surface-2 px-2.5 py-1.5">
                <dt class="text-meta text-fg-muted">{{ fieldLabel(n.field) }}</dt>
                <dd class="font-mono text-card font-semibold text-fg">
                  {{ n.value | localNumber }}
                </dd>
              </div>
            }
          </dl>
        }
        @for (group of bars(); track group.field) {
          <div class="mt-3">
            <p class="mb-1 text-meta font-semibold text-fg-muted">
              {{ fieldLabel(group.field) }}
            </p>
            <ul class="flex flex-col gap-1">
              @for (bar of group.entries; track bar.label) {
                <li class="flex items-center gap-2 text-meta">
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
        @if (!headline() && !secondary().length && !bars().length) {
          <p class="text-ui text-fg-muted">{{ 'reports.metric.nothing' | transloco }}</p>
        }
      }
    }
  `,
})
export class MetricView {
  private readonly language = inject(LanguageService);

  /** Metric kind (`readiness`, `findings`, `number`, `breakdown`, `list`, `heatmap`, `training`). */
  readonly kind = input<string | null>(null);
  readonly data = input<Readonly<Record<string, unknown>> | null>(null);
  /** The metric's own field words from the backend (`{field: {en, nb}}`). */
  readonly fieldLabels = input<Readonly<Record<string, LocalizedLabel>> | null | undefined>(null);

  protected readonly view = computed(() => {
    const kind = this.kind();
    const data = this.data();
    if (kind === 'readiness' && Array.isArray(data?.['items'])) return 'readiness';
    if (kind === 'list' && Array.isArray(data?.['items'])) return 'list';
    if (kind === 'heatmap') return 'heatmap';
    return 'summary';
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
      const owner = item['owner'] as { name?: string | null } | null | undefined;
      return {
        id: String(item['id'] ?? item['entity_id'] ?? index),
        title: String(item['title'] ?? item['name'] ?? ''),
        code: (item['code'] as string | null | undefined) ?? null,
        date: (item['due_at'] ?? item['generated_at'] ?? null) as string | null,
        overdue: item['overdue'] === true,
        owner: owner?.name ?? null,
        link: internalLink(url),
      };
    });
  });

  /** The headline: a training percentage, else `value`, else `open`/`total`/`overdue`. */
  protected readonly headline = computed<{
    field: string;
    value: number;
    percent: boolean;
    label: string | null;
  } | null>(() => {
    const data = this.data();
    if (this.kind() === 'training') {
      const percent = readPercent(data);
      if (percent !== null) {
        return {
          field: 'percent',
          value: percent,
          percent: true,
          label: this.fieldLabel('percent'),
        };
      }
    }
    for (const field of ['value', 'open', 'total', 'overdue']) {
      const v = data?.[field];
      if (typeof v === 'number') {
        const label = field === 'value' ? this.valueLabel() : this.fieldLabel(field);
        return { field, value: v, percent: false, label };
      }
    }
    return null;
  });

  protected readonly secondary = computed(() => {
    const head = this.headline();
    const percentFields = ['percent', 'rate', 'compliance', 'score'];
    return metricNumbers(this.data()).filter(
      (n) =>
        !HIDDEN_FIELDS.has(n.field) &&
        (this.view() === 'heatmap' || n.field !== head?.field) &&
        !(head?.percent && percentFields.includes(n.field)) &&
        !(this.view() === 'heatmap' && n.field === 'count'),
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
      const entries = [...group.entries]
        .filter((e) => e.value > 0)
        .sort((a, b) => rank(a.field) - rank(b.field) || b.value - a.value);
      if (!entries.length) {
        continue;
      }
      const max = Math.max(...entries.map((e) => e.value), 1);
      groups.push({
        field: group.field,
        entries: entries.map((e) => ({
          label: this.breakdownLabel(group.field, e.field),
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
    const out: { count: number; color: string; level: string | null }[] = [];
    for (let row = map.rows; row >= 1; row--) {
      for (let col = 1; col <= map.cols; col++) {
        const cell = map.cells.find((c) => c.row === row && c.col === col);
        out.push({
          count: cell?.count ?? 0,
          color: cell?.color ?? fallbackHeatColor(row, col, map.rows, map.cols),
          level: cell?.level ?? null,
        });
      }
    }
    return out;
  });

  protected color(score: number | null): string {
    return scoreColor(score);
  }

  protected link(url: string | null | undefined) {
    return internalLink(url ?? null);
  }

  protected standardLabel(item: ReadinessItem): string {
    const lang = this.language.active();
    const named = localized(item.names, lang, '');
    if (named) {
      return named;
    }
    const key = item.framework ?? item.standard_key;
    return labelOr((k) => this.language.translate(k), frameworkLabelKey(key), key);
  }

  protected fieldLabel(field: string): string {
    return metricFieldLabel(
      (k) => this.language.translate(k),
      field,
      this.fieldLabels(),
      this.language.active(),
    );
  }

  protected levelLabel(level: string): string {
    return labelOr((k) => this.language.translate(k), `reports.severity.${level}`, level);
  }

  /** The metric's own word for its headline (`value`), if it sent one. */
  private valueLabel(): string | null {
    return localized(this.fieldLabels()?.['value'], this.language.active(), '') || null;
  }

  private breakdownLabel(group: string, value: string): string {
    const key = SEVERITY_GROUPS.has(group)
      ? `reports.severity.${value}`
      : `reports.values.${value}`;
    return labelOr((k) => this.language.translate(k), key, value);
  }
}

function rank(value: string): number {
  const index = SEVERITY_ORDER.indexOf(value);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

/** Colour of an empty heat-map position when the backend sent none (green to red). */
function fallbackHeatColor(row: number, col: number, rows: number, cols: number): string {
  const level = (row / rows + col / cols) / 2;
  if (level >= 0.75) return 'var(--fail)';
  if (level >= 0.5) return 'var(--warn)';
  return 'var(--pass)';
}
