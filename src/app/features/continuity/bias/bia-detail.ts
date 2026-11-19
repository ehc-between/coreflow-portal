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
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { EntityTypesService } from '../../../core/kit/entity-types.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContinuityApi } from '../data/continuity-api';
import {
  ControlledHeaderAction,
  biaMissing,
  controlledStatusLine,
  placeControlledActions,
} from '../data/continuity-anatomy';
import { badge } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import {
  BiaDetail,
  DependencyOut,
  IMPACT_CATEGORIES,
  IMPACT_INTERVALS,
  ImpactCategory,
  LinkedRef,
} from '../data/continuity.models';
import { ContinuityLearnMore, recordCrumbs } from '../shared/continuity-page';
import { ContinuityControlledDialog, ControlledActionRequest } from '../shared/controlled-panel';
import { ContinuityDuration } from '../shared/duration';
import { ContinuityLinkedRecord } from '../shared/linked-record';
import { confirmedRequirementRefs } from '../shared/page-requirements';
import { ContinuityRecoveryTargets, hasTargets } from '../shared/recovery-targets';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key (the BIA's controlled fields). */
export const BIA_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'continuity.fields.code',
  status: 'continuity.fields.status',
  version: 'continuity.fields.version',
  last_reviewed_on: 'continuity.fields.lastReviewed',
  next_review_on: 'continuity.fields.nextReview',
  title: 'continuity.fields.title',
  description: 'continuity.fields.description',
  process_id: 'continuity.fields.process',
  owner_user_id: 'continuity.fields.owner',
  department_id: 'continuity.fields.department',
  criticality: 'continuity.fields.criticality',
  impacts: 'continuity.fields.impacts',
  impact_timeline: 'continuity.fields.impactTimeline',
  impact_notes: 'continuity.fields.impactNotes',
  mtpd_minutes: 'continuity.fields.mtpd',
  rto_minutes: 'continuity.fields.rto',
  rpo_minutes: 'continuity.fields.rpo',
  mbco: 'continuity.fields.mbco',
  peak_periods: 'continuity.fields.peakPeriods',
  workarounds: 'continuity.fields.workarounds',
  dependencies: 'continuity.fields.dependencies',
  review_interval_months: 'continuity.fields.reviewInterval',
};

/** Icon and type word of a dependency, by the record it points at (else its kind). */
const DEPENDENCY_ICON: Readonly<Record<string, string>> = {
  ict: 'devices',
  supplier: 'contract',
  asset: 'devices',
  employee: 'people',
  position: 'people',
  people: 'people',
  document: 'documents',
  ropa_entry: 'lock',
  site: 'pin',
  equipment: 'hardhat',
  information: 'documents',
};

/**
 * A business impact analysis (`/continuity/bias/:id`) on the detail-page anatomy
 * (docs/ux-guide.md §2.7): the header holds the next approval step; "Hovedinformasjon"
 * says where it stands, which activity it analyses, how critical it is, the recovery
 * targets and the plans that cover it; the details hold the impact ratings, the
 * dependencies (linked to the ICT services, suppliers, people and records they rely
 * on) and the other fields; one "Oppfølging" card lists what is missing, the
 * requirements, the connections and owner · version · approval · reviews.
 */
