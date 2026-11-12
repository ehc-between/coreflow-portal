import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { InputData, InputSection } from '../data/management-review.models';
import {
  breakdown,
  frameworkKey,
  humanize,
  metricKey,
  valueKey,
  reviewStatusKey,
  sourceKey,
} from '../management-review-display';

interface Row {
  readonly key: string;
  readonly labelKey: string | null;
  readonly label: string;
  readonly value: number | string;
}

interface Group {
  readonly key: string;
  readonly labelKey: string;
  readonly rows: readonly Row[];
}

interface ViewSection {
  readonly source: string;
  readonly sourceKey: string | null;
  readonly sourceLabel: string;
  readonly metrics: readonly Row[];
  readonly groups: readonly Group[];
  readonly readiness: readonly {
    readonly key: string;
    readonly frameworkKey: string | null;
    readonly label: string;
    readonly score: number | null;
    readonly covered: number | null;
    readonly applicable: number | null;
  }[];
  readonly previous: InputSection['previous'];
}

const GROUPS: readonly (keyof InputSection)[] = [
  'by_severity',
  'open_by_status',
  'by_status',
  'effectiveness',
];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Normalise the compiled `data` of an input into view rows (pure, for tests). */
export function viewSections(data: InputData | null | undefined): ViewSection[] {
  return (data?.sections ?? []).map((s) => ({
    source: s.source,
    sourceKey: sourceKey(s.source),
    sourceLabel: humanize(s.source),
    metrics: Object.entries(s.metrics ?? {})
      .filter((e): e is [string, number | string] => e[1] !== null && e[1] !== undefined)
      .map(([key, value]) => ({ key, labelKey: metricKey(key), label: humanize(key), value })),
    groups: GROUPS.map((g) => ({
      key: g,
      labelKey: `managementReview.inputData.${g}`,
      rows: breakdown(s[g] as Readonly<Record<string, unknown>> | null | undefined).map(
        ([key, value]) => ({ key, labelKey: valueKey(key), label: humanize(key), value }),
      ),
    })).filter((g) => g.rows.length > 0),
    readiness: (s.items ?? []).map((item, i) => {
      const framework = typeof item['framework'] === 'string' ? item['framework'] : null;
      const standard = typeof item['standard_key'] === 'string' ? item['standard_key'] : null;
      return {
        key: `${standard ?? framework ?? 'item'}-${i}`,
        frameworkKey: framework && framework.startsWith('iso') ? frameworkKey(framework) : null,
        label: standard ?? framework ?? humanize(String(i + 1)),
        score: num(item['score']),
        covered: num(item['covered']),
        applicable: num(item['applicable']),
      };
    }),
    previous: s.previous ?? null,
  }));
}

/**
 * Renders the compiled data of a review input: per source, the headline counts,
 * breakdowns (by severity, by status, effectiveness), readiness per standard and
 * a link to the previous review. Only counts are compiled, never record text.
 * Unknown sources and metrics (from modules added later) show a readable name.
 */
@Component({
  selector: 'app-mr-input-data',
  imports: [RouterLink, TranslocoPipe, LocalDatePipe, LocalNumberPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sections().length === 0) {
      <p class="text-[12.5px] text-fg-muted">
        {{
          (auto() ? 'managementReview.inputData.notCompiled' : 'managementReview.inputData.manual')
            | transloco
        }}
      </p>
    } @else {
      <div class="flex flex-col gap-3">
        @for (s of sections(); track s.source + $index) {
          <section [attr.aria-label]="s.sourceKey ? (s.sourceKey | transloco) : s.sourceLabel">
            <h4 class="mb-1.5 text-[12px] font-semibold tracking-wide text-fg-subtle uppercase">
              {{ s.sourceKey ? (s.sourceKey | transloco) : s.sourceLabel }}
            </h4>
            @if (s.metrics.length) {
              <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                @for (m of s.metrics; track m.key) {
                  <div class="rounded-[8px] border border-border bg-bg px-2.5 py-1.5">
                    <dt class="truncate text-[11.5px] text-fg-muted">
                      {{ m.labelKey ? (m.labelKey | transloco) : m.label }}
                    </dt>
                    <dd class="font-display text-[16px] font-bold text-fg">
                      {{ m.value | localNumber }}
                    </dd>
                  </div>
                }
              </dl>
            }
            @for (g of s.groups; track g.key) {
              <div class="mt-2">
                <p class="text-[11.5px] font-semibold text-fg-muted">
                  {{ g.labelKey | transloco }}
                </p>
                <ul class="mt-1 flex flex-wrap gap-1.5">
                  @for (r of g.rows; track r.key) {
                    <li
                      class="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[12px] text-fg"
                    >
                      {{ r.labelKey ? (r.labelKey | transloco) : r.label }}:
                      <strong>{{ r.value | localNumber }}</strong>
                    </li>
                  }
                </ul>
              </div>
            }
            @if (s.readiness.length) {
              <ul class="mt-2 flex flex-col gap-1">
                @for (r of s.readiness; track r.key) {
                  <li class="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-fg">
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
            @if (s.previous; as p) {
              <p class="mt-2 text-[12.5px] text-fg-muted">
                {{ 'managementReview.inputData.previous' | transloco }}
                <a [routerLink]="p.url" class="font-semibold text-accent hover:underline">{{
                  p.code
                }}</a>
                ({{ statusLabel(p.status) | transloco }}
                @if (p.signed_at) {
                  · {{ p.signed_at | localDate }}
                }
                )
              </p>
            }
          </section>
        }
      </div>
    }
  `,
})
export class InputDataView {
  readonly data = input<InputData | null>(null);
  readonly auto = input(false);

  protected readonly sections = computed(() => viewSections(this.data()));
  protected readonly statusLabel = reviewStatusKey;
}
