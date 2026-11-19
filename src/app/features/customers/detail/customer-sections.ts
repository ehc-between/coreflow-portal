import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { pluralKey } from '../../../shared/i18n/plural';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import {
  CustomerOverview,
  OverviewSection,
  SECTION_KEYS,
  SatisfactionFact,
  SectionItem,
} from '../data/customer.models';

const ITEMS_SHOWN = 5;

/** One panel of the card, ready to render. */
export interface SectionView {
  readonly key: string;
  readonly section: OverviewSection | null;
  readonly items: readonly SectionItem[];
  readonly total: number;
  readonly listUrl: string | null;
  /** The flow behind "+ Ny …", when the user may run it. */
  readonly flowKey: string | null;
}

/**
 * The card's panels in `SECTION_KEYS` order (docs/customer-register-design.md §5):
 * a section shows when it has items or a create flow the user may run (empty
 * sections with no possible action are hidden). Unknown section keys from newer
 * backends follow the known ones, so lanes never need card code.
 */
export function sectionViews(
  overview: CustomerOverview | null,
  runnable: ReadonlySet<string>,
): SectionView[] {
  const sections = overview?.sections ?? [];
  const order = (key: string) => {
    const i = (SECTION_KEYS as readonly string[]).indexOf(key);
    return i === -1 ? SECTION_KEYS.length : i;
  };
  return [...sections]
    .sort((a, b) => order(a.key) - order(b.key))
    .map((section) => {
      const flowKey = section.flow_key && runnable.has(section.flow_key) ? section.flow_key : null;
      return {
        key: section.key,
        section,
        items: (section.items ?? []).slice(0, ITEMS_SHOWN),
        total: section.total ?? section.items?.length ?? 0,
        listUrl: section.list_url,
        flowKey,
      };
    })
    .filter(
      (v) => v.items.length > 0 || v.flowKey !== null || (v.key === 'satisfaction' && v.total > 0),
    );
}

