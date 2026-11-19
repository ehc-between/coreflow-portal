import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { fixedShortName } from '../../shared/requirement-links/requirement-label';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ClauseRef } from './components/clause-ref';
import { InputDataView } from './components/input-data';
import { ManagementReviewApi } from './data/management-review-api';
import {
  AttendanceSummary,
  Attendee,
  CRITERIA,
  ReportRequirement,
  ReviewInput,
  ReviewReport,
} from './data/management-review.models';
import { OutputsPanel } from '../../shared/outputs';
import {
  MR_MODULE,
  MR_SCOPE,
  actionStatusKey,
  assessmentKey,
  attendanceKey,
  attendeeName,
  attendeeRoleKey,
  criterionKey,
  criterionRatingKey,
  decisionCategoryKey,
  frameworkKey,
  inputClause,
  inputTitleKey,
  mrCrumbs,
  reviewStatusKey,
  toneValue,
} from './management-review-display';

/** "ISO 9001 · 9.3, ISO 27001 · 9.3": the requirements a signed review documents. */
export function requirementsLine(
  items: readonly ReportRequirement[],
  t: (key: string) => string,
): string {
  return items
    .map((r) => {
      const short = fixedShortName(r.framework) ?? t(frameworkKey(r.framework));
      return `${short} · ${r.numbers.join(', ')}`;
    })
    .join('; ');
}

/** Attendance of a report meeting: from the summary, else counted from the attendees. */
export function attendanceOf(
  summary: AttendanceSummary | null | undefined,
  attendees: readonly Attendee[],
): AttendanceSummary {
  if (summary) {
    return summary;
  }
  const count = (fn: (a: Attendee) => boolean) => attendees.filter(fn).length;
  return {
    total: attendees.length,
    present: count((a) => a.attendance === 'present'),
    absent: count((a) => a.attendance === 'absent'),
    excused: count((a) => a.attendance === 'excused'),
    invited: count((a) => a.attendance === 'invited'),
    top_management_total: count((a) => !!a.top_management),
    top_management_present: count((a) => !!a.top_management && a.attendance === 'present'),
  };
}

/**
 * `/management-review/reviews/:id/report`: the management review report — the
 * organisation, the requirements it documents (ISO 9.3 per standard), the
 * inputs, the meeting (attendance with top management, agenda, minutes,
 * decisions), the follow-up actions with owner, due date and status, the
 * outputs and the 9.3 conclusions, and the signature. Once signed it is the
 * frozen snapshot with its SHA-256 checksum; before that it is a live draft.
 * Printable (the browser's print dialog saves it as PDF).
 */
