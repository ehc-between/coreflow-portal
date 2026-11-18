import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { InputData, InputSection, PreviousActionItem } from '../data/management-review.models';
import {
  BREAKDOWN_DIMENSIONS,
  actionStatusKey,
  breakdown,
  decisionCategoryKey,
  dimensionKey,
  frameworkKey,
  humanize,
  isPercent,
  metricKey,
  sourceKey,
  toneValue,
  trend,
  valueKey,
} from '../management-review-display';

interface MetricRow {
  readonly key: string;
  readonly labelKey: string | null;
  readonly label: string;
  readonly value: number | string;
  readonly percent: boolean;
  readonly previous: number | string | null;
  readonly trend: ReturnType<typeof trend>;
}

interface Group {
  readonly key: string;
  readonly labelKey: string | null;
  readonly label: string;
  readonly rows: readonly { key: string; labelKey: string | null; label: string; value: number }[];
}

export interface ViewSection {
  readonly source: string;
  readonly sourceKey: string | null;
  readonly sourceLabel: string;
  readonly url: string | null;
  readonly metrics: readonly MetricRow[];
  readonly groups: readonly Group[];
  readonly readiness: readonly {
    readonly key: string;
    readonly frameworkKey: string | null;
    readonly label: string;
    readonly score: number | null;
    readonly covered: number | null;
    readonly applicable: number | null;
  }[];
  readonly actions: readonly PreviousActionItem[];
  readonly previous: InputSection['previous'];
  readonly hasPrevious: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Keys of a section that hold a breakdown: the known ones first, then any other `by_*`. */
function groupKeys(s: InputSection): string[] {
  const known = BREAKDOWN_DIMENSIONS.filter((k) => k in s);
  const extra = Object.keys(s).filter(
    (k) => k.startsWith('by_') && !(BREAKDOWN_DIMENSIONS as readonly string[]).includes(k),
  );
  return [...known, ...extra];
}

function actionItems(s: InputSection): PreviousActionItem[] {
  if (s.source !== 'previous_review') {
    return [];
  }
  return (s.items ?? []).filter(
    (i): i is PreviousActionItem & Record<string, unknown> =>
      typeof i['text'] === 'string' && typeof i['status'] === 'string',
  );
}

/** Normalise the compiled `data` of an input into view rows (pure, for tests). */
export function viewSections(data: InputData | null | undefined): ViewSection[] {
  return (data?.sections ?? []).map((s) => {
    const previous = s.previous_metrics ?? null;
    return {
      source: s.source,
      sourceKey: sourceKey(s.source),
      sourceLabel: humanize(s.source),
      url: s.url ?? null,
      metrics: Object.entries(s.metrics ?? {})
        .filter((e): e is [string, number | string] => e[1] !== null && e[1] !== undefined)
        .map(([key, value]) => {
          const before = previous?.[key] ?? null;
          return {
            key,
            labelKey: metricKey(key),
            label: humanize(key),
            value,
            percent: isPercent(key),
            previous: before,
            trend: previous ? trend(value, before) : null,
          };
        }),
      groups: groupKeys(s)
        .map((g) => ({
          key: g,
          labelKey: dimensionKey(g),
          label: humanize(g.replace(/^by_/, '')),
          rows: breakdown(
            (s as unknown as Record<string, unknown>)[g] as Record<string, unknown>,
          ).map(([key, value]) => ({ key, labelKey: valueKey(key), label: humanize(key), value })),
        }))
        .filter((g) => g.rows.length > 0),
      readiness:
        s.source === 'readiness'
          ? (s.items ?? []).map((item, i) => {
              const framework = typeof item['framework'] === 'string' ? item['framework'] : null;
              const standard =
                typeof item['standard_key'] === 'string' ? item['standard_key'] : null;
              return {
                key: `${standard ?? framework ?? 'item'}-${i}`,
                frameworkKey:
                  framework && framework.startsWith('iso') ? frameworkKey(framework) : null,
                label: standard ?? framework ?? humanize(String(i + 1)),
                score: num(item['score']),
                covered: num(item['covered']),
                applicable: num(item['applicable']),
              };
            })
          : [],
      actions: actionItems(s),
      previous: s.previous ?? null,
      hasPrevious: !!previous,
    };
  });
}

/**
 * The compiled figures of a review input: per source module a heading with
 * "Se listen" (the list the figures come from), the headline counts with the
 * change since the previous review, breakdowns (by severity, level, status…),
 * coverage per standard, and the follow-up actions of the previous review.
 * Only counts are compiled, never record text. A module that is switched off
 * says so, with a link to turn it on.
 */
@Component({
  selector: 'app-mr-input-data',
  imports: [RouterLink, TranslocoPipe, LocalDayPipe, LocalNumberPipe, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (modulesOff().length) {
      <p class="mb-2 text-meta text-fg-muted" data-testid="mr-modules-off">
        {{ 'managementReview.inputData.modulesOff' | transloco: { modules: modulesOffText() } }}
        <a routerLink="/settings/modules" class="font-semibold text-accent hover:underline">{{
          'managementReview.inputData.turnOn' | transloco
        }}</a>
      </p>
    }
    @if (sections().length === 0) {
      <p class="text-meta text-fg-muted">
        {{
          (auto() ? 'managementReview.inputData.notCompiled' : 'managementReview.inputData.manual')
            | transloco
        }}
      </p>
    } @else {
      <div class="flex flex-col gap-4">
        @for (s of sections(); track s.source + $index) {
          <section [attr.aria-label]="s.sourceKey ? (s.sourceKey | transloco) : s.sourceLabel">
            <div class="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h4 class="text-meta font-semibold text-fg-muted">
                {{ s.sourceKey ? (s.sourceKey | transloco) : s.sourceLabel }}
              </h4>
              @if (s.url) {
                <a
                  [routerLink]="path(s.url)"
                  [queryParams]="query(s.url)"
                  class="inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
                  data-testid="mr-section-link"
                >
                  {{ 'managementReview.inputData.openList' | transloco }}
                  <app-icon name="arrow" [size]="12" />
                </a>
              }
            </div>
            @if (s.metrics.length) {
              <dl class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                @for (m of s.metrics; track m.key) {
                  <div class="rounded-tile border border-border bg-bg px-2.5 py-1.5">
                    <dt class="text-meta text-fg-muted">
                      {{ m.labelKey ? (m.labelKey | transloco) : m.label }}
                    </dt>
                    <dd class="flex flex-wrap items-baseline gap-x-2">
                      <span class="font-display text-card font-bold text-fg"
                        >{{ m.value | localNumber: '1.0-1' }}{{ m.percent ? ' %' : '' }}</span
                      >
                      @if (m.trend; as t) {
                        <span
                          class="text-micro text-fg-subtle"
                          [title]="
                            'managementReview.inputData.previousValue'
                              | transloco: { value: m.previous }
                          "
                          data-testid="mr-trend"
                        >
                          @switch (t.direction) {
                            @case ('up') {
                              <span aria-hidden="true">▲</span>
                              <span class="sr-only">{{
                                'managementReview.inputData.trendUp' | transloco
                              }}</span>
                              {{ t.delta | localNumber: '1.0-1' }}
                            }
                            @case ('down') {
                              <span aria-hidden="true">▼</span>
                              <span class="sr-only">{{
                                'managementReview.inputData.trendDown' | transloco
                              }}</span>
                              {{ t.delta | localNumber: '1.0-1' }}
                            }
                            @default {
                              {{ 'managementReview.inputData.trendSame' | transloco }}
                            }
                          }
                        </span>
                      }
                    </dd>
                  </div>
                }
              </dl>
              @if (s.hasPrevious) {
                <p class="mt-1 text-micro text-fg-subtle">
                  {{ 'managementReview.inputData.trendNote' | transloco }}
                </p>
              }
            }
            @for (g of s.groups; track g.key) {
              <div class="mt-2">
                <p class="text-meta font-semibold text-fg-muted">
                  {{ g.labelKey ? (g.labelKey | transloco) : g.label }}
                </p>
                <ul class="mt-1 flex flex-wrap gap-1.5">
                  @for (r of g.rows; track r.key) {
                    <li
                      class="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-meta text-fg"
                    >
                      {{ valueLabel(r.key, r.labelKey) }}:
                      <strong>{{ r.value | localNumber }}</strong>
                    </li>
                  }
                </ul>
              </div>
            }
            @if (s.readiness.length) {
              <ul class="mt-2 flex flex-col gap-1">
                @for (r of s.readiness; track r.key) {
                  <li class="flex flex-wrap items-baseline gap-x-2 text-meta text-fg">
                    <span class="font-semibold">{{
                      r.frameworkKey ? (r.frameworkKey | transloco) : r.label
                    }}</span>
                    @if (r.score !== null) {
                      <span>{{
                        'managementReview.inputData.score'
                          | transloco: { score: (r.score | localNumber: '1.0-0') }
                      }}</span>
                    }
                    @if (r.covered !== null && r.applicable !== null) {
                      <span class="text-fg-muted">{{
                        'managementReview.inputData.covered'
                          | transloco: { covered: r.covered, applicable: r.applicable }
                      }}</span>
                    }
                  </li>
                }
              </ul>
            }
            @if (s.actions.length) {
              <ul
                class="mt-2 flex flex-col divide-y divide-border rounded-tile border border-border"
              >
                @for (a of s.actions; track a.decision_id) {
                  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span class="min-w-0 flex-1 text-ui text-fg">{{ a.text }}</span>
                    <span class="text-meta text-fg-muted">{{
                      categoryKey(a.category) | transloco
                    }}</span>
                    @if (a.due_at) {
                      <span
                        class="text-meta"
                        [class]="a.overdue ? 'font-semibold text-warn-ink' : 'text-fg-muted'"
                        >{{
                          'managementReview.decisions.dueOn'
                            | transloco: { date: (a.due_at | localDay) }
                        }}</span
                      >
                    }
                    <app-status-badge
                      meaning="lifecycle"
                      [value]="a.overdue && a.status !== 'done' ? 'overdue' : tone(a.status)"
                      [labelKey]="statusKey(a.status)"
                    />
                    @if (a.task_url) {
                      <a
                        [routerLink]="a.task_url"
                        class="text-meta font-semibold text-accent hover:underline"
                        >{{ 'managementReview.inputData.openTask' | transloco }}</a
                      >
                    }
                  </li>
                }
              </ul>
            }
            @if (s.previous; as p) {
              <p class="mt-2 text-meta text-fg-muted">
                {{ 'managementReview.inputData.previous' | transloco }}
                <a [routerLink]="p.url" class="font-semibold text-accent hover:underline">{{
                  p.code
                }}</a>
              </p>
            }
          </section>
        }
      </div>
    }
  `,
})
export class InputDataView {
  private readonly language = inject(LanguageService);

  readonly data = input<InputData | null>(null);
  readonly auto = input(false);

  protected readonly sections = computed(() => viewSections(this.data()));
  protected readonly modulesOff = computed(() => this.data()?.modules_off ?? []);
  protected readonly modulesOffText = computed(() =>
    this.modulesOff()
      .map((m) => this.language.translate(`modules.names.${m}`))
      .join(', '),
  );
  protected readonly categoryKey = decisionCategoryKey;
  protected readonly statusKey = actionStatusKey;
  protected readonly tone = toneValue;

  /** A breakdown value: the module's word, else the shared status word, else readable text. */
  protected valueLabel(key: string, labelKey: string | null): string {
    if (labelKey) {
      return this.language.translate(labelKey);
    }
    const common = `common.status.${key}`;
    const text = this.language.translate(common);
    return text && text !== common ? text : humanize(key);
  }

  protected path(url: string): string {
    return url.split('?')[0] || '/';
  }

  protected query(url: string): Record<string, string> | null {
    const search = url.split('?')[1];
    if (!search) {
      return null;
    }
    const out: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(search)) {
      out[k] = v;
    }
    return out;
  }
}