/** SVG polyline points of quarterly scores (0-100) in a `w × h` box; null below two points. */
export function trendPoints(
  satisfaction: SatisfactionFact | null | undefined,
  w = 120,
  h = 32,
): string | null {
  const points = (satisfaction?.points ?? []).filter(
    (p) => p.score !== null && p.score !== undefined && p.n > 0,
  );
  if (points.length < 2) {
    return null;
  }
  const step = w / (points.length - 1);
  return points
    .map((p, i) => {
      const y = h - (Math.max(0, Math.min(100, p.score ?? 0)) / 100) * h;
      return `${Math.round(i * step * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}

/** Router link + query of a `list_url` such as `/deviations?customer_id=…`. */
export function splitUrl(url: string): { path: string; query: Record<string, string> } {
  const [path, search = ''] = url.split('?');
  const query: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(search)) {
    query[k] = v;
  }
  return { path, query };
}

/**
 * The connected records on the customer card, one compact panel per section
 * (claims, deviations, contracts, projects, satisfaction, requirements, audits,
 * privacy, property, documents, work), rendered generically from
 * `GET /customers/{id}/overview`: up to five items (open first), "Se alle (N) →"
 * and "+ Ny …" (`flowRequested`).
 */
@Component({
  selector: 'app-customer-sections',
  imports: [TranslocoPipe, RouterLink, EntityChip, LocalDayPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @for (view of views(); track view.key) {
      <section
        class="rounded-card border border-border bg-surface p-4"
        [attr.aria-labelledby]="'cus-sec-' + view.key"
        [attr.data-testid]="'section-' + view.key"
      >
        <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 [id]="'cus-sec-' + view.key" class="font-display text-ui font-bold text-fg">
            {{ sectionKey(view.key, 'title') | transloco }}
            @if (view.section?.open; as open) {
              <span
                class="ml-1 rounded-full bg-warn-soft px-1.5 py-px text-micro font-semibold text-warn-ink"
              >
                {{ pluralKey('customers.sections.openCount', open) | transloco: { count: open } }}
              </span>
            }
          </h2>
          @if (view.flowKey; as flow) {
            <button
              type="button"
              class="text-meta font-semibold text-accent hover:underline"
              (click)="flowRequested.emit(flow)"
              [attr.data-testid]="'section-new-' + view.key"
            >
              + {{ sectionKey(view.key, 'new') | transloco }}
            </button>
          }
        </div>

        @if (view.key === 'satisfaction') {
          @if (satisfaction(); as s) {
            <div class="mb-2 flex flex-wrap items-center gap-3" data-testid="satisfaction">
              @if (s.score !== null && s.score !== undefined) {
                <span class="font-display text-section font-bold text-fg">{{ s.score }}</span>
              }
              @if (trend(); as points) {
                <svg
                  width="120"
                  height="32"
                  viewBox="0 0 120 32"
                  class="text-accent"
                  role="img"
                  [attr.aria-label]="
                    'customers.sections.satisfaction.trend.' + (s.trend ?? 'flat') | transloco
                  "
                >
                  <polyline
                    [attr.points]="points"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linejoin="round"
                  />
                </svg>
              }
              @if (s.trend) {
                <span class="text-meta text-fg-muted">{{
                  'customers.sections.satisfaction.trend.' + s.trend | transloco
                }}</span>
              }
              <span class="w-full text-meta text-fg-muted">{{
                'customers.sections.satisfaction.counts'
                  | transloco: { complaints: s.complaints_12m, compliments: s.compliments_12m }
              }}</span>
            </div>
          }
        }
        @if (view.key === 'audits') {
          @if (audits(); as a) {
            <p class="mb-2 text-meta text-fg-muted" data-testid="audit-facts">
              @if (a.last; as last) {
                {{ 'customers.sections.audits.last' | transloco: { date: (last.date | localDay) } }}
                @if (last.open_findings) {
                  ·
                  {{
                    pluralKey('customers.sections.audits.findings', last.open_findings)
                      | transloco: { count: last.open_findings }
                  }}
                }
              }
              @if (a.next; as next) {
                @if (a.last) {
                  ·
                }
                {{ 'customers.sections.audits.next' | transloco: { date: (next.date | localDay) } }}
              }
            </p>
          }
        }

        @if (view.items.length) {
          <ul class="flex flex-col divide-y divide-border">
            @for (item of view.items; track item.entity_type + item.entity_id) {
              <li class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">
                <app-entity-chip
                  [ref]="item"
                  [statusText]="true"
                  [showType]="
                    view.key === 'work' || view.key === 'privacy' || view.key === 'deviations'
                  "
                />
                @if (item.extra; as x) {
                  <span class="flex flex-wrap items-baseline gap-2 text-meta text-fg-muted">
                    @if (x.badge_key) {
                      <span
                        class="rounded-full border border-border px-1.5 py-px text-micro font-semibold"
                        >{{ 'customers.sections.badges.' + x.badge_key | transloco }}</span
                      >
                    }
                    @if (
                      x.days !== null &&
                      x.days !== undefined &&
                      x.days >= 0 &&
                      view.key === 'contracts'
                    ) {
                      <span [class.text-warn-ink]="x.days <= 60">{{
                        pluralKey('customers.sections.contracts.renews', x.days)
                          | transloco: { count: x.days }
                      }}</span>
                    } @else if (x.due_on) {
                      <span>{{ x.due_on | localDay }}</span>
                    }
                    @if (x.score !== null && x.score !== undefined) {
                      <span>{{ x.score }}</span>
                    }
                  </span>
                }
              </li>
            }
          </ul>
        } @else if (view.key !== 'satisfaction') {
          <p class="text-meta text-fg-muted" data-testid="section-empty">
            {{ 'customers.sections.none' | transloco }}
          </p>
        }

        @if (view.listUrl && view.total > view.items.length) {
          @let target = split(view.listUrl);
          <a
            [routerLink]="target.path"
            [queryParams]="target.query"
            class="mt-2 inline-block text-meta font-semibold text-accent hover:underline"
            [attr.data-testid]="'section-all-' + view.key"
          >
            {{ 'customers.sections.seeAll' | transloco: { count: view.total } }}
            <span aria-hidden="true">→</span>
          </a>
        }
      </section>
    }
  `,
})
export class CustomerSections {
  readonly overview = input<CustomerOverview | null>(null);
  /** Create-flow keys the user may run from this customer. */
  readonly runnable = input<ReadonlySet<string>>(new Set());
  readonly flowRequested = output<string>();

  protected readonly pluralKey = pluralKey;
  protected readonly split = splitUrl;
  protected readonly views = computed(() => sectionViews(this.overview(), this.runnable()));
  protected readonly satisfaction = computed(() => this.overview()?.facts?.satisfaction ?? null);
  protected readonly trend = computed(() => trendPoints(this.satisfaction()));
  protected readonly audits = computed(() => {
    const f = this.overview()?.facts;
    return f?.last_audit || f?.next_audit
      ? { last: f.last_audit ?? null, next: f.next_audit ?? null }
      : null;
  });

  /** `customers.sections.<key>.<part>` for known sections, a generic key otherwise. */
  protected sectionKey(key: string, part: 'title' | 'new'): string {
    return (SECTION_KEYS as readonly string[]).includes(key)
      ? `customers.sections.${key}.${part}`
      : `customers.sections.other.${part}`;
  }
}
