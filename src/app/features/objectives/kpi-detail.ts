import { formatDate, formatNumber } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
import { codedErrorDetail } from '../../core/deviations/deviation-errors';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { KitApi } from '../../core/kit/kit-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeIn } from '../../core/tasks/task.models';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { EntityChip } from '../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { FormField } from '../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile, KpiTone } from '../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { Pager } from '../../shared/ui/pager/pager';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { KpiChart } from './components/kpi-chart';
import { ObjField } from './components/obj-field';
import { departmentName } from './components/owner-select';
import { ObjectivesApi } from './data/objectives-api';
import { objectivesErrorKey } from './data/objectives-errors';
import {
  ASSIST_EXPLAIN_DEVIATION,
  KpiDetail as KpiDetailDto,
  KpiSeries,
  ManagementSystem,
  Measurement,
} from './data/objectives.models';
import {
  KPI_STATUS_TONE,
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  Period,
  TREND_TONE,
  changeIsBetter,
  completedPeriods,
  healthKey,
  healthSpec,
  isCalendarPeriod,
  kpiNeedsAction,
  kpiStatusKey,
  managementSystemKey,
  parseNumber,
  periodContaining,
  periodLabel,
  previewStatus,
  textOrNull,
  todayIso,
  trendKey,
} from './objectives-display';
import { KPIS_CRUMB, OBJECTIVES_ROOT_CRUMB } from './objectives-nav';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];
const PAGE_SIZE = 12;
/** "Custom period" choice of the period picker. */
const CUSTOM = 'custom';

export const KPI_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'objectives.kpiFields.name',
  description: 'objectives.kpiFields.description',
  objective_id: 'objectives.kpiFields.objective',
  management_system: 'objectives.fields.managementSystem',
  owner_user_id: 'objectives.kpiFields.owner',
  department_id: 'objectives.fields.department',
  unit: 'objectives.kpiFields.unit',
  direction: 'objectives.kpiFields.direction',
  baseline_value: 'objectives.kpiFields.baseline',
  target_value: 'objectives.kpiFields.target',
  warning_value: 'objectives.kpiFields.warning',
  frequency: 'objectives.kpiFields.frequency',
  data_source: 'objectives.kpiFields.dataSource',
  evaluated_by_user_id: 'objectives.kpiFields.evaluatedBy',
  review_forum: 'objectives.kpiFields.reviewForum',
  status: 'objectives.fields.status',
  start_date: 'objectives.kpiFields.startDate',
  measurement_reminders: 'objectives.kpiFields.reminders',
};

const ISO_SYSTEMS: readonly ManagementSystem[] = [
  'iso9001',
  'iso27001',
  'iso14001',
  'iso42001',
  'iso45001',
];

/** The monitoring clause a KPI documents for a system (9.1 in 27001 and 42001, else 9.1.1). */
export function monitoringRef(system: ManagementSystem): string | null {
  if (!ISO_SYSTEMS.includes(system)) {
    return null;
  }
  return system === 'iso27001' || system === 'iso42001' ? `${system}:9.1` : `${system}:9.1.1`;
}

interface MeasurementDraft {
  readonly id: string | null;
  /** The picked period (`start|end`) or `custom`. */
  readonly choice: string;
  readonly period_end: string;
  readonly period_start: string;
  readonly value: string;
  readonly note: string;
}

/** Tone of the share of periods on track (finding 16: not always green). */
export function toneOfShare(share: number | null): KpiTone {
  if (share === null) {
    return 'neutral';
  }
  if (share >= 0.75) {
    return 'pass';
  }
  return share >= 0.5 ? 'warn' : 'fail';
}

/**
 * `/objectives/kpis/:id`: a KPI on the shared detail frame. Its latest value
 * against the target value, what to do when it is off track (deviation, task,
 * adjust the target), the next measurement and its task, the trend chart, the
 * definition, and the measurement log (record with a period picker and a live
 * status preview, correct, delete), plus the shared tabs and aside.
 */
