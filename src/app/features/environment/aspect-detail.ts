import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { AskPanelService } from '../ask/ask-panel.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementLink } from '../../core/standards/standards.models';
import { Term } from '../../shared/guidance/term';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { LinkPicker } from '../../shared/kit/link-picker';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EnvironmentApi } from './data/environment-api';
import {
  Aspect,
  ENTITY_ASPECT,
  FLOWS,
  LinkedRecord,
  ReviewIn,
  ScoringMethod,
} from './data/environment.models';
import { criterionLabel, levelText } from './data/environment-display';
import { environmentErrorKey } from './data/environment-errors';
import {
  ENV_CRUMBS,
  ENV_FRAMEWORKS,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  departmentName,
  injectEnvPermissions,
} from './environment-shared';
import { EnvReviewDialog } from './review-dialog';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> i18n key (for the revisions tab). */
export const ASPECT_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'environment.fields.code',
  activity: 'environment.fields.activity',
  aspect: 'environment.fields.aspect',
  impact: 'environment.fields.impact',
  impact_type: 'environment.fields.impactType',
  condition: 'environment.fields.condition',
  lifecycle_stages: 'environment.fields.lifecycleStages',
  control_level: 'environment.fields.controlLevel',
  site: 'environment.fields.site',
  scores: 'environment.fields.scores',
  score: 'environment.fields.score',
  significant: 'environment.fields.significant',
  significance_override: 'environment.fields.override',
  override_reason: 'environment.fields.overrideReason',
  legal_requirement: 'environment.fields.legalRequirement',
  operational_controls: 'environment.fields.operationalControls',
  status: 'environment.fields.status',
  owner_user_id: 'environment.fields.owner',
  department_id: 'environment.fields.department',
  review_due_at: 'environment.fields.reviewDue',
  last_reviewed_at: 'environment.fields.lastReviewed',
  process_id: 'environment.fields.process',
};

/** What needs attention on an aspect, most important first. */
export type AspectNotice = 'controls' | 'plan' | 'review' | 'unscored';

export function aspectNotices(a: Aspect): AspectNotice[] {
  const out: AspectNotice[] = [];
  if (a.controls_missing) {
    out.push('controls');
  }
  if (a.needs_emergency_plan) {
    out.push('plan');
  }
  if (a.review_overdue) {
    out.push('review');
  }
  if (!a.evaluated && a.status !== 'retired') {
    out.push('unscored');
  }
  return out;
}

/** The status sentence of an aspect: significance, or why it has none yet. */
export type AspectStatusKey = 'significant' | 'notSignificant' | 'unscored' | 'retired';

export function aspectStatusKey(a: Aspect): AspectStatusKey {
  if (a.status === 'retired') {
    return 'retired';
  }
  if (a.significant) {
    return 'significant';
  }
  return a.evaluated ? 'notSignificant' : 'unscored';
}

/** Significant is open work (warn, never red); not significant and retired are neutral. */
export const ASPECT_STATUS_TONE: Readonly<Record<AspectStatusKey, StatusLineTone>> = {
  significant: 'warn',
  notSignificant: 'neutral',
  unscored: 'warn',
  retired: 'neutral',
};

/** The actions behind each notice ("Oppfølging", docs/ux-guide.md §2.7). */
export interface AspectMissingActions {
  readonly editLink: readonly unknown[];
  readonly linkControl: () => void;
  readonly makePlan: () => void;
  readonly review: () => void;
}

/** What an aspect still needs, as actionable lines of the "Oppfølging" card. */
export function aspectMissing(a: Aspect, actions: AspectMissingActions): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  for (const n of aspectNotices(a)) {
    switch (n) {
      case 'review':
        items.push({
          key: n,
          labelKey: 'environment.aspect.missing.review',
          action: actions.review,
        });
        break;
      case 'controls':
        items.push({
          key: n,
          labelKey: 'environment.aspect.missing.controls',
          action: actions.linkControl,
        });
        break;
      case 'plan':
        items.push({
          key: n,
          labelKey: 'environment.aspect.missing.plan',
          action: actions.makePlan,
        });
        break;
      case 'unscored':
        items.push({
          key: n,
          labelKey: 'environment.aspect.missing.unscored',
          link: actions.editLink,
        });
        break;
    }
  }
  if (a.legal_requirement && !(a.obligations ?? []).length) {
    items.push({
      key: 'obligations',
      labelKey: 'environment.aspect.missing.obligations',
      link: actions.editLink,
      fragment: 'obligations',
    });
  }
  if (!a.owner_user_id && a.status !== 'retired') {
    items.push({
      key: 'owner',
      labelKey: 'environment.aspect.missing.owner',
      link: actions.editLink,
    });
  }
  return items;
}

