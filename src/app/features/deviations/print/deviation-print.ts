import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import {
  DeviationDetail,
  FISHBONE_CATEGORIES,
  RootCauseAnalysis,
} from '../../../core/deviations/deviation.models';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { parseClause } from '../../../shared/requirement-links/clause-picker';
import { fixedShortName, shortNameKey } from '../../../shared/requirement-links/requirement-label';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { clauseRefsOf } from '../deviation-display';
import {
  actionKindLabelKey,
  actionStatusLabelKey,
  effectivenessLabelKey,
  rootCauseMethodLabelKey,
  severityLabelKey,
  sourceLabelKey,
} from '../deviation-enums';
import { describeEvent } from '../deviation-events';
import { DeviationStatusLabels } from '../deviation-status';

const PRINT_CLASS = 'cf-printing';
const PRINT_STYLE_ID = 'cf-deviation-print-style';
/** Print only the case file, not the app shell around it. */
const PRINT_CSS = `@media print {
  body.${PRINT_CLASS} * { visibility: hidden !important; }
  body.${PRINT_CLASS} .cf-print-area, body.${PRINT_CLASS} .cf-print-area * { visibility: visible !important; }
  body.${PRINT_CLASS} .cf-print-area { position: absolute; inset: 0 auto auto 0; width: 100%; }
  @page { margin: 16mm; }
}`;

/**
 * The printable case file of a deviation (audit finding 19), for auditors and
 * archives: the facts, the requirements it affects, authority notifications, the
 * root cause with its analyses, every action with its effect, and the history.
 * "Skriv ut / lagre som PDF" uses the browser's print dialog; only the case file is
 * printed (the app shell is hidden in print).
 */