@Component({
  selector: 'app-kpi-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    MarkdownPipe,
    WatchButton,
    AiAssistButton,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    EntityTasks,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    FieldList,
    FormField,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    MenuItem,
    Pager,
    SlideOver,
    StatusBadge,
    KpiChart,
    ObjField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8"><app-loading-state [rows]="6" /></div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-7 sm:px-8" data-testid="kpi-not-found">
          <app-empty-state
            icon="search"
            titleKey="objectives.common.notFoundTitle"
            bodyKey="objectives.common.notFound"
            ctaKey="objectives.common.backToKpis"
            ctaLink="/objectives/kpis"
            ctaVariant="secondary"
          />
        </div>
      }
      @case ('ready') {
        @if (kpi(); as k) {
          @let h = health(k.last_status);
          <app-record-detail-layout
            entityType="kpi"
            [entityId]="k.id"
            [title]="k.name"
            [breadcrumbs]="breadcrumbs()"
            [tabs]="tabs"
            [requirementsPanel]="true"
            [canEdit]="k.can_edit"
            [fieldLabels]="fieldLabels"
          >
            <ng-container meta>
              <span class="font-mono">{{ k.code }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="h.meaning"
                [value]="h.value"
                [labelKey]="healthKey(k.last_status)"
              />
              @if (k.status !== 'active') {
                <app-status-badge
                  [meaning]="statusTone[k.status].meaning"
                  [value]="statusTone[k.status].value"
                  [labelKey]="statusKey(k.status)"
                />
              }
              @if (k.measurement_overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="objectives.kpi.measurementOverdue"
                />
              }
              @if (k.objective; as obj) {
                <span class="inline-flex items-center gap-1 text-meta text-fg-muted">
                  {{ 'objectives.kpi.belongsTo' | transloco }}
                  <app-entity-chip [ref]="objectiveRef()!" [showType]="false" />
                </span>
              }
            </ng-container>

            @if (canRecord()) {
              <app-button primary (click)="openRecord()" data-testid="record-measurement">
                <app-icon name="plus" [size]="15" />
                {{ 'objectives.kpi.record' | transloco }}
              </app-button>
            }
            @if (k.can_edit) {
              <app-button secondary variant="secondary" (click)="edit()" data-testid="kpi-edit">
                {{ 'objectives.detail.edit' | transloco }}
              </app-button>
            }
            <app-watch-button secondary entityType="kpi" [entityId]="k.id" />
            <button appMenuItem overflow type="button" (click)="askAbout()">
              {{ 'objectives.ai.summariseKpi' | transloco }}
            </button>
            @if (k.can_delete) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="pendingDelete.set('kpi')"
              >
                {{ 'objectives.detail.delete' | transloco }}
              </button>
            }

            <app-help-strip help [scope]="scope" page="kpiDetail" lesson="good-kpis" />

            <div class="flex flex-col gap-4">
              @if (needsAction()) {
                <section
                  class="rounded-card border p-4"
                  [class]="
                    k.last_status === 'off_track'
                      ? 'border-fail/30 bg-fail-soft'
                      : 'border-warn/30 bg-warn-soft'
                  "
                  data-testid="kpi-attention"
                  [attr.aria-label]="'objectives.attention.label' | transloco"
                >
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'objectives.attention.' + k.last_status + '.title' | transloco }}
                  </h2>
                  <p class="mt-1 text-ui text-fg">
                    {{ 'objectives.attention.body' | transloco: attentionParams() }}
                  </p>
                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    @if (flowEnabled('kpi.to_deviation')) {
                      <app-button
                        size="sm"
                        (click)="startFlow('kpi.to_deviation')"
                        data-testid="kpi-to-deviation"
                      >
                        {{ 'objectives.attention.deviation' | transloco }}
                      </app-button>
                    }
                    @if (flowEnabled('kpi.to_task')) {
                      <app-button
                        size="sm"
                        variant="secondary"
                        (click)="startFlow('kpi.to_task')"
                        data-testid="kpi-to-task"
                      >
                        {{ 'objectives.attention.task' | transloco }}
                      </app-button>
                    }
                    @if (k.can_edit) {
                      <app-button
                        size="sm"
                        variant="ghost"
                        (click)="edit('target')"
                        data-testid="kpi-adjust-target"
                      >
                        {{ 'objectives.attention.adjustTarget' | transloco }}
                      </app-button>
                    }
                    <app-ai-assist-button
                      [assist]="explainAssist"
                      labelKey="objectives.ai.explainDeviation"
                      entityType="kpi"
                      [entityId]="k.id"
                      [input]="{ kpi_id: k.id }"
                      (text)="explanation.set($event)"
                      (failed)="explanation.set(null)"
                    />
                  </div>
                  @if (explanation(); as text) {
                    <div
                      class="mt-3 rounded-tile border border-border bg-surface p-3"
                      data-testid="deviation-explanation"
                      aria-live="polite"
                    >
                      <p class="mb-1 text-meta font-semibold text-fg-muted">
                        {{ 'objectives.ai.explanationLabel' | transloco }}
                      </p>
                      <div
                        class="cf-markdown text-body text-fg"
                        [innerHTML]="text | appMarkdown"
                      ></div>
                    </div>
                  }
                </section>
              }

              <section
                class="grid grid-cols-2 gap-3 lg:grid-cols-4"
                [attr.aria-label]="'objectives.kpi.statsLabel' | transloco"
              >
                <app-kpi-tile
                  [label]="'objectives.kpi.latest' | transloco"
                  [value]="valueText(k.last_value)"
                  [tone]="toneOfLatest()"
                  [delta]="targetText()"
                  deltaTone="neutral"
                />
                <app-kpi-tile
                  [label]="'objectives.kpi.change' | transloco"
                  [value]="changeText()"
                  [delta]="changeDelta()"
                  [tone]="toneOfChange()"
                />
                <app-kpi-tile
                  [label]="'objectives.kpi.trend' | transloco"
                  [value]="trendLabel()"
                  [tone]="toneOfTrend()"
                />
                <app-kpi-tile
                  [label]="'objectives.kpi.onTrackShare' | transloco"
                  [value]="onTrackText()"
                  [tone]="toneOfOnTrack()"
                  [delta]="onTrackDelta()"
                  deltaTone="neutral"
                />
              </section>

              <app-card data-testid="kpi-next-measurement">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h2 class="font-display text-card font-bold text-fg">
                      {{ 'objectives.kpi.nextHeading' | transloco }}
                    </h2>
                    @if (nextLabel(); as label) {
                      <p class="mt-1 text-body text-fg">
                        {{ 'objectives.kpi.nextPeriod' | transloco: { period: label } }}
                        @if (k.next_due_date) {
                          <span
                            [class.text-warn-ink]="k.measurement_overdue"
                            [class.font-semibold]="k.measurement_overdue"
                          >
                            ·
                            {{
                              'objectives.kpi.dueOn'
                                | transloco: { date: (k.next_due_date | localDay) }
                            }}
                            @if (k.measurement_overdue) {
                              · {{ 'objectives.common.overdue' | transloco }}
                            }
                          </span>
                        }
                      </p>
                    } @else if (k.status !== 'active') {
                      <p class="mt-1 text-body text-fg-muted">
                        {{ 'objectives.kpi.notActive' | transloco }}
                      </p>
                    }
                    <p class="mt-1 text-meta text-fg-muted">
                      @if (k.measurement_task; as task) {
                        {{
                          'objectives.kpi.taskFor'
                            | transloco
                              : { name: task.assignee?.name ?? ('common.empty.none' | transloco) }
                        }}
                        <a
                          [routerLink]="task.url"
                          class="font-semibold text-accent hover:underline"
                          >{{ task.title }}</a
                        >
                        @if (task.due_at) {
                          ·
                          {{
                            'objectives.kpi.dueOn'
                              | transloco: { date: (task.due_at | localDate: 'mediumDate') }
                          }}
                        }
                      } @else if (k.measurement_reminders) {
                        {{ 'objectives.kpi.noTask' | transloco }}
                      } @else {
                        {{ 'objectives.kpi.remindersOff' | transloco }}
                      }
                    </p>
                  </div>
                  @if (canRecord()) {
                    <app-button size="sm" variant="secondary" (click)="openRecord()">
                      {{ 'objectives.kpi.recordNow' | transloco }}
                    </app-button>
                  }
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-2 font-display text-card font-bold text-fg">
                  {{ 'objectives.kpi.chartHeading' | transloco }}
                </h2>
                <app-kpi-chart [series]="series()" />
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'objectives.kpi.definition' | transloco }}
                </h2>
                <app-field-list [columns]="3">
                  <app-field-item
                    labelKey="objectives.kpiFields.direction"
                    [value]="'objectives.direction.' + k.direction | transloco"
                  />
                  <app-field-item
                    labelKey="objectives.kpiFields.frequency"
                    [value]="'objectives.frequency.' + k.frequency | transloco"
                  />
                  <app-field-item
                    labelKey="objectives.kpiFields.startDate"
                    [value]="k.start_date | localDay"
                  />
                  <app-field-item
                    labelKey="objectives.kpiFields.baseline"
                    [value]="valueOrNull(k.baseline_value)"
                  />
                  <app-field-item
                    labelKey="objectives.kpiFields.target"
                    [value]="valueOrNull(k.target_value)"
                  />
                  <app-field-item
                    labelKey="objectives.kpiFields.warning"
                    [value]="valueOrNull(k.warning_value)"
                  />
                  <app-field-item labelKey="objectives.kpiFields.owner" [value]="k.owner?.name" />
                  <app-field-item
                    labelKey="objectives.kpiFields.evaluatedBy"
                    [value]="k.evaluated_by?.name"
                  />
                  <app-field-item
                    labelKey="objectives.kpiFields.reviewForum"
                    [value]="k.review_forum ?? null"
                  />
                  <app-field-item labelKey="objectives.fields.department" [value]="department()" />
                  <app-field-item
                    labelKey="objectives.fields.managementSystem"
                    [value]="
                      k.management_system ? (systemKey(k.management_system) | transloco) : null
                    "
                  />
                  <app-field-item
                    labelKey="objectives.kpiFields.dataSource"
                    [value]="k.data_source"
                  />
                  @if (k.description) {
                    <app-field-item labelKey="objectives.kpiFields.description" [wide]="true">
                      <div class="cf-markdown" [innerHTML]="k.description | appMarkdown"></div>
                    </app-field-item>
                  }
                </app-field-list>
              </app-card>

              <app-card [padded]="false">
                <h2 class="px-5 pt-4 pb-2 font-display text-card font-bold text-fg">
                  {{ 'objectives.kpi.measurements' | transloco }}
                </h2>
                @if (measurements().length === 0) {
                  <p class="px-5 pb-4 text-body text-fg-muted">
                    {{ 'objectives.kpi.noMeasurements' | transloco }}
                  </p>
                } @else {
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-ui" data-testid="measurements-table">
                      <caption class="sr-only">
                        {{
                          'objectives.kpi.measurements' | transloco
                        }}
                      </caption>
                      <thead class="border-y border-border text-meta text-fg-muted">
                        <tr>
                          <th scope="col" class="px-4 py-2 font-semibold">
                            {{ 'objectives.measurement.period' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2 text-right font-semibold">
                            {{ 'objectives.measurement.value' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2 font-semibold">
                            {{ 'objectives.measurement.status' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2 font-semibold">
                            {{ 'objectives.measurement.note' | transloco }}
                          </th>
                          <th scope="col" class="hidden px-4 py-2 font-semibold md:table-cell">
                            {{ 'objectives.measurement.recorded' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2">
                            <span class="sr-only">{{
                              'objectives.measurement.actions' | transloco
                            }}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border">
                        @for (m of measurements(); track m.id) {
                          @let mh = health(m.status);
                          <tr class="align-top">
                            <td class="px-4 py-2.5 whitespace-nowrap">
                              <span class="font-semibold text-fg">{{ periodText(m) }}</span>
                              @if (!calendar(m)) {
                                <span class="block text-meta text-fg-subtle"
                                  >{{ m.period_start | localDay }} –
                                  {{ m.period_end | localDay }}</span
                                >
                              }
                            </td>
                            <td class="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                              {{ m.value | localNumber: '1.0-2' }} {{ k.unit }}
                            </td>
                            <td class="px-4 py-2.5">
                              <app-status-badge
                                [meaning]="mh.meaning"
                                [value]="mh.value"
                                [labelKey]="healthKey(m.status)"
                              />
                            </td>
                            <td class="max-w-[280px] min-w-[160px] px-4 py-2.5 text-fg-muted">
                              @if (m.note) {
                                @if (expanded().has(m.id) || m.note.length <= 80) {
                                  <span class="whitespace-pre-line">{{ m.note }}</span>
                                } @else {
                                  <span>{{ m.note.slice(0, 80) }}…</span>
                                  <button
                                    type="button"
                                    class="ml-1 font-semibold text-accent hover:underline"
                                    (click)="expand(m.id)"
                                  >
                                    {{ 'objectives.measurement.showMore' | transloco }}
                                  </button>
                                }
                              } @else {
                                <span class="text-fg-subtle">—</span>
                              }
                            </td>
                            <td
                              class="hidden px-4 py-2.5 text-meta whitespace-nowrap text-fg-muted md:table-cell"
                            >
                              {{ m.created_at | localDate: 'mediumDate' }}
                              @if (m.recorded_by) {
                                <span class="block">{{ m.recorded_by.name }}</span>
                              }
                            </td>
                            <td class="px-2 py-1.5 text-right whitespace-nowrap">
                              @if (m.can_edit) {
                                <button
                                  type="button"
                                  class="inline-flex h-8 items-center rounded-tile px-2 text-ui font-semibold text-accent hover:bg-accent-soft"
                                  [attr.aria-label]="
                                    'objectives.measurement.editLabel'
                                      | transloco: { period: periodText(m) }
                                  "
                                  (click)="openEdit(m)"
                                >
                                  {{ 'objectives.measurement.edit' | transloco }}
                                </button>
                                <button
                                  type="button"
                                  class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-fail-soft hover:text-fail-ink"
                                  [attr.aria-label]="
                                    'objectives.measurement.deleteLabel'
                                      | transloco: { period: periodText(m) }
                                  "
                                  (click)="pendingDelete.set(m)"
                                >
                                  <app-icon name="trash" [size]="16" />
                                </button>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  @if (measurementTotal() > pageSize) {
                    <div class="border-t border-border px-4 py-2.5">
                      <app-pager
                        [offset]="offset()"
                        [pageSize]="pageSize"
                        [count]="measurements().length"
                        [total]="measurementTotal()"
                        (pageChange)="offset.set($event)"
                      />
                    </div>
                  }
                }
              </app-card>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="kpi"
                [entityId]="k.id"
                [canCreate]="k.can_edit"
                [defaultAssignee]="defaultAssignee()"
                [entityLabel]="k.code + ' ' + k.name"
              />
            </div>

            <div aside-learn>
              <app-why-it-matters [scope]="scope" page="kpiDetail" />
            </div>
          </app-record-detail-layout>

          <app-slide-over
            [open]="draft() !== null"
            [title]="
              (draft()?.id ? 'objectives.measurement.editTitle' : 'objectives.measurement.newTitle')
                | transloco
            "
            [subtitle]="k.code + ' ' + k.name"
            [closeLabel]="'common.cancel' | transloco"
            (closed)="closeDraft()"
          >
            @if (draft(); as d) {
              <form
                class="flex flex-col gap-4"
                novalidate
                (submit)="$event.preventDefault(); saveDraft()"
                data-testid="measurement-form"
              >
                @if (draftError(); as key) {
                  <app-alert tone="error">{{ key | transloco }}</app-alert>
                }
                <div
                  class="rounded-tile border border-border bg-surface-2 px-3 py-2 text-ui text-fg"
                  data-testid="measurement-thresholds"
                >
                  {{ thresholdsText() }}
                </div>

                @if (d.id) {
                  <div>
                    <p class="text-ui font-semibold text-fg-muted">
                      {{ 'objectives.measurement.period' | transloco }}
                    </p>
                    <p class="mt-1 text-body text-fg">{{ draftPeriodLabel() }}</p>
                  </div>
                } @else {
                  <div>
                    <app-obj-field
                      [label]="'objectives.measurement.periodPick' | transloco"
                      inputId="m-period"
                      page="measurement"
                      help="period"
                    >
                      <select
                        id="m-period"
                        (change)="pickPeriod($any($event.target).value)"
                        data-testid="measurement-period"
                      >
                        @for (p of periodChoices(); track p.value) {
                          <option [value]="p.value" [selected]="d.choice === p.value">
                            {{ p.label }}
                          </option>
                        }
                        <option [value]="custom" [selected]="d.choice === custom">
                          {{ 'objectives.measurement.customPeriod' | transloco }}
                        </option>
                      </select>
                    </app-obj-field>
                  </div>
                  @if (d.choice === custom) {
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <app-form-field
                        [label]="'objectives.measurement.periodStart' | transloco"
                        inputId="m-period-start"
                      >
                        <input
                          id="m-period-start"
                          type="date"
                          [max]="d.period_end || today"
                          [value]="d.period_start"
                          (change)="patchDraft({ period_start: $any($event.target).value })"
                        />
                      </app-form-field>
                      <app-form-field
                        [label]="'objectives.measurement.periodEnd' | transloco"
                        inputId="m-period-end"
                      >
                        <input
                          id="m-period-end"
                          type="date"
                          required
                          [max]="today"
                          [value]="d.period_end"
                          (change)="patchDraft({ period_end: $any($event.target).value })"
                        />
                      </app-form-field>
                    </div>
                  }
                }

                <div>
                  <app-obj-field
                    page="measurement"
                    help="value"
                    [label]="
                      k.unit
                        ? ('objectives.measurement.valueWithUnit' | transloco: { unit: k.unit })
                        : ('objectives.measurement.value' | transloco)
                    "
                    inputId="m-value"
                  >
                    <input
                      id="m-value"
                      type="text"
                      inputmode="decimal"
                      required
                      autocomplete="off"
                      [attr.aria-invalid]="draftValueInvalid() || null"
                      [value]="d.value"
                      (input)="patchDraft({ value: $any($event.target).value })"
                    />
                  </app-obj-field>
                  @if (draftValueInvalid()) {
                    <p class="mt-1 text-meta text-fail-ink">
                      {{ 'objectives.errors.invalid_number' | transloco }}
                    </p>
                  }
                  @if (preview(); as p) {
                    @let ph = health(p);
                    <p
                      class="mt-2 flex items-center gap-2 text-meta text-fg-muted"
                      aria-live="polite"
                      data-testid="measurement-preview"
                    >
                      {{ 'objectives.measurement.preview' | transloco }}
                      <app-status-badge
                        [meaning]="ph.meaning"
                        [value]="ph.value"
                        [labelKey]="healthKey(p)"
                      />
                    </p>
                  }
                </div>
                <div>
                  <app-obj-field
                    [label]="'objectives.measurement.note' | transloco"
                    inputId="m-note"
                    page="measurement"
                    help="note"
                  >
                    <textarea
                      id="m-note"
                      rows="3"
                      maxlength="5000"
                      [value]="d.note"
                      (input)="patchDraft({ note: $any($event.target).value })"
                    ></textarea>
                  </app-obj-field>
                </div>
                <p class="text-meta text-fg-muted">
                  {{ 'objectives.measurement.evidenceHint' | transloco }}
                </p>
                <div
                  class="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface pt-3"
                >
                  <app-button variant="secondary" (click)="closeDraft()">{{
                    'common.cancel' | transloco
                  }}</app-button>
                  <app-button type="submit" [loading]="busy()" [disabled]="busy()">{{
                    'objectives.measurement.save' | transloco
                  }}</app-button>
                </div>
              </form>
            }
          </app-slide-over>

          <app-confirm-dialog
            [open]="pendingDelete() !== null"
            [title]="
              (pendingDelete() === 'kpi'
                ? 'objectives.kpi.deleteTitle'
                : 'objectives.measurement.deleteTitle'
              ) | transloco
            "
            [message]="
              (pendingDelete() === 'kpi'
                ? 'objectives.kpi.deleteMessage'
                : 'objectives.measurement.deleteMessage'
              ) | transloco: { code: k.code }
            "
            [confirmLabel]="'objectives.detail.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="confirmDelete()"
            (cancelled)="pendingDelete.set(null)"
          />
        }
      }
    }
  `,
})
export class KpiDetail {
  private readonly api = inject(ObjectivesApi);
  private readonly kit = inject(KitApi);
  private readonly flows = inject(CreateFlowService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly options = inject(AssigneeOptionsService);

  readonly id = input.required<string>();

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly tabs = TABS;
  protected readonly fieldLabels = KPI_FIELD_LABELS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly custom = CUSTOM;
  protected readonly explainAssist = ASSIST_EXPLAIN_DEVIATION;
  protected readonly today = todayIso();
  protected readonly statusKey = kpiStatusKey;
  protected readonly statusTone = KPI_STATUS_TONE;
  protected readonly healthKey = healthKey;
  protected readonly health = healthSpec;
  protected readonly systemKey = managementSystemKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly kpi = signal<KpiDetailDto | null>(null);
  protected readonly series = signal<KpiSeries | null>(null);
  protected readonly measurements = signal<readonly Measurement[]>([]);
  protected readonly measurementTotal = signal(0);
  protected readonly offset = signal(0);
  protected readonly explanation = signal<string | null>(null);
  protected readonly draft = signal<MeasurementDraft | null>(null);
  protected readonly draftError = signal<string | null>(null);
  protected readonly draftSubmitted = signal(false);
  protected readonly pendingDelete = signal<'kpi' | Measurement | null>(null);
  protected readonly busy = signal(false);
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  private readonly enabledFlows = signal<ReadonlySet<string>>(new Set());

  protected readonly breadcrumbs = computed(() => [
    OBJECTIVES_ROOT_CRUMB,
    KPIS_CRUMB,
    { label: this.kpi()?.code ?? '' },
  ]);
  protected readonly canRecord = computed(() => {
    const k = this.kpi();
    return !!k && k.can_measure && k.status !== 'retired';
  });
  protected readonly needsAction = computed(() => {
    const k = this.kpi();
    return !!k && kpiNeedsAction(k);
  });
  protected readonly objectiveRef = computed(() => {
    const o = this.kpi()?.objective;
    return o
      ? {
          entity_type: 'objective',
          entity_id: o.id,
          title: o.title,
          code: o.code,
          url: `/objectives/${o.id}`,
        }
      : null;
  });
  protected readonly requirementRefs = computed(() => {
    const system = this.kpi()?.management_system;
    const ref = system ? monitoringRef(system) : null;
    return ref ? [ref] : [];
  });
  protected readonly department = computed(() =>
    departmentName(this.options, this.kpi()?.department_id ?? null),
  );
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const owner = this.kpi()?.owner;
    return owner ? { type: 'user', value: owner.id } : null;
  });
  protected readonly draftValueInvalid = computed(() => {
    const d = this.draft();
    if (!d || (!this.draftSubmitted() && !d.value.trim())) {
      return false;
    }
    const n = parseNumber(d.value);
    return n === null || Number.isNaN(n);
  });
  protected readonly preview = computed(() => {
    const d = this.draft();
    const k = this.kpi();
    if (!d || !k) {
      return null;
    }
    return previewStatus(parseNumber(d.value), k.direction, k.target_value, k.warning_value);
  });

  protected readonly toneOfLatest = computed<KpiTone>(() => {
    const status = this.kpi()?.last_status;
    return status === 'on_track'
      ? 'pass'
      : status === 'at_risk'
        ? 'warn'
        : status === 'off_track'
          ? 'fail'
          : 'neutral';
  });
  protected readonly targetText = computed(() => {
    const k = this.kpi();
    return k?.target_value != null
      ? this.language.translate('objectives.kpi.targetIs', {
          value: this.valueText(k.target_value),
        })
      : '';
  });
  private readonly better = computed(() => {
    const change = this.series()?.stats.change ?? null;
    return changeIsBetter(change, this.kpi()?.direction ?? 'higher');
  });
  protected readonly changeText = computed(() => {
    const change = this.series()?.stats.change;
    if (change == null) {
      return '—';
    }
    return `${change > 0 ? '+' : ''}${this.num(change)}`;
  });
  protected readonly changeDelta = computed(() => {
    const pct = this.series()?.stats.change_pct;
    const better = this.better();
    const parts: string[] = [];
    if (pct != null) {
      parts.push(`${pct > 0 ? '+' : ''}${this.num(pct)} %`);
    }
    if (better !== null) {
      parts.push(
        this.language.translate(better ? 'objectives.kpi.better' : 'objectives.kpi.worse'),
      );
    }
    return parts.join(' · ');
  });
  protected readonly toneOfChange = computed<KpiTone>(() => {
    const better = this.better();
    return better === null ? 'neutral' : better ? 'pass' : 'fail';
  });
  protected readonly trendLabel = computed(() =>
    this.language.translate(trendKey(this.series()?.stats.trend ?? 'insufficient_data')),
  );
  protected readonly toneOfTrend = computed<KpiTone>(() => {
    const spec = TREND_TONE[this.series()?.stats.trend ?? 'insufficient_data'];
    return spec.value === 'met' ? 'pass' : spec.value === 'not_met' ? 'fail' : 'neutral';
  });
  protected readonly onTrackText = computed(() => {
    const share = this.series()?.stats.on_track_share;
    return share == null ? '—' : `${this.num(share * 100, '1.0-0')} %`;
  });
  protected readonly toneOfOnTrack = computed(() =>
    toneOfShare(this.series()?.stats.on_track_share ?? null),
  );
  protected readonly onTrackDelta = computed(() => {
    const count = this.series()?.stats.count ?? 0;
    return count ? this.language.translate('objectives.kpi.ofPeriods', { count }) : '';
  });
  protected readonly attentionParams = computed(() => {
    const k = this.kpi();
    return {
      value: this.valueText(k?.last_value ?? null),
      target: this.valueText(k?.target_value ?? null),
      period: k?.last_period_end ? this.labelFor({ start: '', end: k.last_period_end }) : '—',
    };
  });
  protected readonly nextLabel = computed(() => {
    const k = this.kpi();
    if (!k || k.status !== 'active') {
      return null;
    }
    if (k.next_period) {
      return this.labelFor(k.next_period);
    }
    return null;
  });
  protected readonly thresholdsText = computed(() => {
    const k = this.kpi();
    if (!k) {
      return '';
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [t(`objectives.direction.${k.direction}`)];
    if (k.target_value !== null) {
      parts.push(t('objectives.kpi.targetIs', { value: this.valueText(k.target_value) }));
    }
    if (k.warning_value !== null) {
      parts.push(t('objectives.kpi.warningIs', { value: this.valueText(k.warning_value) }));
    }
    return parts.join(' · ');
  });

  /** Completed calendar periods, newest first; ones already recorded are marked. */
  protected readonly periodChoices = computed(() => {
    const k = this.kpi();
    if (!k) {
      return [];
    }
    const recorded = new Set(this.measurements().map((m) => m.period_end));
    return completedPeriods(k.frequency, this.today, 12).map((p) => ({
      value: `${p.start}|${p.end}`,
      label: recorded.has(p.end)
        ? this.language.translate('objectives.measurement.recordedPeriod', {
            period: this.labelFor(p),
          })
        : this.labelFor(p),
      recorded: recorded.has(p.end),
      period: p,
    }));
  });
  protected readonly draftPeriodLabel = computed(() => {
    const d = this.draft();
    return d ? this.labelFor({ start: d.period_start, end: d.period_end }) : '';
  });

  private request = new Subscription();
  private measurementsRequest = new Subscription();
  private flowsRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.measurementsRequest.unsubscribe();
      this.flowsRequest.unsubscribe();
    });
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'kpi',
      entityId: this.id(),
      view: 'detail',
      title: this.kpi()?.name ?? null,
      requirements: this.requirementRefs(),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const offset = this.offset();
      untracked(() => this.loadMeasurements(orgId, id, offset));
    });
  }

  protected valueText(value: number | null): string {
    if (value === null || value === undefined) {
      return '—';
    }
    const unit = this.kpi()?.unit;
    return unit ? `${this.num(value)} ${unit}` : this.num(value);
  }

  protected valueOrNull(value: number | null): string | null {
    return value === null ? null : this.valueText(value);
  }

  private num(value: number, digits = '1.0-2'): string {
    return formatNumber(value, this.language.locale(), digits);
  }

  /** A period in words: "oktober 2026", or the two dates for a non-calendar period. */
  private labelFor(period: Period): string {
    const k = this.kpi();
    if (!k || !period.end) {
      return '';
    }
    const p = period.start ? period : periodContaining(k.frequency, period.end);
    const locale = this.language.locale();
    if (isCalendarPeriod(k.frequency, p)) {
      return periodLabel(k.frequency, p, locale, (key, params) =>
        this.language.translate(key, params),
      );
    }
    return `${formatDate(p.start, 'mediumDate', locale)} – ${formatDate(p.end, 'mediumDate', locale)}`;
  }

  protected calendar(m: Measurement): boolean {
    const k = this.kpi();
    return !!k && isCalendarPeriod(k.frequency, { start: m.period_start, end: m.period_end });
  }

  protected periodText(m: Measurement): string {
    return this.labelFor({ start: m.period_start, end: m.period_end });
  }

  protected expand(id: string): void {
    this.expanded.update((s) => new Set([...s, id]));
  }

  protected flowEnabled(key: string): boolean {
    return this.enabledFlows().has(key);
  }

  protected startFlow(key: string): void {
    void this.flows.start(key, 'kpi', this.id());
  }

  protected edit(focus?: string): void {
    void this.router.navigate(['/objectives/kpis', this.id(), 'edit'], {
      queryParams: focus ? { focus } : {},
    });
  }

  protected askAbout(): void {
    const k = this.kpi();
    if (k) {
      this.ask.showWith(
        this.language.translate('objectives.ai.prompts.summariseKpi', {
          code: k.code,
          title: k.name,
        }),
      );
    }
  }

  /** Open the slide-over on the first completed period that has no value yet. */
  protected openRecord(): void {
    const k = this.kpi();
    this.draftSubmitted.set(false);
    this.draftError.set(null);
    const choices = this.periodChoices();
    const next = k?.next_period;
    const preferred =
      (next?.complete
        ? choices.find((c) => c.period.end === next.end && !c.recorded)
        : undefined) ??
      choices.find((c) => !c.recorded) ??
      choices[0];
    if (!preferred) {
      this.draft.set({
        id: null,
        choice: CUSTOM,
        period_end: this.today,
        period_start: '',
        value: '',
        note: '',
      });
      return;
    }
    this.draft.set({
      id: null,
      choice: preferred.value,
      period_start: preferred.period.start,
      period_end: preferred.period.end,
      value: '',
      note: '',
    });
  }

  protected pickPeriod(value: string): void {
    if (value === CUSTOM) {
      this.patchDraft({ choice: CUSTOM });
      return;
    }
    const [start, end] = value.split('|');
    this.patchDraft({ choice: value, period_start: start, period_end: end });
  }

  protected openEdit(m: Measurement): void {
    this.draftSubmitted.set(false);
    this.draftError.set(null);
    this.draft.set({
      id: m.id,
      choice: `${m.period_start}|${m.period_end}`,
      period_end: m.period_end,
      period_start: m.period_start,
      value: String(m.value),
      note: m.note ?? '',
    });
  }

  protected patchDraft(patch: Partial<MeasurementDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  protected closeDraft(): void {
    if (!this.busy()) {
      this.draft.set(null);
    }
  }

  protected saveDraft(): void {
    this.draftSubmitted.set(true);
    const d = this.draft();
    const orgId = this.selectedOrg.currentOrgId();
    const value = d ? parseNumber(d.value) : null;
    if (!d || !orgId || this.busy() || value === null || Number.isNaN(value) || !d.period_end) {
      return;
    }
    this.busy.set(true);
    this.draftError.set(null);
    const call = d.id
      ? this.api.updateMeasurement(orgId, this.id(), d.id, {
          value,
          note: textOrNull(d.note),
        })
      : this.api.createMeasurement(orgId, this.id(), {
          period_end: d.period_end,
          period_start: d.period_start || null,
          value,
          note: textOrNull(d.note),
        });
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.draft.set(null);
        this.notifications.success(
          d.id ? 'objectives.notices.measurementSaved' : 'objectives.notices.measured',
        );
        this.refresh();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.draftError.set(objectivesErrorKey(error));
        this.offerExisting(error);
      },
    });
  }

  protected confirmDelete(): void {
    const pending = this.pendingDelete();
    const orgId = this.selectedOrg.currentOrgId();
    if (!pending || !orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    const call =
      pending === 'kpi'
        ? this.api.deleteKpi(orgId, this.id())
        : this.api.deleteMeasurement(orgId, this.id(), pending.id);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.pendingDelete.set(null);
        if (pending === 'kpi') {
          this.notifications.success('objectives.notices.kpiDeleted');
          void this.router.navigate(['/objectives/kpis']);
        } else {
          this.notifications.success('objectives.notices.measurementDeleted');
          this.refresh();
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.pendingDelete.set(null);
        this.notifications.error(objectivesErrorKey(error));
      },
    });
  }

  /** On a 409 `measurement_exists`, switch the form to editing that period's measurement. */
  private offerExisting(error: unknown): void {
    if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
      return;
    }
    const detail = codedErrorDetail(error);
    const raw = (error.error as { detail?: { measurement_id?: unknown } } | null)?.detail;
    const existingId = typeof raw?.measurement_id === 'string' ? raw.measurement_id : null;
    if (detail?.code !== 'measurement_exists' || !existingId) {
      return;
    }
    const existing = this.measurements().find((m) => m.id === existingId);
    const draft = this.draft();
    if (existing && draft) {
      this.draft.set({
        ...draft,
        id: existing.id,
        period_start: existing.period_start,
        period_end: existing.period_end,
      });
    }
  }

  private refresh(): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.explanation.set(null);
    this.reloadKpi(orgId, this.id());
    this.loadMeasurements(orgId, this.id(), this.offset());
  }

  private reloadKpi(orgId: string | null, id: string): void {
    if (!orgId) {
      return;
    }
    this.api.getKpi(orgId, id).subscribe({ next: (k) => this.kpi.set(k), error: () => undefined });
    this.api
      .series(orgId, id)
      .subscribe({ next: (s) => this.series.set(s), error: () => undefined });
  }

  private loadFlows(orgId: string, id: string): void {
    this.flowsRequest.unsubscribe();
    this.flowsRequest = this.kit.createFlows(orgId, 'kpi', { entityId: id }).subscribe({
      next: (list) =>
        this.enabledFlows.set(
          new Set(
            (Array.isArray(list?.items) ? list.items : [])
              .filter((f) => f?.enabled)
              .map((f) => f.key),
          ),
        ),
      error: () => this.enabledFlows.set(new Set()),
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.explanation.set(null);
    this.request = this.api.getKpi(orgId, id).subscribe({
      next: (k) => {
        this.kpi.set(k);
        this.state.set('ready');
        this.loadFlows(orgId, id);
        this.api.series(orgId, id).subscribe({
          next: (s) => this.series.set(s),
          error: () => this.series.set(null),
        });
      },
      error: () => this.state.set('error'),
    });
  }

  private loadMeasurements(orgId: string | null, id: string, offset: number): void {
    this.measurementsRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.measurementsRequest = this.api
      .listMeasurements(orgId, id, { limit: PAGE_SIZE, offset })
      .subscribe({
        next: (page) => {
          this.measurements.set(page.items);
          this.measurementTotal.set(page.total);
        },
        error: () => this.measurements.set([]),
      });
  }
}
