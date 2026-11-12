import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
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
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { InputDataView } from './components/input-data';
import { ManagementReviewApi } from './data/management-review-api';
import { ReviewInput, ReviewReport } from './data/management-review.models';
import {
  MR_MODULE,
  MR_SCOPE,
  assessmentKey,
  attendanceKey,
  attendeeName,
  attendeeRoleKey,
  decisionCategoryKey,
  frameworkKey,
  inputTitleKey,
  reviewStatusKey,
} from './management-review-display';

/**
 * `/management-review/reviews/:id/report`: the management review report —
 * inputs, the meeting record, outputs, the overall assessment and the signature.
 * Once signed it is the frozen snapshot with its SHA-256 checksum; before that
 * it is a live draft. Printable (the browser's print dialog saves it as PDF).
 */
@Component({
  selector: 'app-mr-review-report',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    GuideIntro,
    Alert,
    Button,
    Card,
    Icon,
    InputDataView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[900px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <a
          [routerLink]="['/management-review/reviews', id()]"
          class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'managementReview.common.backToReview' | transloco }}
        </a>
        <app-button size="sm" variant="secondary" (click)="print()">
          {{ 'managementReview.report.print' | transloco }}
        </app-button>
      </div>

      <div class="mb-4 print:hidden"><app-guide-intro [scope]="scope" page="report" /></div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-16 text-center text-[14px] text-fg-muted">
            {{ 'managementReview.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ 'managementReview.common.notFound' | transloco }}</app-alert>
        }
        @case ('ready') {
          @if (data(); as d) {
            @let rv = d.report.review;
            <article class="flex flex-col gap-4" data-testid="report">
              <header>
                <p class="font-mono text-[12.5px] text-fg-subtle">{{ rv.code }}</p>
                <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg">
                  {{ 'managementReview.report.title' | transloco: { title: rv.title } }}
                </h1>
                <p class="mt-1 text-[13px] text-fg-muted">
                  {{ statusKey(rv.status) | transloco }} ·
                  @for (f of rv.frameworks; track f; let last = $last) {
                    {{ frameworkKey(f) | transloco }}{{ last ? '' : ', ' }}
                  }
                  ·
                  {{ (rv.period_start | localDay) || '…' }} –
                  {{ (rv.period_end | localDay) || '…' }}
                </p>
                <div class="mt-3">
                  @if (d.frozen) {
                    <app-alert tone="success">{{
                      'managementReview.report.frozen' | transloco: { sha: d.sha256 ?? '-' }
                    }}</app-alert>
                  } @else {
                    <app-alert tone="info">{{
                      'managementReview.report.live' | transloco
                    }}</app-alert>
                  }
                </div>
              </header>

              <app-card>
                <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
                  {{ 'managementReview.report.inputs' | transloco }}
                </h2>
                <ol class="flex flex-col gap-3">
                  @for (i of d.report.inputs; track i.id) {
                    <li class="break-inside-avoid">
                      <h3 class="text-[13.5px] font-semibold text-fg">
                        {{ inputTitle(i) }}
                        @if (i.clause) {
                          <span class="ml-1 font-mono text-[11.5px] text-fg-subtle">{{
                            i.clause
                          }}</span>
                        }
                      </h3>
                      <div class="mt-1"><app-mr-input-data [data]="i.data" [auto]="i.auto" /></div>
                      @if (i.notes) {
                        <p class="mt-1 text-[13px] whitespace-pre-line text-fg">{{ i.notes }}</p>
                      }
                    </li>
                  }
                </ol>
                @if (rv.inputs_summary) {
                  <h3 class="mt-4 text-[13.5px] font-semibold text-fg">
                    {{ 'managementReview.fields.inputsSummary' | transloco }}
                  </h3>
                  <p class="text-[13.5px] whitespace-pre-line text-fg">{{ rv.inputs_summary }}</p>
                }
              </app-card>

              @if (d.report.meeting; as m) {
                <app-card>
                  <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
                    {{ 'managementReview.report.meeting' | transloco: { code: m.code } }}
                  </h2>
                  <p class="text-[13px] text-fg-muted">
                    {{ (m.held_at || m.scheduled_at | localDate: 'medium') || '—' }}
                    @if (m.location) {
                      · {{ m.location }}
                    }
                    · {{ 'managementReview.fields.chair' | transloco }}: {{ m.chair?.name ?? '—' }}
                  </p>
                  <h3 class="mt-3 text-[13.5px] font-semibold text-fg">
                    {{
                      'managementReview.attendees.heading'
                        | transloco: { count: m.attendees.length }
                    }}
                  </h3>
                  <ul class="text-[13px] text-fg">
                    @for (a of m.attendees; track a.id) {
                      <li>
                        {{ name(a) }} — {{ roleKey(a.role) | transloco }},
                        {{ attendanceKey(a.attendance) | transloco }}
                      </li>
                    }
                  </ul>
                  <h3 class="mt-3 text-[13.5px] font-semibold text-fg">
                    {{ 'managementReview.agenda.heading' | transloco: { count: m.agenda.length } }}
                  </h3>
                  <ol class="list-decimal pl-5 text-[13px] text-fg">
                    @for (item of m.agenda; track item.id) {
                      <li>{{ item.title }}</li>
                    }
                  </ol>
                  <h3 class="mt-3 text-[13.5px] font-semibold text-fg">
                    {{ 'managementReview.minutes.heading' | transloco }}
                  </h3>
                  @if (m.minutes) {
                    <div
                      class="cf-prose text-[13.5px] text-fg"
                      [innerHTML]="m.minutes | appMarkdown"
                    ></div>
                  } @else {
                    <p class="text-[13px] text-fg-muted">
                      {{ 'managementReview.minutes.empty' | transloco }}
                    </p>
                  }
                  @if (m.minutes_approved_at) {
                    <p class="mt-1 text-[12px] text-fg-muted">
                      {{
                        'managementReview.minutes.approvedBy'
                          | transloco
                            : {
                                name: m.minutes_approved_by?.name ?? '-',
                                date: (m.minutes_approved_at | localDate: 'medium'),
                              }
                      }}
                    </p>
                  }
                  <h3 class="mt-3 text-[13.5px] font-semibold text-fg">
                    {{
                      'managementReview.decisions.heading'
                        | transloco: { count: m.decisions.length }
                    }}
                  </h3>
                  <ul class="flex flex-col gap-1 text-[13px] text-fg">
                    @for (dec of m.decisions; track dec.id) {
                      <li>
                        <strong>{{ categoryKey(dec.category) | transloco }}:</strong> {{ dec.text }}
                        @if (dec.owner || dec.due_at) {
                          <span class="text-fg-muted">
                            ({{ dec.owner?.name ?? '—' }}
                            @if (dec.due_at) {
                              · {{ dec.due_at | localDay }}
                            }
                            )
                          </span>
                        }
                      </li>
                    }
                  </ul>
                </app-card>
              }

              <app-card>
                <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
                  {{ 'managementReview.detail.outputsHeading' | transloco }}
                </h2>
                <dl class="flex flex-col gap-3 text-[13.5px]">
                  @for (f of outputFields; track f.key) {
                    <div>
                      <dt class="text-[12px] font-semibold text-fg-muted">
                        {{ f.label | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">
                        {{ rv[f.key] || ('managementReview.common.notSet' | transloco) }}
                      </dd>
                    </div>
                  }
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'managementReview.fields.systemAssessment' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        rv.system_assessment
                          ? (assessmentKey(rv.system_assessment) | transloco)
                          : ('managementReview.common.notSet' | transloco)
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
                  {{ 'managementReview.sign.heading' | transloco }}
                </h2>
                @if (d.report.signature; as s) {
                  <p class="text-[13.5px] text-fg">
                    {{
                      'managementReview.report.signedLine'
                        | transloco
                          : {
                              name: s.signature_name || s.signed_by?.name || '-',
                              date: (s.signed_at | localDate: 'medium'),
                            }
                    }}
                  </p>
                  @if (s.statement) {
                    <p class="mt-1 text-[13px] whitespace-pre-line text-fg-muted">
                      {{ s.statement }}
                    </p>
                  }
                } @else {
                  <p class="text-[13.5px] text-fg-muted">
                    {{ 'managementReview.report.notSigned' | transloco }}
                  </p>
                }
                <p class="mt-3 text-[11.5px] text-fg-subtle">
                  {{
                    'managementReview.report.generatedAt'
                      | transloco: { date: (d.report.generated_at | localDate: 'medium') }
                  }}
                </p>
              </app-card>
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
  protected readonly scope = MR_SCOPE;
  protected readonly statusKey = reviewStatusKey;
  protected readonly frameworkKey = frameworkKey;
  protected readonly assessmentKey = assessmentKey;
  protected readonly roleKey = attendeeRoleKey;
  protected readonly attendanceKey = attendanceKey;
  protected readonly categoryKey = decisionCategoryKey;
  protected readonly name = attendeeName;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<ReviewReport | null>(null);

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