/** A linked record as an entity-chip reference. */
export function chipRef(r: LinkedRecord) {
  return {
    entity_type: r.entity_type,
    entity_id: r.id,
    title: r.title,
    code: r.code,
    url: r.url ?? null,
    status: r.status ?? null,
  };
}

/**
 * An environmental aspect (`/environment/aspects/:id`), built on the detail-page
 * anatomy (docs/ux-guide.md §2.7). Header: code · Miljøaspekt · status; Edit is the
 * primary action, "Merk som gjennomgått" secondary, Delete under "Mer", the
 * assistant in "Spør KI". Hovedinformasjon: whether it is significant (with the
 * score), what we do, what it does to the environment, how we keep it under control
 * (text and linked procedures, processes …, 8.1) and the laws that apply (6.1.3).
 * Details: the classification and how the significance was scored. Oppfølging:
 * what is missing (controls, emergency plan, review, score, owner), the
 * requirements, the connections with the emergency plans (8.2), and ownership.
 */
@Component({
  selector: 'app-env-aspect-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    Term,
    WhyItMatters,
    EntityChip,
    LinkPicker,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    SupportsRequirements,
    EntityTasks,
    Button,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    EnvReviewDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="environment.common.notFoundTitle"
            [bodyKey]="errorKey()"
            (retry)="reload()"
          />
          <p class="mt-3 text-center">
            <a
              routerLink="/environment/aspects"
              class="text-ui font-semibold text-accent hover:underline"
              >{{ 'environment.aspects.back' | transloco }}</a
            >
          </p>
        </div>
      }
      @default {
        @if (aspect(); as a) {
          <app-record-detail-layout
            [anatomy]="true"
            [entityType]="entityType"
            [entityId]="a.id"
            [title]="a.aspect"
            [breadcrumbs]="breadcrumbs()"
            [settingsLink]="perms.settingsLink()"
            [tabs]="tabs"
            [canEdit]="perms.write()"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ a.code }}</span>
              <span aria-hidden="true">·</span>
              <app-term key="environmental-aspect" scope="environment">{{
                'environment.aspect.one' | transloco
              }}</app-term>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="a.status"
                [labelKey]="'environment.status.' + a.status"
                data-testid="aspect-status"
              />
              @if (a.review_overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="environment.aspect.reviewOverdue"
                />
              }
            </ng-container>

            @if (perms.write()) {
              <a primary [routerLink]="editLink()" tabindex="-1" data-testid="aspect-edit">
                <app-button>{{ 'environment.common.edit' | transloco }}</app-button>
              </a>
            }
            @if (perms.write()) {
              <app-button
                secondary
                variant="secondary"
                (click)="reviewing.set(true)"
                data-testid="aspect-review"
              >
                <app-icon name="checkcircle" [size]="14" />
                {{ 'environment.review.action' | transloco }}
              </app-button>
            }
            @if (perms.manage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="aspect-delete"
              >
                {{ 'environment.common.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summariseAspect')">
              <app-icon name="spark" [size]="15" />
              {{ 'environment.ask.summariseLabel' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('explainSignificance')">
              <app-icon name="spark" [size]="15" />
              {{ 'environment.ask.explainSignificanceLabel' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('controlsField')">
              <app-icon name="spark" [size]="15" />
              {{ 'environment.ask.controlsLabel' | transloco }}
            </button>

            <app-help-strip
              help
              scope="environment"
              page="aspectDetail"
              lesson="significance"
              [subject]="a.aspect"
            />

            <app-record-lead record-lead [fillLink]="perms.write() ? editLink() : null">
              <app-record-status-line status [tone]="statusTone()">
                <span data-testid="aspect-significance">{{
                  'environment.aspect.statusLine.' + statusKey() | transloco
                }}</span>
                @if (a.score !== null && a.status !== 'retired') {
                  <span class="block text-ui font-normal text-fg-muted" data-testid="aspect-score">
                    @if (threshold() !== null) {
                      {{
                        'environment.aspect.scoreLine'
                          | transloco
                            : {
                                score: (a.score | localNumber: '1.0-2'),
                                max: (maxScore() | localNumber: '1.0-2'),
                                threshold: (threshold() | localNumber: '1.0-2'),
                              }
                      }}
                    } @else {
                      {{
                        'environment.aspect.scoreShort'
                          | transloco: { score: (a.score | localNumber: '1.0-2') }
                      }}
                    }
                  </span>
                }
              </app-record-status-line>
              <app-field-item size="lead" labelKey="environment.aspect.lead.activity" [wide]="true">
                <span class="flex flex-col items-start gap-1.5">
                  <span>{{ a.activity }}</span>
                  @if (a.process; as p) {
                    <app-entity-chip [ref]="ref(p)" [statusText]="true" />
                  }
                </span>
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="environment.aspect.lead.impact"
                [value]="a.impact"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item
                size="lead"
                labelKey="environment.aspect.lead.controls"
                [wide]="true"
                data-testid="aspect-controls"
              >
                @if (a.operational_controls || controls().length) {
                  @if (a.operational_controls) {
                    <span class="block whitespace-pre-line">{{ a.operational_controls }}</span>
                  }
                  @if (controls().length) {
                    <ul class="mt-2 flex flex-col gap-1.5" data-testid="aspect-linked-controls">
                      @for (c of controls(); track c.id) {
                        <li><app-entity-chip [ref]="ref(c)" [statusText]="true" /></li>
                      }
                    </ul>
                  }
                  @if (perms.write()) {
                    <button
                      type="button"
                      class="mt-2 inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline"
                      (click)="linking.set(true)"
                      data-testid="aspect-link-control"
                    >
                      <app-icon name="link" [size]="13" />
                      {{ 'environment.aspect.linkControlMore' | transloco }}
                    </button>
                  }
                }
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="environment.aspect.lead.obligations"
                [wide]="true"
                data-testid="aspect-obligations"
              >
                @if (obligations().length) {
                  <ul class="flex flex-col gap-1.5">
                    @for (o of obligations(); track o.id) {
                      <li><app-entity-chip [ref]="ref(o)" [statusText]="true" /></li>
                    }
                  </ul>
                }
              </app-field-item>
            </app-record-lead>

            <app-record-details [columns]="3" [fillLink]="perms.write() ? editLink() : null">
              <app-field-item
                labelKey="environment.aspect.details.impactType"
                [value]="'environment.impactTypes.' + a.impact_type | transloco"
              />
              <app-field-item
                labelKey="environment.aspect.details.condition"
                [value]="'environment.conditions.' + a.condition | transloco"
              />
              <app-field-item
                labelKey="environment.aspect.details.controlLevel"
                [value]="'environment.controlLevels.' + a.control_level | transloco"
              />
              <app-field-item labelKey="environment.aspect.details.site" [value]="a.site" />
              <app-field-item labelKey="environment.fields.lifecycleStages" [wide]="true">
                @if (a.lifecycle_stages.length) {
                  <span class="flex flex-wrap gap-1.5">
                    @for (s of a.lifecycle_stages; track s) {
                      <app-status-badge
                        meaning="lifecycle"
                        value="draft"
                        [labelKey]="'environment.stages.' + s"
                      />
                    }
                  </span>
                }
              </app-field-item>

              <section
                after
                class="mt-5 border-t border-border pt-4"
                data-testid="aspect-evaluation"
                aria-labelledby="env-aspect-eval-h"
              >
                <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 id="env-aspect-eval-h" class="font-display text-ui font-bold text-fg">
                    <app-term key="significant-aspect" scope="environment">{{
                      'environment.aspect.sections.evaluateHow' | transloco
                    }}</app-term>
                  </h3>
                  @if (perms.manage()) {
                    <a
                      routerLink="/settings/modules/environment"
                      class="text-meta font-semibold text-accent hover:underline"
                      >{{ 'environment.aspect.seeMethod' | transloco }}</a
                    >
                  }
                </div>
                @if (a.score === null) {
                  <p class="text-ui text-fg-muted">
                    {{ 'environment.aspect.scoreIncomplete' | transloco }}
                  </p>
                }
                @if (method(); as m) {
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-ui" data-testid="aspect-scores">
                      <thead class="text-meta text-fg-subtle">
                        <tr>
                          <th scope="col" class="py-1.5 pr-3 font-semibold">
                            {{ 'environment.aspect.criterion' | transloco }}
                          </th>
                          <th scope="col" class="py-1.5 pr-3 text-right font-semibold">
                            {{
                              'environment.aspect.scoreColumn'
                                | transloco: { min: m.scale_min, max: m.scale_max }
                            }}
                          </th>
                          <th scope="col" class="hidden py-1.5 font-semibold sm:table-cell">
                            {{ 'environment.aspect.meaning' | transloco }}
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border">
                        @for (c of m.criteria; track c.key) {
                          <tr class="align-top">
                            <td class="py-2 pr-3 text-fg">{{ label(c) }}</td>
                            <td class="py-2 pr-3 text-right font-semibold text-fg">
                              {{ a.scores[c.key] ?? '–' }}
                            </td>
                            <td class="hidden py-2 text-fg-muted sm:table-cell">
                              {{ a.scores[c.key] !== undefined ? level(c, a.scores[c.key]) : '' }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
                @if (a.significance_reasons.length) {
                  <h4 class="mt-3 mb-1 text-meta font-semibold text-fg-muted">
                    {{ 'environment.aspect.whySignificant' | transloco }}
                  </h4>
                  <ul class="flex flex-col gap-1 text-ui text-fg">
                    @for (r of a.significance_reasons; track r) {
                      <li class="flex items-center gap-1.5">
                        <app-icon name="check" [size]="13" class="text-accent" />
                        {{ 'environment.reasons.' + r | transloco }}
                      </li>
                    }
                  </ul>
                }
                @if (a.significance_override !== null) {
                  <p
                    class="mt-3 rounded-tile border border-info/30 bg-info-soft px-3 py-2 text-ui text-info-ink"
                  >
                    {{
                      'environment.aspect.overrideNotice'
                        | transloco
                          : {
                              computed:
                                ((a.computed_significant
                                  ? 'environment.aspect.significant'
                                  : 'environment.aspect.notSignificant'
                                ) | transloco),
                              reason: a.override_reason ?? '',
                            }
                    }}
                  </p>
                }
              </section>
            </app-record-details>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="a.id"
                [canCreate]="perms.write()"
                [entityLabel]="a.code + ' ' + a.aspect"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              [entityType]="entityType"
              [entityId]="a.id"
              [canEdit]="perms.write()"
              [frameworks]="frameworks"
              (linksChange)="onLinks($event)"
            />

            @if (a.condition !== 'normal' || plans().length) {
              <div follow-up-connections class="mt-4" data-testid="aspect-plans">
                <h3 class="mb-1.5 text-meta font-semibold text-fg-muted">
                  {{ 'environment.aspect.sections.preparedness' | transloco }}
                </h3>
                @if (plans().length) {
                  <ul class="flex flex-col gap-1.5">
                    @for (p of plans(); track p.id) {
                      <li>
                        <app-entity-chip [ref]="ref(p)" [statusText]="true" [stacked]="true" />
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="text-meta text-fg-muted">
                    {{ 'environment.aspect.noPlan' | transloco }}
                  </p>
                }
              </div>
            }

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="environment.fields.owner"
                [value]="a.owner_name"
              />
              <app-field-item
                layout="inline"
                labelKey="environment.fields.department"
                [value]="department()"
              />
              <app-field-item
                layout="inline"
                labelKey="environment.fields.reviewDue"
                [keepEmpty]="true"
                emptyKey="kit.detail.meta.notPlanned"
                emptyActionKey="kit.detail.meta.plan"
                [emptyLink]="perms.write() ? editLink() : null"
              >
                @if (a.review_due_at) {
                  <span [class.text-warn-ink]="a.review_overdue">{{
                    a.review_due_at | localDay
                  }}</span>
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="environment.fields.lastReviewed"
                [value]="a.last_reviewed_at ? (a.last_reviewed_at | localDay) : null"
              />
              <app-field-item
                layout="inline"
                labelKey="environment.common.updated"
                [value]="a.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="environment" page="aspectDetail" />
            </div>
          </app-record-detail-layout>

          @if (linking()) {
            <app-link-picker
              [open]="true"
              [sourceType]="entityType"
              [sourceId]="a.id"
              [linkTypes]="controlLinkTypes"
              (linked)="onLinked()"
              (closed)="linking.set(false)"
            />
          }
          <app-env-review-dialog
            [open]="reviewing()"
            [busy]="acting()"
            (confirmed)="review($event)"
            (cancelled)="reviewing.set(false)"
          />
          <app-confirm-dialog
            [open]="deleting()"
            [title]="'environment.aspect.deleteTitle' | transloco"
            [message]="'environment.aspect.deleteMessage' | transloco: { code: a.code }"
            [confirmLabel]="'environment.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class AspectDetail {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly directory = inject(AssigneeOptionsService);
  private readonly ask = inject(AskPanelService);
  protected readonly flows = inject(CreateFlowService);

  /** Route param (component input binding): follows navigation between aspects. */
  readonly id = input.required<string>();

  protected readonly perms = injectEnvPermissions();
  protected readonly entityType = ENTITY_ASPECT;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = ASPECT_FIELD_LABELS;
  protected readonly frameworks = ENV_FRAMEWORKS;
  protected readonly controlLinkTypes: readonly string[] = ['mitigates', 'relates_to'];
  protected readonly planFlow = FLOWS.aspectToPlan;
  protected readonly ref = chipRef;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.errors.notFound');
  protected readonly aspect = signal<Aspect | null>(null);
  protected readonly method = signal<ScoringMethod | null>(null);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly reviewing = signal(false);
  protected readonly linking = signal(false);
  protected readonly confirmedRefs = signal<readonly string[]>([]);

  protected readonly breadcrumbs = computed(() => [
    ENV_ROOT_CRUMB,
    ENV_CRUMBS.aspects,
    { label: this.aspect()?.code ?? '' },
  ]);
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/environment/aspects',
    this.id(),
    'edit',
  ]);
  protected readonly statusKey = computed(() => {
    const a = this.aspect();
    return a ? aspectStatusKey(a) : ('unscored' as const);
  });
  protected readonly statusTone = computed(() => ASPECT_STATUS_TONE[this.statusKey()]);
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const a = this.aspect();
    if (!a || !this.perms.write()) {
      return [];
    }
    return aspectMissing(a, {
      editLink: this.editLink(),
      linkControl: () => this.linking.set(true),
      makePlan: () => this.startFlow(this.planFlow),
      review: () => this.reviewing.set(true),
    });
  });
  protected readonly obligations = computed(() => this.aspect()?.obligations ?? []);
  protected readonly controls = computed(() => this.aspect()?.controls ?? []);
  protected readonly plans = computed(() => this.aspect()?.emergency_plans ?? []);
  protected readonly department = computed(() =>
    departmentName(this.directory, this.aspect()?.department_id),
  );
  protected readonly threshold = computed(
    () => this.aspect()?.threshold ?? this.method()?.threshold ?? null,
  );
  protected readonly maxScore = computed(
    () => this.aspect()?.max_score ?? this.method()?.max_score ?? null,
  );

  private request = new Subscription();
  private methodRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.methodRequest.unsubscribe();
    });
    providePageContext(() => {
      const a = this.aspect();
      return {
        module: ENV_MODULE,
        entityType: ENTITY_ASPECT,
        entityId: this.id(),
        view: 'detail',
        title: a ? `${a.code} ${a.aspect}` : null,
        requirements: this.confirmedRefs().length ? this.confirmedRefs() : null,
      };
    });
    this.directory.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected label(c: ScoringMethod['criteria'][number]): string {
    return criterionLabel(c, this.language.active());
  }

  protected level(c: ScoringMethod['criteria'][number], value: number): string {
    return levelText(c, value, this.language.active());
  }

  protected askAi(promptKey: 'summariseAspect' | 'explainSignificance' | 'controlsField'): void {
    this.ask.askAbout(this.language.translate(`environment.ask.${promptKey}`), undefined, {
      requirements: this.confirmedRefs(),
    });
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.confirmedRefs.set(
      links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
    );
  }

  protected startFlow(key: string): void {
    const a = this.aspect();
    if (a) {
      void this.flows.start(key, ENTITY_ASPECT, a.id);
    }
  }

  protected onLinked(): void {
    this.linking.set(false);
    this.refresh();
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  protected review(body: ReviewIn): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    this.acting.set(true);
    this.api.reviewAspect(orgId, this.id(), body).subscribe({
      next: (a) => {
        this.acting.set(false);
        this.reviewing.set(false);
        this.aspect.set(a);
        this.notifications.success('environment.notices.reviewed', { code: a.code });
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const a = this.aspect();
    if (!orgId || !a) {
      return;
    }
    this.acting.set(true);
    this.api.deleteAspect(orgId, a.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('environment.notices.deleted', { code: a.code });
        void this.router.navigate(['/environment/aspects']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  /** Reload quietly (after linking a control): keeps the page on screen. */
  private refresh(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.api.getAspect(orgId, this.id()).subscribe({
      next: (a) => this.aspect.set(a),
      error: () => undefined,
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    this.methodRequest.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    if (this.aspect()?.id !== id) {
      // Another aspect: never show the previous one while the new one loads.
      this.aspect.set(null);
      this.confirmedRefs.set([]);
      this.state.set('loading');
    }
    this.methodRequest = this.api.scoring(orgId).subscribe({
      next: (m) => this.method.set(m),
      error: () => this.method.set(null),
    });
    this.request = this.api.getAspect(orgId, id).subscribe({
      next: (a) => {
        this.aspect.set(a);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(environmentErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