@Component({
  selector: 'app-bia-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    Button,
    ConfirmDialog,
    ContinuityControlledDialog,
    ContinuityDuration,
    ContinuityLearnMore,
    ContinuityLinkedRecord,
    ContinuityRecoveryTargets,
    EntityTasks,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    StatusBadge,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8"><app-loading-state [rows]="6" /></div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/continuity/bias"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'continuity.bias.back' | transloco }}
          </a>
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (bia(); as b) {
          @let line = statusLine();
          <app-record-detail-layout
            [anatomy]="true"
            entityType="bia"
            [entityId]="b.id"
            [title]="b.title"
            [breadcrumbs]="crumbs()"
            [tabs]="tabs"
            [canEdit]="b.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            [requirementsPanel]="true"
            [missing]="missing()"
            backLink="/continuity/bias"
            backLabelKey="continuity.bias.back"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ b.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'continuity.detail.type.bia' | transloco }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="b.status"
                [labelKey]="'continuity.status.' + b.status"
              />
              @if (b.review_state === 'overdue' && b.status !== 'retired') {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="continuity.reviewState.overdue"
                />
              }
            </ng-container>

            @if (placed().primary; as action) {
              <app-button
                primary
                [disabled]="busy()"
                (click)="run(b, action)"
                [attr.data-testid]="'bia-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            @for (action of placed().secondary; track action) {
              <app-button
                secondary
                variant="secondary"
                [disabled]="busy()"
                (click)="run(b, action)"
                [attr.data-testid]="'bia-' + action"
              >
                {{ actionLabel(action) | transloco }}
              </app-button>
            }
            @for (action of placed().overflow; track action) {
              <button appMenuItem overflow type="button" (click)="run(b, action)">
                {{ actionLabel(action) | transloco }}
              </button>
            }
            @if (b.allowed_actions.includes('retire')) {
              <button appMenuItem overflow type="button" (click)="dialog()?.open('retire')">
                {{ 'continuity.actions.retire' | transloco }}
              </button>
            }
            @if (b.can_delete) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="confirmDelete.set(true)"
              >
                {{ 'continuity.common.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summariseBia')">
              <app-icon name="spark" [size]="15" />
              {{ 'continuity.ai.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('nextStep')">
              <app-icon name="spark" [size]="15" />
              {{ 'continuity.detail.ask.nextStep' | transloco }}
            </button>

            <app-help-strip
              help
              scope="continuity"
              page="biaDetail"
              lesson="running-a-bia"
              [subject]="b.title"
            />

            <app-record-lead record-lead [fillLink]="b.can_edit ? editLink() : null">
              <app-record-status-line status [tone]="line.tone">
                {{
                  line.key
                    | transloco
                      : {
                          date: (line.date | localDay),
                          name: line.name || ('continuity.common.unknownPerson' | transloco),
                          version: line.version,
                        }
                }}
              </app-record-status-line>
              <app-field-item size="lead" labelKey="continuity.detail.bia.process">
                @if (b.process; as process) {
                  <div role="list">
                    <app-continuity-linked-record
                      icon="procedures"
                      [typeText]="typeLabel(process)"
                      [code]="process.code"
                      [title]="process.title"
                      [link]="process.url"
                    >
                      @if (process.status) {
                        <span>{{ statusLabel(process) }}</span>
                      }
                    </app-continuity-linked-record>
                  </div>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="continuity.detail.bia.criticality">
                @if (b.criticality) {
                  <span class="flex flex-wrap items-center gap-2">
                    <app-status-badge
                      meaning="severity"
                      [value]="b.criticality"
                      [labelKey]="'continuity.criticality.' + b.criticality"
                    />
                    @if (b.max_impact > 0) {
                      <span class="text-ui text-fg-muted">{{
                        'continuity.detail.bia.maxImpact' | transloco: { value: b.max_impact }
                      }}</span>
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="continuity.detail.bia.targets" [wide]="true">
                @if (targetsSet(b)) {
                  <app-continuity-recovery-targets
                    [rto]="b.rto_minutes"
                    [rpo]="b.rpo_minutes"
                    [mtpd]="b.mtpd_minutes"
                  />
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="continuity.detail.bia.plans" [wide]="true">
                @if (b.plans.length) {
                  <div role="list" class="flex flex-col gap-2" data-testid="bia-plans">
                    @for (p of b.plans; track p.id) {
                      <app-continuity-linked-record
                        icon="shield"
                        typeKey="continuity.detail.type.plan"
                        [code]="p.code"
                        [title]="p.title"
                        [link]="['/continuity/plans', p.id]"
                      >
                        @if (p.status) {
                          <app-status-badge
                            meaning="lifecycle"
                            [value]="p.status"
                            [labelKey]="'continuity.status.' + p.status"
                          />
                        }
                      </app-continuity-linked-record>
                    }
                  </div>
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-8">
              <app-record-details [columns]="2" [fillLink]="b.can_edit ? editLink() : null">
                <app-field-item labelKey="continuity.detail.bia.description" [wide]="true">
                  @if (b.description) {
                    <div
                      class="cf-prose text-body leading-relaxed"
                      [innerHTML]="b.description | appMarkdown"
                    ></div>
                  }
                </app-field-item>
                <app-field-item
                  labelKey="continuity.fields.mbco"
                  [wide]="true"
                  [value]="b.mbco"
                  [multiline]="true"
                />
                <app-field-item
                  labelKey="continuity.detail.bia.workarounds"
                  [wide]="true"
                  [value]="b.workarounds"
                  [multiline]="true"
                />
                <app-field-item
                  labelKey="continuity.detail.bia.peakPeriods"
                  [wide]="true"
                  [value]="b.peak_periods"
                  [multiline]="true"
                />
              </app-record-details>

              <section aria-labelledby="bia-impacts" data-testid="impacts">
                <h2 id="bia-impacts" class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'continuity.form.sections.impacts' | transloco }}
                </h2>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'continuity.bias.impactsIntro' | transloco }}
                </p>
                @if (rated(b).length) {
                  <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    @for (c of rated(b); track c) {
                      <li
                        class="flex items-center justify-between gap-2 rounded-tile border border-border px-3 py-2"
                      >
                        <span class="text-ui text-fg">{{
                          'continuity.impacts.' + c | transloco
                        }}</span>
                        <app-status-badge
                          [meaning]="impactBadge(b.impacts[c]).meaning"
                          [value]="impactBadge(b.impacts[c]).value"
                          [labelKey]="'continuity.impactLevel.' + b.impacts[c]"
                        />
                      </li>
                    }
                  </ul>
                }
                @if (unrated(b); as missingAreas) {
                  <p class="mt-2 text-ui text-fg-muted" data-testid="impacts-unrated">
                    {{ 'continuity.detail.bia.unrated' | transloco: { areas: missingAreas } }}
                    @if (b.can_edit) {
                      <span aria-hidden="true"> · </span>
                      <a
                        [routerLink]="editLink()"
                        class="font-semibold text-accent hover:underline"
                        >{{ 'continuity.detail.fill' | transloco }}</a
                      >
                    }
                  </p>
                }
                @if (b.impact_notes) {
                  <p class="mt-3 text-ui whitespace-pre-line text-fg-muted">{{ b.impact_notes }}</p>
                }

                @if (hasTimeline(b)) {
                  <h3 class="mt-5 mb-2 text-ui font-semibold text-fg">
                    {{ 'continuity.fields.impactTimeline' | transloco }}
                  </h3>
                  <ol class="grid grid-cols-3 gap-1.5 sm:grid-cols-5" data-testid="impact-timeline">
                    @for (i of intervals; track i) {
                      <li
                        class="flex flex-col items-center gap-1 rounded-tile border border-border px-1 py-2 text-center"
                      >
                        <span class="text-meta font-semibold text-fg-muted">{{
                          'continuity.intervals.' + i | transloco
                        }}</span>
                        @if (timelineValue(b, i); as v) {
                          <app-status-badge
                            [meaning]="impactBadge(v).meaning"
                            [value]="impactBadge(v).value"
                            [labelKey]="'continuity.impactShort.' + v"
                          />
                        } @else if (timelineValue(b, i) === 0) {
                          <app-status-badge
                            meaning="severity"
                            value="none"
                            labelKey="continuity.impactShort.0"
                          />
                        } @else {
                          <span class="text-meta text-fg-subtle">—</span>
                        }
                      </li>
                    }
                  </ol>
                  @if (b.suggested_mtpd_minutes) {
                    <p class="mt-2 text-meta text-fg-muted" data-testid="suggested-mtpd">
                      {{ 'continuity.bias.suggestedMtpd' | transloco }}
                      <span class="font-semibold text-fg"
                        ><app-continuity-duration [minutes]="b.suggested_mtpd_minutes"
                      /></span>
                      @if (b.mtpd_minutes !== null && b.mtpd_minutes > b.suggested_mtpd_minutes) {
                        ·
                        <span class="text-warn-ink">{{
                          'continuity.bias.mtpdLonger' | transloco
                        }}</span>
                      }
                    </p>
                  }
                } @else {
                  <p class="mt-3 text-meta text-fg-muted">
                    {{ 'continuity.bias.noTimeline' | transloco }}
                  </p>
                }
              </section>

              <section aria-labelledby="bia-dependencies">
                <h2 id="bia-dependencies" class="mb-1 font-display text-card font-bold text-fg">
                  {{ 'continuity.detail.bia.dependencies' | transloco }}
                </h2>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'continuity.detail.bia.dependenciesIntro' | transloco }}
                </p>
                @if (b.dependencies.length === 0) {
                  <p class="text-ui text-fg-muted">
                    {{ 'continuity.form.noDependencies' | transloco }}
                  </p>
                } @else {
                  <div role="list" class="flex flex-col gap-2" data-testid="dependencies">
                    @for (dep of b.dependencies; track $index) {
                      <app-continuity-linked-record
                        [icon]="dependencyIcon(dep)"
                        [typeKey]="'continuity.dependencyKind.' + dep.kind"
                        [code]="dep.ict_system_code ?? dep.entity?.code"
                        [title]="dep.entity?.title ?? dep.name"
                        [link]="dependencyLink(dep)"
                      >
                        @if (dep.ict_system_id && dep.ict_readiness) {
                          <app-status-badge
                            [meaning]="readinessBadge(dep).meaning"
                            [value]="readinessBadge(dep).value"
                            [labelKey]="'continuity.readiness.' + dep.ict_readiness"
                          />
                        }
                        @if (dep.ict_issues?.length) {
                          <span class="text-warn-ink">{{ issueText(dep) }}</span>
                        }
                        @if (!dep.ict_system_id && !dep.entity && dep.entity_id) {
                          <span class="text-fg-subtle">{{
                            'continuity.bias.linkHidden' | transloco
                          }}</span>
                        }
                        @if (dep.notes) {
                          <span class="basis-full text-fg-muted">{{ dep.notes }}</span>
                        }
                      </app-continuity-linked-record>
                    }
                  </div>
                }
              </section>

              <app-why-it-matters scope="continuity" page="biaDetail" />
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="bia"
                [entityId]="b.id"
                [canCreate]="b.can_edit"
                [entityLabel]="b.code + ' ' + b.title"
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="continuity.fields.owner"
                [value]="b.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="continuity.fields.version"
                [value]="b.version || null"
              />
              <app-field-item layout="inline" labelKey="continuity.detail.meta.approved">
                @if (b.approved_at) {
                  {{ b.approved_at | localDay }}
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="continuity.fields.lastReviewed"
                [value]="b.last_reviewed_on | localDay"
              />
              <app-field-item
                layout="inline"
                labelKey="continuity.detail.meta.reviewEvery"
                [value]="
                  'continuity.detail.meta.everyMonths'
                    | transloco: { count: b.review_interval_months }
                "
              />
              <app-field-item
                layout="inline"
                labelKey="continuity.fields.nextReview"
                [keepEmpty]="b.status !== 'retired'"
                [emptyKey]="
                  b.status === 'approved'
                    ? 'kit.detail.meta.notPlanned'
                    : 'continuity.detail.meta.afterApproval'
                "
              >
                @if (b.next_review_on) {
                  <span [class.text-warn-ink]="b.review_state === 'overdue'">{{
                    b.next_review_on | localDay
                  }}</span>
                }
              </app-field-item>
              <app-field-item
                layout="inline"
                labelKey="continuity.detail.meta.updated"
                [value]="b.updated_at | localDate"
              />
            </app-record-meta>

            <app-continuity-learn-more
              aside-learn
              [lessons]="['recovery-targets', 'writing-a-plan']"
            />
          </app-record-detail-layout>

          <app-continuity-controlled-dialog [busy]="busy()" (acted)="act(b, $event)" />

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'continuity.bias.deleteTitle' | transloco"
            [message]="
              'continuity.common.deleteMessage' | transloco: { code: b.code, title: b.title }
            "
            [confirmLabel]="'continuity.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(b)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class BiaDetailPage {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly flows = inject(CreateFlowService);
  private readonly router = inject(Router);
  private readonly types = inject(EntityTypesService);

  readonly id = input.required<string>();

  protected readonly dialog = viewChild(ContinuityControlledDialog);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = BIA_FIELD_LABELS;
  protected readonly intervals = IMPACT_INTERVALS;
  protected readonly impactBadge = badge.impact;
  protected readonly readinessBadge = (d: DependencyOut) =>
    badge.readiness(d.ict_readiness ?? null);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly bia = signal<BiaDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  protected readonly canWrite = computed(() => this.permissions().includes('continuity:write'));
  protected readonly crumbs = computed(() => recordCrumbs('bias', this.bia()?.code ?? ''));
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/continuity/bias',
    this.id(),
    'edit',
  ]);

  protected readonly statusLine = computed(() => {
    const b = this.bia();
    return b ? controlledStatusLine(b) : { key: '', tone: 'neutral' as const };
  });

  protected readonly placed = computed(() => {
    const b = this.bia();
    return b ? placeControlledActions(b) : { primary: null, secondary: [], overflow: [] };
  });

  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const b = this.bia();
    if (!b) {
      return [];
    }
    return biaMissing(b, {
      editLink: this.editLink(),
      review: b.allowed_actions.includes('review') ? () => this.dialog()?.open('review') : null,
      createPlan: this.canWrite() ? () => this.createPlan(b) : null,
    });
  });

  /** Requirements the record documents, for the assistant's page context. */
  private readonly requirements = confirmedRequirementRefs('bia', () => this.id());

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const b = this.bia();
      return {
        module: 'continuity',
        entityType: 'bia',
        entityId: this.id(),
        view: 'detail',
        requirements: this.requirements(),
        title: b ? `${b.code} ${b.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected actionLabel(action: ControlledHeaderAction): string {
    return action === 'edit' ? 'continuity.common.edit' : `continuity.actions.${action}`;
  }

  protected targetsSet(b: BiaDetail): boolean {
    return hasTargets(b.rto_minutes, b.rpo_minutes, b.mtpd_minutes);
  }

  /** The impact areas that have a rating. */
  protected rated(b: BiaDetail): ImpactCategory[] {
    return IMPACT_CATEGORIES.filter((c) => b.impacts[c] !== null && b.impacts[c] !== undefined);
  }

  /** "Omdømme, Miljø" – the areas not rated yet, or '' when all are. */
  protected unrated(b: BiaDetail): string {
    return IMPACT_CATEGORIES.filter((c) => b.impacts[c] === null || b.impacts[c] === undefined)
      .map((c) => this.language.translate(`continuity.impacts.${c}`))
      .join(', ');
  }

  protected typeLabel(ref: LinkedRef): string {
    return this.types.label(ref.entity_type, ref.label_key);
  }

  protected statusLabel(ref: LinkedRef): string {
    return ref.status ? this.types.statusLabel(ref.status, ref.module) : '';
  }

  protected hasTimeline(b: BiaDetail): boolean {
    return IMPACT_INTERVALS.some((i) => typeof b.impact_timeline?.[i] === 'number');
  }

  protected timelineValue(
    b: BiaDetail,
    interval: (typeof IMPACT_INTERVALS)[number],
  ): number | null {
    const v = b.impact_timeline?.[interval];
    return typeof v === 'number' ? v : null;
  }

  protected dependencyIcon(dep: DependencyOut): string {
    if (dep.ict_system_id) {
      return 'devices';
    }
    return DEPENDENCY_ICON[dep.entity?.entity_type ?? dep.entity_type ?? dep.kind] ?? 'link';
  }

  protected dependencyLink(dep: DependencyOut): string | readonly unknown[] | null {
    if (dep.ict_system_id) {
      return ['/continuity/ict-systems', dep.ict_system_id];
    }
    return dep.entity?.url ?? null;
  }

  /** "RTO too long · Never tested" for an ICT dependency. */
  protected issueText(dep: DependencyOut): string {
    return (dep.ict_issues ?? [])
      .map((issue) => this.language.translate('continuity.readinessIssue.' + issue))
      .join(' · ');
  }

  protected run(b: BiaDetail, action: ControlledHeaderAction): void {
    if (action === 'edit') {
      void this.router.navigate(this.editLink());
    } else {
      this.dialog()?.open(action);
    }
  }

  protected askAi(kind: 'summariseBia' | 'nextStep'): void {
    this.ask.showWith(this.language.translate(`continuity.ai.prompts.${kind}`));
  }

  /** A plan covering this BIA, prefilled from it (the `bia.to_plan` flow). */
  protected createPlan(b: BiaDetail): void {
    void this.flows.start('bia.to_plan', 'bia', b.id).then((ok) => {
      if (!ok) {
        void this.router.navigate(['/continuity/plans/new'], { queryParams: { bia: b.id } });
      }
    });
  }

  protected act(b: BiaDetail, request: ControlledActionRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.biaAction(orgId, b.id, request.action, request.note).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.dialog()?.close();
        this.bia.set(updated);
        this.notifications.success('continuity.actionDone.' + request.action, { code: b.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.dialog()?.close();
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  protected remove(b: BiaDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteBia(orgId, b.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('continuity.common.deleted', { code: b.code });
        void this.router.navigate(['/continuity/bias']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (this.bia()?.id !== id) {
      this.state.set('loading');
    }
    this.request = this.api.getBia(orgId, id).subscribe({
      next: (b) => {
        this.bia.set(b);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