@Component({
  selector: 'app-deviation-print',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    Button,
    EmptyState,
    Icon,
    LoadingState,
  ],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-6 pb-12 sm:px-8">
      @if (loading()) {
        <app-loading-state [rows]="8" />
      } @else if (dev(); as d) {
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <a
            [routerLink]="['/deviations', d.id]"
            class="inline-flex items-center gap-1 text-meta font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="15" />
            {{ 'deviations.print.back' | transloco: { code: d.code } }}
          </a>
          <app-button (click)="print()" data-testid="print-now">
            <app-icon name="documents" [size]="15" />
            {{ 'deviations.print.print' | transloco }}
          </app-button>
        </div>

        <article
          class="cf-print-area rounded-card border border-border bg-surface p-6 text-ui text-fg print:border-0 print:p-0"
        >
          <header class="mb-5 border-b border-border pb-4">
            <p class="text-meta text-fg-muted">
              {{ 'deviations.print.caseFile' | transloco }} · {{ orgName() }}
            </p>
            <h1 class="mt-1 font-display text-page font-bold">
              <span class="font-mono text-section text-fg-muted">{{ d.code }}</span> {{ d.title }}
            </h1>
            <p class="mt-1 text-meta text-fg-muted">
              {{ d.type_name }} · {{ statusLabels.label(d) }} ·
              {{ severityLabelKey(d.severity) | transloco }} ·
              {{ 'deviations.print.printedAt' | transloco: { date: (now | localDate) } }}
            </p>
          </header>

          <section class="mb-5">
            <h2 class="mb-2 text-card font-bold">
              {{ 'deviations.detail.sections.what' | transloco }}
            </h2>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-2">
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'deviations.facts.occurredAt' | transloco }}
              </dt>
              <dd>{{ (d.occurred_at | localDate) || ('common.empty.notSet' | transloco) }}</dd>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'deviations.facts.detectedAt' | transloco }}
              </dt>
              <dd>{{ (d.detected_at | localDate) || ('common.empty.notSet' | transloco) }}</dd>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'deviations.facts.location' | transloco }}
              </dt>
              <dd>{{ d.location || ('common.empty.notSet' | transloco) }}</dd>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'deviations.detail.meta.source' | transloco }}
              </dt>
              <dd>
                {{ sourceLabelKey(d.source) | transloco }}
                @if (d.origin; as o) {
                  · {{ 'deviations.detail.createdFrom' | transloco }} {{ o.code }} {{ o.title }}
                }
              </dd>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'deviations.detail.meta.raised' | transloco }}
              </dt>
              <dd>{{ d.raised_at | localDate }}</dd>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'deviations.detail.meta.due' | transloco }}
              </dt>
              <dd>{{ (d.due_at | localDay) || ('common.empty.notSet' | transloco) }}</dd>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'deviations.detail.owner' | transloco }}
              </dt>
              <dd>{{ d.owner_name || ('common.empty.notSet' | transloco) }}</dd>
              <dt class="text-meta font-semibold text-fg-muted">
                {{ 'deviations.detail.meta.closed' | transloco }}
              </dt>
              <dd>{{ (d.closed_at | localDate) || ('common.empty.notSet' | transloco) }}</dd>
            </dl>
            <h3 class="mt-3 text-meta font-semibold text-fg-muted">
              {{ 'deviations.create.fields.description' | transloco }}
            </h3>
            <p class="whitespace-pre-line">
              {{ d.description || ('common.empty.notSet' | transloco) }}
            </p>
            <h3 class="mt-3 text-meta font-semibold text-fg-muted">
              {{ 'deviations.facts.immediateAction' | transloco }}
            </h3>
            <p class="whitespace-pre-line">
              {{ d.immediate_action || ('common.empty.notSet' | transloco) }}
            </p>
          </section>

          <section class="mb-5">
            <h2 class="mb-2 text-card font-bold">
              {{ 'deviations.form.requirements' | transloco }}
            </h2>
            @if (clauses().length) {
              <ul class="list-disc pl-5">
                @for (c of clauses(); track c.ref) {
                  <li>{{ c.shortKey ? (c.shortKey | transloco) : c.short }} · {{ c.number }}</li>
                }
              </ul>
            } @else {
              <p class="text-fg-muted">{{ 'deviations.detail.noRequirements' | transloco }}</p>
            }
          </section>

          @if ((d.reporting_obligations ?? []).length) {
            <section class="mb-5">
              <h2 class="mb-2 text-card font-bold">
                {{ 'deviations.reporting.title' | transloco }}
              </h2>
              <ul class="flex flex-col gap-1">
                @for (o of d.reporting_obligations ?? []; track o.key) {
                  <li>
                    <strong>{{ 'deviations.reporting.obligation.' + o.key | transloco }}</strong>
                    ({{ 'deviations.reporting.authority.' + o.authority | transloco }}):
                    {{ 'deviations.reporting.status.' + o.status | transloco }}
                    @if (o.notified_at) {
                      ·
                      {{
                        'deviations.reporting.notifiedOn'
                          | transloco: { date: (o.notified_at | localDate) }
                      }}
                    }
                    @if (o.reference) {
                      ·
                      {{ 'deviations.reporting.referenceShown' | transloco: { ref: o.reference } }}
                    }
                    @if (o.not_required_reason) {
                      · {{ o.not_required_reason }}
                    }
                  </li>
                }
              </ul>
            </section>
          }

          <section class="mb-5">
            <h2 class="mb-2 text-card font-bold">
              {{ 'deviations.detail.sections.rootCause' | transloco }}
            </h2>
            @if (d.root_cause) {
              <p class="whitespace-pre-line">
                @if (d.root_cause_method) {
                  <strong>{{ rootCauseMethodLabelKey(d.root_cause_method) | transloco }}:</strong>
                }
                {{ d.root_cause }}
              </p>
            } @else {
              <p class="text-fg-muted">{{ 'deviations.detail.noRootCause' | transloco }}</p>
            }
            @for (a of analyses(); track a.id) {
              <div class="mt-3 rounded-tile border border-border p-3 print:break-inside-avoid">
                <p class="text-meta font-semibold text-fg-muted">
                  {{ 'deviations.rootCauses.methods.' + a.method | transloco }} ·
                  {{ a.created_by_name }} · {{ a.created_at | localDate }}
                </p>
                @if (a.problem) {
                  <p class="mt-1">
                    <strong>{{ 'deviations.rootCauses.problem' | transloco }}:</strong>
                    {{ a.problem }}
                  </p>
                }
                @if (a.whys.length) {
                  <ol class="mt-1 list-decimal pl-5">
                    @for (w of a.whys; track $index) {
                      <li>{{ w.question }} — {{ w.answer }}</li>
                    }
                  </ol>
                }
                @for (cat of categories; track cat) {
                  @if ((a.categories[cat] ?? []).length) {
                    <p class="mt-1">
                      <strong>{{ 'deviations.rootCauses.categories.' + cat | transloco }}:</strong>
                      {{ (a.categories[cat] ?? []).join('; ') }}
                    </p>
                  }
                }
                @if (a.conclusion) {
                  <p class="mt-1">
                    <strong>{{ 'deviations.rootCauses.conclusion' | transloco }}:</strong>
                    {{ a.conclusion }}
                  </p>
                }
              </div>
            }
          </section>

          <section class="mb-5">
            <h2 class="mb-2 text-card font-bold">{{ 'deviations.actions.title' | transloco }}</h2>
            @if (d.actions.length) {
              <table class="w-full border-collapse text-left text-meta">
                <thead>
                  <tr class="border-b border-border">
                    <th class="py-1 pr-2">{{ 'deviations.actions.fields.kind' | transloco }}</th>
                    <th class="py-1 pr-2">
                      {{ 'deviations.actions.fields.description' | transloco }}
                    </th>
                    <th class="py-1 pr-2">{{ 'deviations.actions.fields.owner' | transloco }}</th>
                    <th class="py-1 pr-2">{{ 'deviations.actions.fields.due' | transloco }}</th>
                    <th class="py-1 pr-2">{{ 'deviations.actions.fields.status' | transloco }}</th>
                    <th class="py-1">
                      {{ 'deviations.actions.fields.effectiveness' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of d.actions; track a.id) {
                    <tr class="border-b border-border align-top print:break-inside-avoid">
                      <td class="py-1 pr-2">{{ actionKindLabelKey(a.kind) | transloco }}</td>
                      <td class="py-1 pr-2 whitespace-pre-line">{{ a.description }}</td>
                      <td class="py-1 pr-2">
                        {{ a.owner_name || ('common.empty.dash' | transloco) }}
                      </td>
                      <td class="py-1 pr-2">
                        {{ (a.due_at | localDay) || ('common.empty.dash' | transloco) }}
                      </td>
                      <td class="py-1 pr-2">{{ actionStatusLabelKey(a.status) | transloco }}</td>
                      <td class="py-1">
                        {{ effectivenessLabelKey(a.effectiveness ?? 'pending') | transloco }}
                        @if (a.verified_by_name) {
                          ({{ a.verified_by_name }}, {{ a.verified_at | localDay }})
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="text-fg-muted">{{ 'deviations.actions.empty' | transloco }}</p>
            }
          </section>

          <section>
            <h2 class="mb-2 text-card font-bold">{{ 'deviations.history.title' | transloco }}</h2>
            <ul class="flex flex-col gap-1 text-meta">
              @for (row of history(); track row.id) {
                <li>
                  <span class="text-fg-muted">{{ row.at | localDate }}</span> ·
                  {{ row.summary }}
                  @if (row.actor) {
                    ({{ row.actor }})
                  }
                  @if (row.detail) {
                    — {{ row.detail }}
                  }
                </li>
              }
            </ul>
          </section>
        </article>
      } @else {
        <app-empty-state
          icon="search"
          titleKey="deviations.detail.notFound"
          bodyKey="deviations.detail.notFoundBody"
          ctaKey="deviations.backToList"
          ctaLink="/deviations"
          ctaVariant="secondary"
        />
      }
    </div>
  `,
})
export class DeviationPrintPage {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);
  protected readonly statusLabels = inject(DeviationStatusLabels);

  readonly id = input.required<string>();

  protected readonly now = new Date().toISOString();
  protected readonly categories = FISHBONE_CATEGORIES;
  protected readonly severityLabelKey = severityLabelKey;
  protected readonly sourceLabelKey = sourceLabelKey;
  protected readonly rootCauseMethodLabelKey = rootCauseMethodLabelKey;
  protected readonly actionKindLabelKey = actionKindLabelKey;
  protected readonly actionStatusLabelKey = actionStatusLabelKey;
  protected readonly effectivenessLabelKey = effectivenessLabelKey;

  protected readonly dev = signal<DeviationDetail | null>(null);
  protected readonly analyses = signal<readonly RootCauseAnalysis[]>([]);
  protected readonly loading = signal(true);
  protected readonly orgName = computed(() => this.selectedOrg.currentOrg()?.name ?? '');

  protected readonly clauses = computed(() =>
    clauseRefsOf(this.dev()?.clauses).map((ref) => {
      const p = parseClause(ref);
      return {
        ref,
        shortKey: shortNameKey(p.framework),
        short: fixedShortName(p.framework) ?? p.framework,
        number: p.number,
      };
    }),
  );

  protected readonly history = computed(() => {
    this.language.active();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return [...(this.dev()?.events ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((event) => {
        const text = describeEvent(event, t);
        return {
          id: event.id,
          at: event.created_at,
          summary: text.summary,
          detail: text.detail,
          actor: event.actor_name ?? null,
        };
      });
  });

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation',
      entityId: this.id(),
      view: 'detail',
      title: this.dev() ? `${this.dev()!.code} ${this.dev()!.title}` : null,
    }));

    const body = this.document.body;
    body.classList.add(PRINT_CLASS);
    if (!this.document.getElementById(PRINT_STYLE_ID)) {
      const style = this.document.createElement('style');
      style.id = PRINT_STYLE_ID;
      style.textContent = PRINT_CSS;
      this.document.head.appendChild(style);
    }
    inject(DestroyRef).onDestroy(() => body.classList.remove(PRINT_CLASS));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (!orgId) {
        return;
      }
      this.loading.set(true);
      this.api.getDeviation(orgId, id).subscribe({
        next: (dev) => {
          this.dev.set(dev);
          this.loading.set(false);
        },
        error: () => {
          this.dev.set(null);
          this.loading.set(false);
        },
      });
      this.api.listRootCauses(orgId, id).subscribe({
        next: (list) => this.analyses.set(list.items),
        error: () => this.analyses.set([]),
      });
    });
  }

  protected print(): void {
    globalThis.print?.();
  }
}