@Component({
  selector: 'app-mr-review-report',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    LoadingState,
    PageHeader,
    StatusBadge,
    ClauseRef,
    InputDataView,
    OutputsPanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[900px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7 print:px-0 print:pt-0">
      <div class="print:hidden">
        <app-page-header
          titleKey="managementReview.report.pageTitle"
          [breadcrumbs]="crumbs()"
          [backLink]="['/management-review/reviews', id()]"
          backLabelKey="managementReview.common.backToReview"
        >
          <app-button primary variant="secondary" (click)="print()">
            {{ 'managementReview.report.print' | transloco }}
          </app-button>
        </app-page-header>
        <app-outputs-panel
          class="mb-4"
          entityType="management_review"
          [entityId]="id()"
          data-testid="report-snapshots"
        />
        <app-help-strip [scope]="scope" page="report" />
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state
            titleKey="managementReview.common.notFoundTitle"
            bodyKey="managementReview.common.notFound"
            (retry)="reload()"
          />
        }
        @case ('ready') {
          @if (data(); as d) {
            @let rv = d.report.review;
            <article class="flex flex-col gap-4" data-testid="report">
              <header>
                @if (d.report.organization?.name; as org) {
                  <p class="text-ui font-semibold text-fg-muted" data-testid="report-org">
                    {{ org }}
                  </p>
                }
                <h1 class="font-display text-page font-bold text-fg">
                  {{ 'managementReview.report.title' | transloco: { title: rv.title } }}
                </h1>
                <p class="mt-1 text-ui text-fg-muted">
                  <span class="font-mono">{{ rv.code }}</span> ·
                  {{ statusKey(rv.status) | transloco }} ·
                  @for (f of rv.frameworks; track f; let last = $last) {
                    {{ frameworkKey(f) | transloco }}{{ last ? '' : ', ' }}
                  }
                  ·
                  {{ 'managementReview.report.period' | transloco }}
                  {{ (rv.period_start | localDay) || '…' }} –
                  {{ (rv.period_end | localDay) || '…' }}
                </p>
                @if (requirements(); as reqs) {
                  <p class="mt-1 text-ui text-fg" data-testid="report-requirements">
                    <span class="font-semibold">{{
                      'managementReview.report.satisfies' | transloco
                    }}</span>
                    {{ reqs }}
                  </p>
                }
                <div class="mt-3">
                  @if (d.frozen) {
                    <app-alert tone="success">{{
                      'managementReview.report.frozen' | transloco: { sha: d.sha256 ?? '—' }
                    }}</app-alert>
                  } @else {
                    <app-alert tone="info">{{
                      'managementReview.report.live' | transloco
                    }}</app-alert>
                  }
                </div>
              </header>

              <app-card>
                <h2 class="mb-2 font-display text-section font-bold text-fg">
                  {{ 'managementReview.report.inputs' | transloco }}
                </h2>
                <ol class="flex flex-col gap-4">
                  @for (i of d.report.inputs; track i.id) {
                    <li class="break-inside-avoid">
                      <h3
                        class="flex flex-wrap items-baseline gap-x-2 text-body font-semibold text-fg"
                      >
                        {{ inputTitle(i) }}
                        @if (clause(i); as c) {
                          <app-mr-clause-ref
                            [ref]="c.ref"
                            [item]="c.item"
                            [frameworks]="rv.frameworks"
                          />
                        }
                        @if (i.not_relevant) {
                          <span class="text-meta font-normal text-fg-muted">{{
                            'managementReview.inputs.notRelevant' | transloco
                          }}</span>
                        }
                      </h3>
                      <div class="mt-1"><app-mr-input-data [data]="i.data" [auto]="i.auto" /></div>
                      @if (i.notes) {
                        <p class="mt-1 text-ui whitespace-pre-line text-fg">{{ i.notes }}</p>
                      }
                      @if (i.not_relevant && i.not_relevant_reason) {
                        <p class="mt-1 text-ui text-fg-muted">
                          {{ 'managementReview.inputs.notRelevantBecause' | transloco }}
                          {{ i.not_relevant_reason }}
                        </p>
                      }
                    </li>
                  }
                </ol>
                @if (rv.inputs_summary) {
                  <h3 class="mt-4 text-body font-semibold text-fg">
                    {{ 'managementReview.fields.inputsSummary' | transloco }}
                  </h3>
                  <p class="text-body whitespace-pre-line text-fg">{{ rv.inputs_summary }}</p>
                }
              </app-card>

              @if (d.report.meeting; as m) {
                @let at = attendance();
                <app-card>
                  <h2 class="mb-2 font-display text-section font-bold text-fg">
                    {{ 'managementReview.report.meeting' | transloco: { code: m.code } }}
                  </h2>
                  <p class="text-ui text-fg-muted">
                    {{ (m.held_at || m.scheduled_at | localDate) || '—' }}
                    @if (m.location) {
                      · {{ m.location }}
                    }
                    · {{ 'managementReview.fields.chair' | transloco }}: {{ m.chair?.name ?? '—' }}
                  </p>
                  @if (at) {
                    <p class="mt-1 text-ui text-fg" data-testid="report-attendance">
                      {{
                        'managementReview.attendees.presentOf'
                          | transloco: { present: at.present, total: at.total }
                      }}
                      ·
                      {{
                        'managementReview.attendees.topManagementPresent'
                          | transloco
                            : {
                                present: at.top_management_present,
                                total: at.top_management_total,
                              }
                      }}
                    </p>
                  }
                  <h3 class="mt-3 text-body font-semibold text-fg">
                    {{
                      'managementReview.attendees.heading'
                        | transloco: { count: m.attendees.length }
                    }}
                  </h3>
                  <ul class="text-ui text-fg">
                    @for (a of m.attendees; track a.id) {
                      <li>
                        {{ name(a) }} — {{ roleKey(a.role) | transloco }},
                        {{ attendanceKey(a.attendance) | transloco }}
                        @if (a.top_management) {
                          ({{ 'managementReview.attendees.topManagement' | transloco }})
                        }
                      </li>
                    }
                  </ul>
                  <h3 class="mt-3 text-body font-semibold text-fg">
                    {{ 'managementReview.agenda.heading' | transloco: { count: m.agenda.length } }}
                  </h3>
                  <ol class="list-decimal pl-5 text-ui text-fg">
                    @for (item of m.agenda; track item.id) {
                      <li>{{ item.title }}</li>
                    }
                  </ol>
                  <h3 class="mt-3 text-body font-semibold text-fg">
                    {{ 'managementReview.minutes.heading' | transloco }}
                  </h3>
                  @if (m.minutes) {
                    <div
                      class="cf-prose text-body text-fg"
                      [innerHTML]="m.minutes | appMarkdown"
                    ></div>
                  } @else {
                    <p class="text-ui text-fg-muted">
                      {{ 'managementReview.minutes.empty' | transloco }}
                    </p>
                  }
                  @if (m.minutes_approved_at) {
                    <p class="mt-1 text-meta text-fg-muted">
                      {{
                        'managementReview.minutes.approvedBy'
                          | transloco
                            : {
                                name: m.minutes_approved_by?.name ?? '—',
                                date: (m.minutes_approved_at | localDate),
                              }
                      }}
                    </p>
                  }
                  <h3 class="mt-3 text-body font-semibold text-fg">
                    {{
                      'managementReview.decisions.heading'
                        | transloco: { count: m.decisions.length }
                    }}
                  </h3>
                  <ul class="flex flex-col gap-1 text-ui text-fg">
                    @for (dec of m.decisions; track dec.id) {
                      <li>
                        <strong>{{ categoryKey(dec.category) | transloco }}:</strong> {{ dec.text }}
                      </li>
                    }
                  </ul>
                </app-card>
              }

              @if (d.report.actions?.length) {
                <app-card>
                  <h2 class="mb-2 font-display text-section font-bold text-fg">
                    {{ 'managementReview.report.actions' | transloco }}
                  </h2>
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-ui" data-testid="report-actions">
                      <thead class="text-meta text-fg-muted">
                        <tr class="border-b border-border">
                          <th scope="col" class="py-1.5 pr-3 font-semibold">
                            {{ 'managementReview.report.action' | transloco }}
                          </th>
                          <th scope="col" class="py-1.5 pr-3 font-semibold">
                            {{ 'managementReview.decisions.owner' | transloco }}
                          </th>
                          <th scope="col" class="py-1.5 pr-3 font-semibold">
                            {{ 'managementReview.decisions.due' | transloco }}
                          </th>
                          <th scope="col" class="py-1.5 font-semibold">
                            {{ 'managementReview.fields.status' | transloco }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (a of d.report.actions; track a.decision_id) {
                          <tr class="border-b border-border align-top">
                            <td class="py-2 pr-3 text-fg">{{ a.text }}</td>
                            <td class="py-2 pr-3 text-fg-muted">{{ a.owner?.name ?? '—' }}</td>
                            <td class="py-2 pr-3 whitespace-nowrap text-fg-muted">
                              {{ (a.due_at | localDay) || '—' }}
                            </td>
                            <td class="py-2">
                              <app-status-badge
                                meaning="lifecycle"
                                [value]="
                                  a.overdue && a.status !== 'done' ? 'overdue' : tone(a.status)
                                "
                                [labelKey]="
                                  a.overdue && a.status !== 'done'
                                    ? actionStatusKey('overdue')
                                    : actionStatusKey(a.status)
                                "
                              />
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </app-card>
              }

              <app-card>
                <h2 class="mb-2 font-display text-section font-bold text-fg">
                  {{ 'managementReview.detail.outputsHeading' | transloco }}
                </h2>
                <dl class="flex flex-col gap-3 text-body">
                  @for (f of outputFields; track f.key) {
                    <div>
                      <dt class="text-meta font-semibold text-fg-muted">
                        {{ f.label | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">
                        {{ rv[f.key] || ('common.empty.notSet' | transloco) }}
                      </dd>
                    </div>
                  }
                  @if (rv.assessment_criteria; as crit) {
                    @for (c of criteria; track c) {
                      @if (crit.items[c]; as v) {
                        @if (v.rating || crit.required.includes(c)) {
                          <div>
                            <dt class="text-meta font-semibold text-fg-muted">
                              {{ criterionKey(c) | transloco }}
                            </dt>
                            <dd class="text-fg">
                              {{
                                v.rating
                                  ? (ratingKey(v.rating) | transloco)
                                  : ('common.empty.notSet' | transloco)
                              }}
                              @if (v.note) {
                                — {{ v.note }}
                              }
                            </dd>
                          </div>
                        }
                      }
                    }
                  }
                  <div>
                    <dt class="text-meta font-semibold text-fg-muted">
                      {{ 'managementReview.fields.systemAssessment' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        rv.system_assessment
                          ? (assessmentKey(rv.system_assessment) | transloco)
                          : ('common.empty.notSet' | transloco)
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-2 font-display text-section font-bold text-fg">
                  {{ 'managementReview.sign.heading' | transloco }}
                </h2>
                @if (d.report.signature; as s) {
                  <p class="text-body text-fg">
                    {{
                      'managementReview.report.signedLine'
                        | transloco
                          : {
                              name: s.signature_name || s.signed_by?.name || '—',
                              date: (s.signed_at | localDate),
                            }
                    }}
                  </p>
                  @if (s.statement) {
                    <p class="mt-1 text-ui whitespace-pre-line text-fg-muted">
                      {{ s.statement }}
                    </p>
                  }
                } @else {
                  <p class="text-body text-fg-muted">
                    {{ 'managementReview.report.notSigned' | transloco }}
                  </p>
                }
                <p class="mt-3 text-meta text-fg-subtle">
                  {{
                    'managementReview.report.generatedAt'
                      | transloco: { date: (d.report.generated_at | localDate) }
                  }}
                </p>
              </app-card>
              <p class="text-meta text-fg-subtle print:hidden">
                <a
                  [routerLink]="['/management-review/reviews', id()]"
                  class="font-semibold text-accent hover:underline"
                  >{{ 'managementReview.common.backToReview' | transloco }}</a
                >
              </p>
            </article>
          }
        }
      }
    </div>
  `,
})
export class ReviewReportPage {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly document = inject(DOCUMENT);

  readonly id = input.required<string>();

  protected readonly outputFields = [
    { key: 'conclusions', label: 'managementReview.fields.conclusions' },
    { key: 'improvement_opportunities', label: 'managementReview.fields.improvementOpportunities' },
    { key: 'change_needs', label: 'managementReview.fields.changeNeeds' },
    { key: 'resource_needs', label: 'managementReview.fields.resourceNeeds' },
  ] as const;
  protected readonly criteria = CRITERIA;
  protected readonly scope = MR_SCOPE;
  protected readonly statusKey = reviewStatusKey;
  protected readonly frameworkKey = frameworkKey;
  protected readonly assessmentKey = assessmentKey;
  protected readonly criterionKey = criterionKey;
  protected readonly ratingKey = criterionRatingKey;
  protected readonly roleKey = attendeeRoleKey;
  protected readonly attendanceKey = attendanceKey;
  protected readonly categoryKey = decisionCategoryKey;
  protected readonly actionStatusKey = actionStatusKey;
  protected readonly tone = toneValue;
  protected readonly name = attendeeName;
  protected readonly clause = inputClause;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<ReviewReport | null>(null);

  protected readonly crumbs = computed(() => {
    const rv = this.data()?.report.review;
    return mrCrumbs(
      { labelKey: 'managementReview.nav.reviews', link: '/management-review/reviews' },
      ...(rv ? [{ label: rv.code, link: ['/management-review/reviews', this.id()] }] : []),
      { labelKey: 'managementReview.report.pageTitle' },
    );
  });
  protected readonly requirements = computed(() => {
    const items = this.data()?.report.requirements ?? [];
    return items.length ? requirementsLine(items, (k) => this.language.translate(k)) : null;
  });
  protected readonly attendance = computed(() => {
    const m = this.data()?.report.meeting;
    return m ? attendanceOf(m.attendance, m.attendees) : null;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: MR_MODULE,
      entityType: 'management_review',
      entityId: this.id(),
      view: 'other',
      title: this.data()?.report.review.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected inputTitle(i: ReviewInput): string {
    const key = inputTitleKey(i);
    return key ? this.language.translate(key) : (i.title ?? '');
  }

  protected print(): void {
    this.document.defaultView?.print();
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.report(orgId, id).subscribe({
      next: (d) => {
        this.data.set(d);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
