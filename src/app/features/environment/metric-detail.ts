import { formatDate } from '@angular/common';
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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, map } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementLink } from '../../core/standards/standards.models';
import { Attachments } from '../../shared/attachments/attachments';
import { Term } from '../../shared/guidance/term';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
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
import { RuleSummary } from '../../shared/tasks/rule-summary';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../shared/ui/pager/pager';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EnvironmentApi } from './data/environment-api';
import {
  ENTITY_MEASUREMENT,
  ENTITY_METRIC,
  FLOWS,
  Measurement,
  MeasurementCreate,
  Metric,
  TREND_BUCKETS,
  Trend,
  TrendBucket,
} from './data/environment.models';
import { displayUnit, localDay, targetBadgeValue } from './data/environment-display';
import { environmentErrorKey } from './data/environment-errors';
import { chipRef } from './aspect-detail';
import { EnvTrendChart } from './env-trend-chart';
import {
  ENV_CRUMBS,
  ENV_FRAMEWORKS,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  departmentName,
  injectEnvPermissions,
} from './environment-shared';
import { EnvMeasurementDialog } from './measurement-dialog';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const METRIC_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'environment.fields.code',
  name: 'environment.fields.name',
  category: 'environment.fields.category',
  unit: 'environment.fields.unit',
  ghg_scope: 'environment.fields.ghgScope',
  emission_factor: 'environment.fields.emissionFactor',
  factor_source: 'environment.fields.factorSource',
  factor_year: 'environment.fields.factorYear',
  direction: 'environment.fields.direction',
  target_value: 'environment.fields.targetValue',
  target_year: 'environment.fields.targetYear',
  baseline_value: 'environment.fields.baselineValue',
  baseline_year: 'environment.fields.baselineYear',
  measurement_method: 'environment.fields.measurementMethod',
  description: 'environment.fields.description',
  site: 'environment.fields.site',
  status: 'environment.fields.status',
  owner_user_id: 'environment.fields.owner',
  department_id: 'environment.fields.department',
  collection_rrule: 'environment.metric.collection',
};

const MEASUREMENTS_PAGE = 12;

/** How far back the trend looks per bucket (days). */
const TREND_WINDOW: Readonly<Record<TrendBucket, number>> = {
  month: 365 * 2,
  quarter: 365 * 3,
  year: 365 * 10,
};

/** The status sentence of an indicator: how it is doing against its target. */
export type MetricStatusKey = 'on_track' | 'off_track' | 'no_target' | 'no_data' | 'retired';

export function metricStatusKey(m: Metric): MetricStatusKey {
  if (m.status === 'retired') {
    return 'retired';
  }
  if (m.target_value === null || m.target_value === undefined) {
    return 'no_target';
  }
  return m.target_status && m.target_status !== 'no_target' ? m.target_status : 'no_data';
}

/** On track is done (green); off track and no target are open work (never red). */
export const METRIC_STATUS_TONE: Readonly<Record<MetricStatusKey, StatusLineTone>> = {
  on_track: 'pass',
  off_track: 'warn',
  no_target: 'warn',
  no_data: 'neutral',
  retired: 'neutral',
};

/** The actions behind the missing lines ("Oppfølging", docs/ux-guide.md §2.7). */
export interface MetricMissingActions {
  readonly editLink: readonly unknown[];
  /** Record a value, or null without the record permission. */
  readonly record: (() => void) | null;
  readonly makeObjective: () => void;
}

/** What an indicator still needs, as actionable lines of the "Oppfølging" card. */
export function metricMissing(m: Metric, actions: MetricMissingActions): RecordMissingItem[] {
  if (m.status === 'retired') {
    return [];
  }
  const items: RecordMissingItem[] = [];
  if (!m.measurement_count && actions.record && m.status === 'active') {
    items.push({
      key: 'first',
      labelKey: 'environment.metric.missing.first',
      action: actions.record,
    });
  }
  if (m.target_value === null || m.target_value === undefined) {
    items.push({
      key: 'target',
      labelKey: 'environment.metric.missing.target',
      link: actions.editLink,
      fragment: 'target',
    });
  }
  if (!(m.objectives ?? []).length) {
    items.push({
      key: 'objective',
      labelKey: 'environment.metric.missing.objective',
      action: actions.makeObjective,
    });
  }
  if (!m.owner_user_id) {
    items.push({
      key: 'owner',
      labelKey: 'environment.metric.missing.owner',
      link: actions.editLink,
    });
  }
  if (!m.collection_rrule) {
    items.push({
      key: 'reminders',
      labelKey: 'environment.metric.missing.reminders',
      link: actions.editLink,
    });
  }
  return items;
}

