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
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementLink } from '../../core/standards/standards.models';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { Term } from '../../shared/guidance/term';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { LinkPicker } from '../../shared/kit/link-picker';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
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
  EnvAskButton,
  departmentName,
  injectEnvPermissions,
} from './environment-shared';
import { EnvFlowButtons } from './flow-buttons';
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

/** The "create from here" flows offered in the operational controls card. */
export const CONTROL_FLOWS: readonly string[] = [
  FLOWS.aspectToDocument,
  FLOWS.aspectToObjective,
  FLOWS.aspectToRisk,
  FLOWS.aspectToTask,
];

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
 * An environmental aspect (`/environment/aspects/:id`). The page follows the route
 * id. Header: code, status, significance; Edit is the primary action, "Merk som
 * gjennomgått" and "Lag ny fra denne" are secondary, Delete is under "Mer". Body:
 * what needs attention (missing controls, no emergency plan, review overdue) with
 * the action that fixes it; the activity, aspect and impact as labelled fields;
 * the evaluation with each score's meaning and "Poeng 9 av 20 · vesentlig fra 12";
 * the obligations from "Lover og forskrifter" that apply (6.1.3); the operational
 * controls, written and linked (procedures, processes, objectives, risks, 8.1); the
 * emergency plans covering it (8.2). Aside: the requirements it documents,
 * connections, ownership and review, and why it matters.
 */
@Component({
  selector: 'app-env-aspect-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    WatchButton,
    AskAbout,
    Term,
    WhyItMatters,
    EntityChip,
    LinkPicker,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    StatusBadge,
    EnvAskButton,
    EnvFlowButtons,
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
            [entityType]="entityType"
            [entityId]="a.id"
            [title]="a.aspect"
            [breadcrumbs]="breadcrumbs()"
            [settingsLink]="perms.settingsLink()"
            [tabs]="tabs"
            [canEdit]="perms.write()"
            [fieldLabels]="fieldLabels"
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
              @if (a.significant) {
                <app-status-badge
                  meaning="severity"
                  value="medium"
                  labelKey="environment.aspect.significant"
                  data-testid="aspect-significant"
                />
              } @else if (a.evaluated) {
                <app-status-badge
                  meaning="severity"
                  value="low"
                  labelKey="environment.aspect.notSignificant"
                />
              }
            </ng-container>

            @if (perms.write()) {
              <a
                primary
                [routerLink]="['/environment/aspects', a.id, 'edit']"
                tabindex="-1"
                data-testid="aspect-edit"
              >
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

            <app-module-nav
              nav
              class="mb-4 block"
              [items]="perms.nav()"
              labelKey="modules.names.environment"
            />
            <app-help-strip
              help
              scope="environment"
              page="aspectDetail"
              lesson="significance"
              [subject]="a.aspect"
            />

            <div class="flex flex-col gap-5">
              @if (notices().length) {
                <ul class="flex flex-col gap-2" role="status" data-testid="aspect-notices">
                  @for (n of notices(); track n) {
                    <li
                      class="flex flex-col gap-2 rounded-tile border border-warn/40 bg-warn-soft px-4 py-3 text-ui text-warn-ink sm:flex-row sm:items-center"
                      [attr.data-testid]="'aspect-notice-' + n"
                    >
                      <span class="flex min-w-0 flex-1 gap-2">
                        <app-icon name="alert" [size]="15" class="mt-0.5 flex-none" />
                        <span>{{
                          'environment.aspect.notices.' + n
                            | transloco: { date: (a.review_due_at | localDay) }
                        }}</span>
                      </span>
                      @if (perms.write()) {
                        <span class="flex flex-none flex-wrap gap-2">
                          @switch (n) {
                            @case ('controls') {
                              <app-button variant="secondary" size="sm" (click)="linking.set(true)">
                                <app-icon name="link" [size]="13" />
                                {{ 'environment.aspect.linkControl' | transloco }}
                              </app-button>
                            }
                            @case ('plan') {
                              <app-button
                                variant="secondary"
                                size="sm"
                                [loading]="flows.starting() === planFlow"
                                (click)="startFlow(planFlow)"
                                data-testid="aspect-make-plan"
                              >
                                <app-icon name="plus" [size]="13" />
                                {{ 'environment.aspect.makePlan' | transloco }}
                              </app-button>
                            }
                            @case ('review') {
                              <app-button
                                variant="secondary"
                                size="sm"
                                (click)="reviewing.set(true)"
                              >
                                {{ 'environment.review.action' | transloco }}
                              </app-button>
                            }
                            @case ('unscored') {
                              <a
                                [routerLink]="['/environment/aspects', a.id, 'edit']"
                                tabindex="-1"
                              >
                                <app-button variant="secondary" size="sm">{{
                                  'environment.aspect.scoreNow' | transloco
                                }}</app-button>
                              </a>
                            }
                          }
                        </span>
                      }
                    </li>
                  }
                </ul>
              }

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'environment.aspect.sections.identify' | transloco }}
                </h2>
                <app-field-list data-testid="aspect-identify">
                  <app-field-item labelKey="environment.fields.activity" [wide]="true">
                    <span class="flex flex-wrap items-center gap-2">
                      <span>{{ a.activity }}</span>
                      @if (a.process; as p) {
                        <app-entity-chip [ref]="ref(p)" />
                      }
                    </span>
                  </app-field-item>
                  <app-field-item
                    labelKey="environment.fields.aspect"
                    [value]="a.aspect"
                    [wide]="true"
                  />
                  <app-field-item
                    labelKey="environment.fields.impact"
                    [value]="a.impact"
                    [wide]="true"
                    [multiline]="true"
                  />
                  <app-field-item
                    labelKey="environment.fields.impactType"
                    [value]="'environment.impactTypes.' + a.impact_type | transloco"
                  />
                  <app-field-item
                    labelKey="environment.fields.condition"
                    [value]="'environment.conditions.' + a.condition | transloco"
                  />
                  <app-field-item
                    labelKey="environment.fields.controlLevel"
                    [value]="'environment.controlLevels.' + a.control_level | transloco"
                  />
                  <app-field-item labelKey="environment.fields.site" [value]="a.site" />
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
                </app-field-list>
              </app-card>

              <app-card data-testid="aspect-evaluation">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    <app-term key="significant-aspect" scope="environment">{{
                      'environment.aspect.sections.evaluate' | transloco
                    }}</app-term>
                  </h2>
                  <app-ask-about
                    [prompt]="'environment.ask.explainSignificance' | transloco"
                    field="significant"
                    [fieldLabel]="'environment.aspect.sections.evaluate' | transloco"
                    [requirements]="confirmedRefs()"
                  />
                </div>
                <p class="text-body font-semibold text-fg" data-testid="aspect-score">
                  @if (a.score !== null) {
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
                  } @else {
                    {{ 'environment.aspect.scoreIncomplete' | transloco }}
                  }
                </p>
                @if (perms.manage()) {
                  <a
                    routerLink="/environment/scoring"
                    class="mt-1 inline-block text-meta font-semibold text-accent hover:underline"
                    >{{ 'environment.aspect.seeMethod' | transloco }}</a
                  >
                }
                @if (method(); as m) {
                  <div class="mt-3 overflow-x-auto">
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
                  <h3 class="mt-4 mb-1 text-meta font-semibold text-fg-muted">
                    {{ 'environment.aspect.whySignificant' | transloco }}
                  </h3>
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
              </app-card>

              <app-card data-testid="aspect-obligations">
                <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    <app-term key="compliance-obligation" scope="environment">{{
                      'environment.aspect.sections.obligations' | transloco
                    }}</app-term>
                  </h2>
                  @if (perms.write()) {
                    <a
                      [routerLink]="['/environment/aspects', a.id, 'edit']"
                      fragment="obligations"
                      class="text-ui font-semibold text-accent hover:underline"
                      >{{ 'environment.aspect.editObligations' | transloco }}</a
                    >
                  }
                </div>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'environment.aspect.obligationsHint' | transloco }}
                </p>
                @if (obligations().length) {
                  <ul class="flex flex-col gap-2">
                    @for (o of obligations(); track o.id) {
                      <li><app-entity-chip [ref]="ref(o)" [statusText]="true" /></li>
                    }
                  </ul>
                } @else {
                  <p class="text-ui text-fg-muted" data-testid="no-obligations">
                    {{ 'environment.aspect.noObligations' | transloco }}
                  </p>
                }
              </app-card>

              <app-card data-testid="aspect-controls">
                <h2 class="mb-1 font-display text-card font-bold text-fg">
                  <app-term key="operational-control" scope="environment">{{
                    'environment.fields.operationalControls' | transloco
                  }}</app-term>
                </h2>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'environment.aspect.controlsHint' | transloco }}
                </p>
                @if (a.operational_controls) {
                  <p class="mb-3 text-body whitespace-pre-line text-fg">
                    {{ a.operational_controls }}
                  </p>
                }
                @if (controls().length) {
                  <h3 class="mb-1.5 text-meta font-semibold text-fg-muted">
                    {{ 'environment.aspect.linkedControls' | transloco }}
                  </h3>
                  <ul class="mb-3 flex flex-col gap-2" data-testid="aspect-linked-controls">
                    @for (c of controls(); track c.id) {
                      <li><app-entity-chip [ref]="ref(c)" [statusText]="true" /></li>
                    }
                  </ul>
                }
                @if (!a.operational_controls && !controls().length) {
                  <p class="mb-3 text-ui text-fg-muted">
                    {{
                      (a.significant
                        ? 'environment.aspect.noControlsSignificant'
                        : 'environment.aspect.noControls'
                      ) | transloco
                    }}
                  </p>
                }
                @if (perms.write()) {
                  <div class="flex flex-wrap gap-2" data-testid="aspect-control-actions">
                    <app-button variant="secondary" size="sm" (click)="linking.set(true)">
                      <app-icon name="link" [size]="13" />
                      {{ 'environment.aspect.linkControl' | transloco }}
                    </app-button>
                    <app-env-flow-buttons
                      [entityType]="entityType"
                      [entityId]="a.id"
                      [keys]="controlFlows"
                    />
                  </div>
                }
              </app-card>

              @if (a.condition !== 'normal' || plans().length) {
                <app-card data-testid="aspect-plans">
                  <h2 class="mb-1 font-display text-card font-bold text-fg">
                    {{ 'environment.aspect.sections.preparedness' | transloco }}
                  </h2>
                  <p class="mb-3 text-meta text-fg-muted">
                    {{ 'environment.aspect.plansHint' | transloco }}
                  </p>
                  @if (plans().length) {
                    <ul class="flex flex-col gap-2">
                      @for (p of plans(); track p.id) {
                        <li><app-entity-chip [ref]="ref(p)" [statusText]="true" /></li>
                      }
                    </ul>
                  } @else {
                    <p class="text-ui text-fg-muted">
                      {{ 'environment.aspect.noPlan' | transloco }}
                    </p>
                  }
                  @if (perms.write() && !plans().length) {
                    <div class="mt-3">
                      <app-button
                        variant="secondary"
                        size="sm"
                        [loading]="flows.starting() === planFlow"
                        (click)="startFlow(planFlow)"
                      >
                        <app-icon name="plus" [size]="13" />
                        {{ 'environment.aspect.makePlan' | transloco }}
                      </app-button>
                    </div>
                  }
                </app-card>
              }
            </div>

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

            <div aside class="flex flex-col gap-4">
              <app-card data-testid="aspect-ownership">
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'environment.aspect.ownership' | transloco }}
                  </h2>
                  <app-watch-button [entityType]="entityType" [entityId]="a.id" />
                </div>
                <app-field-list [columns]="1">
                  <app-field-item labelKey="environment.fields.owner" [value]="a.owner_name" />
                  <app-field-item labelKey="environment.fields.department" [value]="department()" />
                  <app-field-item labelKey="environment.fields.reviewDue">
                    @if (a.review_due_at) {
                      <span
                        [class.font-semibold]="a.review_overdue"
                        [class.text-warn-ink]="a.review_overdue"
                      >
                        {{ a.review_due_at | localDay }}
                        @if (a.review_overdue) {
                          · {{ 'common.status.overdue' | transloco }}
                        }
                      </span>
                    }
                  </app-field-item>
                  <app-field-item
                    labelKey="environment.fields.lastReviewed"
                    [value]="a.last_reviewed_at ? (a.last_reviewed_at | localDate) : null"
                    empty="none"
                  />
                </app-field-list>
                <div
                  class="mt-4 flex flex-wrap gap-1"
                  role="group"
                  [attr.aria-label]="'environment.ask.group' | transloco"
                >
                  <app-env-ask-button
                    labelKey="environment.ask.summariseLabel"
                    promptKey="environment.ask.summariseAspect"
                    [requirements]="confirmedRefs()"
                  />
                </div>
              </app-card>
            </div>

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
  protected readonly flows = inject(CreateFlowService);

  /** Route param (component input binding): follows navigation between aspects. */
  readonly id = input.required<string>();

  protected readonly perms = injectEnvPermissions();
  protected readonly entityType = ENTITY_ASPECT;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = ASPECT_FIELD_LABELS;
  protected readonly frameworks = ENV_FRAMEWORKS;
  protected readonly controlFlows = CONTROL_FLOWS;
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
  protected readonly notices = computed(() => {
    const a = this.aspect();
    return a ? aspectNotices(a) : [];
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