/**
 * An environmental indicator (`/environment/metrics/:id`), built on the detail-page
 * anatomy (docs/ux-guide.md §2.7). Header: code · Indikator · category · status;
 * "Registrer verdi" is the primary action, Edit secondary, Delete under "Mer", the
 * assistant in "Spør KI". Hovedinformasjon: how it is doing against the target (a
 * status sentence), the last 12 months, the target, this year against last year and
 * the objectives it measures (6.2, 9.1.1). Details: the trend with the target line,
 * the measurements with their evidence files (`?measurement=<id>` highlights one)
 * and the remaining fields. Oppfølging: what is missing, the requirements, the
 * connections (measurements last) and ownership.
 */
@Component({
  selector: 'app-env-metric-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    Attachments,
    Term,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    SupportsRequirements,
    EntityTasks,
    RuleSummary,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    Pager,
    SlideOver,
    StatusBadge,
    EnvTrendChart,
    EnvMeasurementDialog,
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
              routerLink="/environment/metrics"
              class="text-ui font-semibold text-accent hover:underline"
              >{{ 'environment.metrics.back' | transloco }}</a
            >
          </p>
        </div>
      }
      @default {
        @if (metric(); as m) {
          @let unit = displayUnit(m.unit);
          <app-record-detail-layout
            [anatomy]="true"
            [entityType]="entityType"
            [entityId]="m.id"
            [title]="m.name"
            [breadcrumbs]="breadcrumbs()"
            [settingsLink]="perms.settingsLink()"
            [tabs]="tabs"
            [canEdit]="perms.write()"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
            [connectionsLast]="connectionsLast"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ m.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{
                'environment.metric.typeLine'
                  | transloco: { category: ('environment.categories.' + m.category | transloco) }
              }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                meaning="lifecycle"
                [value]="m.status"
                [labelKey]="'environment.status.' + m.status"
                data-testid="metric-status"
              />
            </ng-container>

            @if (perms.record() && m.status === 'active') {
              <app-button primary (click)="openRecord()" data-testid="record-measurement">
                <app-icon name="plus" [size]="15" />
                {{ 'environment.measurement.record' | transloco }}
              </app-button>
            }
            @if (perms.write()) {
              <a secondary [routerLink]="editLink()" tabindex="-1" data-testid="metric-edit">
                <app-button variant="secondary">{{
                  'environment.common.edit' | transloco
                }}</app-button>
              </a>
            }
            @if (perms.manage()) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleting.set(true)"
                data-testid="metric-delete"
              >
                {{ 'environment.common.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('explainTrend')">
              <app-icon name="spark" [size]="15" />
              {{ 'environment.ask.explainTrendLabel' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('targetField')">
              <app-icon name="spark" [size]="15" />
              {{ 'environment.ask.targetLabel' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('methodField')">
              <app-icon name="spark" [size]="15" />
              {{ 'environment.ask.methodLabel' | transloco }}
            </button>

            <app-help-strip
              help
              scope="environment"
              page="metricDetail"
              lesson="monitoring-and-emissions"
              [subject]="m.name"
            />

            <app-record-lead
              record-lead
              [fillLink]="perms.write() ? editLink() : null"
              data-testid="metric-target"
            >
              <app-record-status-line status [tone]="statusTone()">
                <span
                  [attr.data-testid]="statusKey() === 'no_target' ? 'metric-no-target' : null"
                  >{{ 'environment.metric.statusLine.' + statusKey() | transloco }}</span
                >
              </app-record-status-line>
              <app-field-item size="lead" labelKey="environment.metric.lead.last12">
                @if (m.last_12_months_value !== null && m.last_12_months_value !== undefined) {
                  {{ m.last_12_months_value | localNumber: '1.0-2' }} {{ unit }}
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="environment.metric.lead.target">
                @if (m.target_value !== null && m.target_value !== undefined) {
                  {{
                    'environment.metric.targetText.' + (m.direction ?? 'decrease')
                      | transloco
                        : {
                            value: (m.target_value | localNumber: '1.0-2'),
                            unit: unit,
                            year: m.target_year ?? '',
                          }
                  }}
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="environment.metric.lead.thisYear">
                @if (m.current_year_value !== null && m.current_year_value !== undefined) {
                  {{ m.current_year_value | localNumber: '1.0-2' }} {{ unit }}
                  @if (m.previous_year_value !== null && m.previous_year_value !== undefined) {
                    <span class="block text-ui font-normal text-fg-muted">
                      {{
                        'environment.metric.previousYearFull'
                          | transloco
                            : { value: (m.previous_year_value | localNumber: '1.0-2'), unit }
                      }}
                    </span>
                  }
                }
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="environment.metric.lead.objectives"
                data-testid="metric-objectives"
              >
                @if (objectives().length) {
                  <ul class="flex flex-col gap-1.5">
                    @for (o of objectives(); track o.id) {
                      <li><app-entity-chip [ref]="ref(o)" [statusText]="true" /></li>
                    }
                  </ul>
                }
              </app-field-item>
            </app-record-lead>

            <div class="flex flex-col gap-5">
              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'environment.metric.trend' | transloco }}
                  </h2>
                  <div
                    class="inline-flex rounded-tile border border-border p-0.5"
                    role="group"
                    [attr.aria-label]="'environment.metric.bucket' | transloco"
                  >
                    @for (b of buckets; track b) {
                      <button
                        type="button"
                        class="rounded-lg px-2.5 py-1 text-ui font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        [class.bg-accent-soft]="bucket() === b"
                        [class.text-accent]="bucket() === b"
                        [class.text-fg-muted]="bucket() !== b"
                        [attr.aria-pressed]="bucket() === b"
                        (click)="bucket.set(b)"
                        [attr.data-testid]="'bucket-' + b"
                      >
                        {{ 'environment.buckets.' + b | transloco }}
                      </button>
                    }
                  </div>
                </div>
                @if (trend(); as t) {
                  <app-env-trend-chart
                    [points]="t.points"
                    [bucket]="t.bucket"
                    [unit]="unit"
                    [target]="m.target_value"
                  />
                  <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-ui text-fg-muted">
                    <span>
                      {{
                        'environment.metric.total'
                          | transloco: { value: (t.total | localNumber: '1.0-2'), unit }
                      }}
                    </span>
                    @if (t.total_co2e_kg !== null) {
                      <span>
                        {{
                          'environment.metric.totalCo2e'
                            | transloco: { value: (t.total_co2e_kg | localNumber: '1.2-2') }
                        }}
                      </span>
                    }
                  </p>
                } @else if (trendFailed()) {
                  <app-error-state (retry)="bumpVersion()" />
                } @else {
                  <app-loading-state [rows]="3" />
                }
              </app-card>

              <app-card [padded]="false">
                <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'environment.measurement.listTitle' | transloco }}
                    @if (measurementTotal()) {
                      <span class="ml-1 text-ui font-normal text-fg-muted">{{
                        measurementTotal()
                      }}</span>
                    }
                  </h2>
                </div>
                @if (measurements().length) {
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-ui" data-testid="measurement-rows">
                      <thead class="text-meta text-fg-subtle">
                        <tr>
                          <th scope="col" class="px-4 py-1.5 font-semibold">
                            {{ 'environment.metric.period' | transloco }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 text-right font-semibold">
                            {{ 'environment.metric.value' | transloco }}
                          </th>
                          <th scope="col" class="hidden px-2 py-1.5 font-semibold sm:table-cell">
                            {{ 'environment.fields.source' | transloco }}
                          </th>
                          <th
                            scope="col"
                            class="hidden px-2 py-1.5 text-right font-semibold md:table-cell"
                          >
                            kg CO₂e
                          </th>
                          <th scope="col" class="px-2 py-1.5 font-semibold">
                            {{ 'environment.measurement.evidence' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-1.5">
                            <span class="sr-only">{{
                              'environment.common.actions' | transloco
                            }}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border text-fg">
                        @for (x of measurements(); track x.id) {
                          <tr
                            [id]="'measurement-' + x.id"
                            class="align-middle"
                            [class.bg-accent-soft]="x.id === highlightMeasurement()"
                          >
                            <td class="px-4 py-2 whitespace-nowrap">
                              {{ x.period_start | localDay }} – {{ x.period_end | localDay }}
                              @if (x.site || x.note) {
                                <span class="block max-w-[280px] truncate text-meta text-fg-subtle">
                                  {{ x.site }}{{ x.site && x.note ? ' · ' : '' }}{{ x.note }}
                                </span>
                              }
                              @if (x.recorded_by_name) {
                                <span class="block text-meta text-fg-subtle">{{
                                  'environment.measurement.recordedBy'
                                    | transloco: { name: x.recorded_by_name }
                                }}</span>
                              }
                            </td>
                            <td class="px-2 py-2 text-right font-semibold whitespace-nowrap">
                              {{ x.value | localNumber: '1.0-2' }} {{ unit }}
                            </td>
                            <td
                              class="hidden px-2 py-2 whitespace-nowrap text-fg-muted sm:table-cell"
                            >
                              {{
                                x.source
                                  ? ('environment.sources.' + x.source | transloco)
                                  : ('common.empty.dash' | transloco)
                              }}
                            </td>
                            <td class="hidden px-2 py-2 text-right whitespace-nowrap md:table-cell">
                              {{ x.co2e_kg === null ? '–' : (x.co2e_kg | localNumber: '1.2-2') }}
                            </td>
                            <td class="px-2 py-2 whitespace-nowrap">
                              <button
                                type="button"
                                class="inline-flex h-8 items-center gap-1 rounded-tile px-2 text-ui font-semibold hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                                [class.text-accent]="!!x.attachment_count"
                                [class.text-fg-muted]="!x.attachment_count"
                                (click)="evidenceFor.set(x)"
                                [attr.data-testid]="'measurement-evidence-' + x.id"
                              >
                                <app-icon name="documents" [size]="14" />
                                {{
                                  (x.attachment_count
                                    ? 'environment.measurement.files'
                                    : 'environment.measurement.addFile'
                                  ) | transloco: { count: x.attachment_count ?? 0 }
                                }}
                              </button>
                            </td>
                            <td class="px-4 py-2 text-right whitespace-nowrap">
                              @if (x.can_edit) {
                                <span class="inline-flex items-center gap-1">
                                  <app-button variant="ghost" size="sm" (click)="openEdit(x)">
                                    {{ 'environment.common.edit' | transloco }}
                                  </app-button>
                                  <button
                                    type="button"
                                    class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                                    [attr.aria-label]="'environment.measurement.delete' | transloco"
                                    [title]="'environment.measurement.delete' | transloco"
                                    (click)="deletingMeasurement.set(x)"
                                  >
                                    <app-icon name="trash" [size]="14" />
                                  </button>
                                </span>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  @if (measurementTotal() > pageSize) {
                    <div class="px-4 pb-3">
                      <app-pager
                        [offset]="offset()"
                        [pageSize]="pageSize"
                        [count]="measurements().length"
                        [total]="measurementTotal()"
                        (pageChange)="offset.set($event)"
                      />
                    </div>
                  }
                } @else {
                  <p class="px-4 pb-4 text-ui text-fg-muted" data-testid="no-measurements">
                    {{ 'environment.measurement.none' | transloco }}
                  </p>
                }
              </app-card>

              <app-record-details
                [columns]="2"
                [fillLink]="perms.write() ? editLink() : null"
                data-testid="metric-summary"
              >
                <app-field-item labelKey="environment.fields.unit" [value]="unit" />
                <app-field-item
                  labelKey="environment.fields.direction"
                  [value]="'environment.directions.' + (m.direction ?? 'decrease') | transloco"
                />
                <app-field-item labelKey="environment.fields.baselineValue">
                  @if (m.baseline_value !== null && m.baseline_value !== undefined) {
                    {{ m.baseline_value | localNumber: '1.0-2' }} {{ unit }}
                    @if (m.baseline_year) {
                      ({{ m.baseline_year }})
                    }
                  }
                </app-field-item>
                <app-field-item labelKey="environment.metric.details.scope">
                  @if (m.ghg_scope) {
                    {{ 'environment.scopes.' + m.ghg_scope | transloco }}
                  }
                </app-field-item>
                <app-field-item labelKey="environment.metric.details.factor">
                  @if (m.emission_factor !== null) {
                    <app-term key="emission-factor" scope="environment">{{
                      'environment.metric.factorValue'
                        | transloco: { value: (m.emission_factor | localNumber: '1.0-6'), unit }
                    }}</app-term>
                    @if (m.factor_source || m.factor_year) {
                      <span class="block text-meta text-fg-muted">
                        {{
                          'environment.metric.factorFrom'
                            | transloco
                              : { source: m.factor_source || '—', year: m.factor_year || '—' }
                        }}
                      </span>
                    }
                  }
                </app-field-item>
                <app-field-item labelKey="environment.metric.collection">
                  @if (m.collection_rrule) {
                    <app-rule-summary [rrule]="m.collection_rrule" />
                  }
                </app-field-item>
                <app-field-item
                  labelKey="environment.fields.measurementMethod"
                  [value]="m.measurement_method"
                  [multiline]="true"
                  [wide]="true"
                />
                <app-field-item labelKey="environment.metric.details.site" [value]="m.site" />
                <app-field-item
                  labelKey="environment.fields.description"
                  [value]="m.description"
                  [multiline]="true"
                  [wide]="true"
                />
              </app-record-details>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="m.id"
                [canCreate]="perms.write()"
                [entityLabel]="m.code + ' ' + m.name"
              />
            </div>

            <app-supports-requirements
              aside-requirements
              [entityType]="entityType"
              [entityId]="m.id"
              [canEdit]="perms.write()"
              [frameworks]="frameworks"
              (linksChange)="onLinks($event)"
            />

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="environment.fields.owner"
                [value]="m.owner_name"
              />
              <app-field-item
                layout="inline"
                labelKey="environment.fields.department"
                [value]="department()"
              />
              <app-field-item
                layout="inline"
                labelKey="environment.metric.lastValue"
                [value]="m.latest_period_end ? (m.latest_period_end | localDay) : null"
              />
              <app-field-item
                layout="inline"
                labelKey="environment.common.updated"
                [value]="m.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="environment" page="metricDetail" />
            </div>
          </app-record-detail-layout>

          <app-env-measurement-dialog
            [open]="recording()"
            [busy]="acting()"
            [unit]="unit"
            [metricName]="m.code + ' ' + m.name"
            [measurement]="editing()"
            (saved)="saveMeasurement($event)"
            (cancelled)="closeDialog()"
          />
          <app-slide-over
            [open]="!!evidenceFor()"
            [title]="'environment.measurement.evidence' | transloco"
            [subtitle]="evidenceSubtitle()"
            [closeLabel]="'environment.common.close' | transloco"
            (closed)="closeEvidence()"
          >
            @if (evidenceFor(); as x) {
              <p class="mb-3 text-ui text-fg-muted">
                {{ 'environment.measurement.evidenceHint' | transloco }}
              </p>
              <app-attachments
                [entityType]="measurementType"
                [entityId]="x.id"
                [canEdit]="x.can_edit"
              />
            }
          </app-slide-over>
          <app-confirm-dialog
            [open]="deleting()"
            [title]="'environment.metric.deleteTitle' | transloco"
            [message]="'environment.metric.deleteMessage' | transloco: { code: m.code }"
            [confirmLabel]="'environment.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
          <app-confirm-dialog
            [open]="!!deletingMeasurement()"
            [title]="'environment.measurement.deleteTitle' | transloco"
            [message]="'environment.measurement.deleteMessage' | transloco"
            [confirmLabel]="'environment.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="acting()"
            (confirmed)="removeMeasurement()"
            (cancelled)="deletingMeasurement.set(null)"
          />
        }
      }
    }
  `,
})
export class MetricDetail {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly directory = inject(AssigneeOptionsService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly flows = inject(CreateFlowService);

  /** Route param (component input binding): follows navigation between indicators. */
  readonly id = input.required<string>();

  protected readonly perms = injectEnvPermissions();
  protected readonly entityType = ENTITY_METRIC;
  protected readonly measurementType = ENTITY_MEASUREMENT;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = METRIC_FIELD_LABELS;
  protected readonly frameworks = ENV_FRAMEWORKS;
  protected readonly buckets = TREND_BUCKETS;
  /** Measurements are connections too; list the records they serve first. */
  protected readonly connectionsLast: readonly string[] = [ENTITY_MEASUREMENT];
  protected readonly pageSize = MEASUREMENTS_PAGE;
  protected readonly displayUnit = displayUnit;
  protected readonly targetValue = targetBadgeValue;
  protected readonly ref = chipRef;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.errors.notFound');
  protected readonly metric = signal<Metric | null>(null);
  protected readonly bucket = signal<TrendBucket>('month');
  protected readonly trend = signal<Trend | null>(null);
  protected readonly trendFailed = signal(false);
  protected readonly measurements = signal<readonly Measurement[]>([]);
  protected readonly measurementTotal = signal(0);
  protected readonly offset = signal(0);
  protected readonly acting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly recording = signal(false);
  protected readonly editing = signal<Measurement | null>(null);
  protected readonly deletingMeasurement = signal<Measurement | null>(null);
  protected readonly evidenceFor = signal<Measurement | null>(null);
  protected readonly confirmedRefs = signal<readonly string[]>([]);
  /** Bumped after a measurement changes, to reload the trend and the table. */
  private readonly version = signal(0);

  protected readonly highlightMeasurement = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('measurement'))),
    { initialValue: null },
  );

  protected readonly breadcrumbs = computed(() => [
    ENV_ROOT_CRUMB,
    ENV_CRUMBS.metrics,
    { label: this.metric()?.code ?? '' },
  ]);
  protected readonly objectives = computed(() => this.metric()?.objectives ?? []);
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/environment/metrics',
    this.id(),
    'edit',
  ]);
  protected readonly statusKey = computed<MetricStatusKey>(() => {
    const m = this.metric();
    return m ? metricStatusKey(m) : 'no_data';
  });
  protected readonly statusTone = computed(() => METRIC_STATUS_TONE[this.statusKey()]);
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const m = this.metric();
    if (!m || !this.perms.write()) {
      return [];
    }
    return metricMissing(m, {
      editLink: this.editLink(),
      record: this.perms.record() ? () => this.openRecord() : null,
      makeObjective: () => void this.flows.start(FLOWS.metricToObjective, ENTITY_METRIC, m.id),
    });
  });
  protected readonly department = computed(() =>
    departmentName(this.directory, this.metric()?.department_id),
  );
  protected readonly evidenceSubtitle = computed(() => {
    const x = this.evidenceFor();
    if (!x) {
      return '';
    }
    const locale = this.language.locale();
    return `${formatDate(x.period_start, 'mediumDate', locale)} – ${formatDate(x.period_end, 'mediumDate', locale)}`;
  });

  private request = new Subscription();
  private trendRequest = new Subscription();
  private listRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.trendRequest.unsubscribe();
      this.listRequest.unsubscribe();
    });
    providePageContext(() => {
      const m = this.metric();
      return {
        module: ENV_MODULE,
        entityType: ENTITY_METRIC,
        entityId: this.id(),
        view: 'detail',
        title: m ? `${m.code} ${m.name}` : null,
        requirements: this.confirmedRefs().length ? this.confirmedRefs() : null,
      };
    });
    this.directory.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const bucket = this.bucket();
      this.version();
      untracked(() => this.loadTrend(orgId, id, bucket));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const offset = this.offset();
      this.version();
      untracked(() => this.loadMeasurements(orgId, id, offset));
    });
  }

  protected askAi(promptKey: 'explainTrend' | 'targetField' | 'methodField'): void {
    this.ask.askAbout(this.language.translate(`environment.ask.${promptKey}`), undefined, {
      requirements: this.confirmedRefs(),
    });
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.confirmedRefs.set(
      links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
    );
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), true);
    this.bumpVersion();
  }

  protected bumpVersion(): void {
    this.version.update((v) => v + 1);
  }

  protected openRecord(): void {
    this.editing.set(null);
    this.recording.set(true);
  }

  protected openEdit(m: Measurement): void {
    this.editing.set(m);
    this.recording.set(true);
  }

  protected closeDialog(): void {
    this.recording.set(false);
    if (this.editing()) {
      // Files may have been attached: refresh the counts.
      this.bumpVersion();
    }
    this.editing.set(null);
  }

  protected closeEvidence(): void {
    this.evidenceFor.set(null);
    this.bumpVersion();
  }

  protected saveMeasurement(body: MeasurementCreate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.acting()) {
      return;
    }
    const editing = this.editing();
    this.acting.set(true);
    const call = editing
      ? this.api.updateMeasurement(orgId, editing.id, body)
      : this.api.recordMeasurement(orgId, this.id(), body);
    call.subscribe({
      next: (saved) => {
        this.acting.set(false);
        this.recording.set(false);
        this.editing.set(null);
        this.notifications.success(
          editing
            ? 'environment.notices.measurementSaved'
            : 'environment.notices.measurementRecorded',
        );
        this.changed();
        if (!editing) {
          // Offer to attach the invoice or meter photo right away.
          this.evidenceFor.set(saved);
        }
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected removeMeasurement(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.deletingMeasurement();
    if (!orgId || !target) {
      return;
    }
    this.acting.set(true);
    this.api.deleteMeasurement(orgId, target.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deletingMeasurement.set(null);
        this.notifications.success('environment.notices.measurementDeleted');
        this.changed();
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const m = this.metric();
    if (!orgId || !m) {
      return;
    }
    this.acting.set(true);
    this.api.deleteMetric(orgId, m.id).subscribe({
      next: () => {
        this.acting.set(false);
        this.deleting.set(false);
        this.notifications.success('environment.notices.deleted', { code: m.code });
        void this.router.navigate(['/environment/metrics']);
      },
      error: (error: unknown) => {
        this.acting.set(false);
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  private changed(): void {
    this.bumpVersion();
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    if (initial && this.metric()?.id !== id) {
      this.metric.set(null);
      this.confirmedRefs.set([]);
      this.state.set('loading');
    }
    this.request = this.api.getMetric(orgId, id).subscribe({
      next: (m) => {
        this.metric.set(m);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        if (initial) {
          this.errorKey.set(environmentErrorKey(error));
          this.state.set('error');
        }
      },
    });
  }

  private loadTrend(orgId: string | null, id: string, bucket: TrendBucket): void {
    this.trendRequest.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    this.trendFailed.set(false);
    this.trend.set(null);
    this.trendRequest = this.api
      .trend(orgId, id, bucket, localDay(-TREND_WINDOW[bucket]), localDay())
      .subscribe({
        next: (t) => this.trend.set(t),
        error: () => this.trendFailed.set(true),
      });
  }

  private loadMeasurements(orgId: string | null, id: string, offset: number): void {
    this.listRequest.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    this.listRequest = this.api
      .listMeasurements(orgId, id, { limit: MEASUREMENTS_PAGE, offset })
      .subscribe({
        next: (page) => {
          this.measurements.set(page.items);
          this.measurementTotal.set(page.total);
        },
        error: () => {
          this.measurements.set([]);
          this.measurementTotal.set(0);
        },
      });
  }
}
