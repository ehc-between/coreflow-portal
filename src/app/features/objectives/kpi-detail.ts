import { formatNumber } from '@angular/common';
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
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AssigneeIn } from '../../core/tasks/task.models';
import { AskPanelService } from '../ask/ask-panel.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import { Pager } from '../../shared/ui/pager/pager';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { codedErrorDetail } from '../../core/deviations/deviation-errors';
import { KpiChart } from './components/kpi-chart';
import { departmentName } from './components/owner-select';
import { ObjectivesApi } from './data/objectives-api';
import { objectivesErrorKey } from './data/objectives-errors';
import {
  ASSIST_EXPLAIN_DEVIATION,
  KpiDetail as KpiDetailDto,
  KpiSeries,
  Measurement,
} from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  healthKey,
  healthTone,
  kpiStatusKey,
  kpiStatusTone,
  managementSystemKey,
  parseNumber,
  textOrNull,
  todayIso,
  trendKey,
  trendTone,
} from './objectives-display';

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

export const KPI_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'objectives.kpiFields.name',
  description: 'objectives.kpiFields.description',
  objective_id: 'objectives.kpiFields.objective',
  management_system: 'objectives.fields.managementSystem',
  owner_user_id: 'objectives.fields.owner',
  department_id: 'objectives.fields.department',
  unit: 'objectives.kpiFields.unit',
  direction: 'objectives.kpiFields.direction',
  baseline_value: 'objectives.kpiFields.baseline',
  target_value: 'objectives.kpiFields.target',
  warning_value: 'objectives.kpiFields.warning',
  frequency: 'objectives.kpiFields.frequency',
  data_source: 'objectives.kpiFields.dataSource',
  status: 'objectives.fields.status',
  start_date: 'objectives.kpiFields.startDate',
  measurement_reminders: 'objectives.kpiFields.reminders',
};

interface MeasurementDraft {
  readonly id: string | null;
  readonly period_end: string;
  readonly period_start: string;
  readonly value: string;
  readonly note: string;
}

/**
 * `/objectives/kpis/:id`: a KPI's latest value against its thresholds, the
 * trend chart and statistics, the measurement log (record, correct, delete),
 * an explanation of a deviation from target on request, and the shared record
 * tabs (its recurring measurement tasks, related items, activity, …).
 */
@Component({
  selector: 'app-kpi-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    LocalDayPipe,
    LocalNumberPipe,
    MarkdownPipe,
    WatchButton,
    AiAssistButton,
    FieldHelp,
    GuideIntro,
    LessonView,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    KpiTile,
    Pager,
    SlideOver,
    KpiChart,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted">
          {{ 'objectives.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[880px] px-4 pt-7 sm:px-8">
          <app-alert tone="error">{{ 'objectives.common.notFound' | transloco }}</app-alert>
          <a
            routerLink="/objectives/kpis"
            class="mt-3 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'objectives.common.backToKpis' | transloco }}
          </a>
        </div>
      }
      @case ('ready') {
        @if (kpi(); as k) {
          <app-record-detail-layout
            entityType="kpi"
            [entityId]="k.id"
            [tabs]="tabs"
            [canEdit]="k.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/objectives/kpis"
            backLabelKey="objectives.common.backToKpis"
          >
            <div header>
              <p class="font-mono text-[12.5px] text-fg-subtle">{{ k.code }}</p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
              >
                {{ k.name }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="healthTone(k.last_status)">
                  {{ healthKey(k.last_status) | transloco }}
                </app-badge>
                <app-badge [tone]="statusTone(k.status)">{{
                  statusKey(k.status) | transloco
                }}</app-badge>
                @if (k.measurement_overdue) {
                  <app-badge tone="warn">
                    <app-icon name="alert" [size]="12" />
                    {{ 'objectives.kpi.measurementOverdue' | transloco }}
                  </app-badge>
                }
                @if (k.objective; as obj) {
                  <a
                    [routerLink]="['/objectives', obj.id]"
                    class="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
                  >
                    <app-icon name="flag" [size]="12" />
                    {{ obj.code }} {{ obj.title }}
                  </a>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button entityType="kpi" [entityId]="k.id" />
              <app-button variant="ghost" size="sm" (click)="askAbout()">
                <app-icon name="spark" [size]="14" />
                {{ 'objectives.ai.summarise' | transloco }}
              </app-button>
              @if (k.can_measure && k.status !== 'retired') {
                <app-button size="sm" (click)="openRecord()" data-testid="record-measurement">
                  <app-icon name="plus" [size]="14" />
                  {{ 'objectives.kpi.record' | transloco }}
                </app-button>
              }
              @if (k.can_edit) {
                <app-button variant="secondary" size="sm" (click)="edit()">
                  {{ 'objectives.detail.edit' | transloco }}
                </app-button>
              }
              @if (k.can_delete) {
                <app-button variant="danger" size="sm" (click)="pendingDelete.set('kpi')">
                  <app-icon name="trash" [size]="14" />
                  {{ 'objectives.detail.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-4">
              <app-guide-intro [scope]="scope" page="kpiDetail" />

              <section
                class="grid grid-cols-2 gap-3 lg:grid-cols-4"
                [attr.aria-label]="'objectives.kpi.statsLabel' | transloco"
              >
                <app-kpi-tile
                  [label]="'objectives.kpi.latest' | transloco"
                  [value]="valueText(k.last_value)"
                  [tone]="healthTone(k.last_status)"
                  [delta]="targetText()"
                />
                <app-kpi-tile
                  [label]="'objectives.kpi.change' | transloco"
                  [value]="changeText()"
                  [delta]="changePctText()"
                />
                <app-kpi-tile
                  [label]="'objectives.kpi.trend' | transloco"
                  [value]="trendLabel()"
                  [tone]="trendToneValue()"
                />
                <app-kpi-tile
                  [label]="'objectives.kpi.onTrackShare' | transloco"
                  [value]="onTrackText()"
                  tone="pass"
                />
              </section>

              <app-card>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'objectives.kpi.chartHeading' | transloco }}
                  </h2>
                  @if (k.last_status === 'at_risk' || k.last_status === 'off_track') {
                    <app-ai-assist-button
                      [assist]="explainAssist"
                      labelKey="objectives.ai.explainDeviation"
                      entityType="kpi"
                      [entityId]="k.id"
                      [input]="{ kpi_id: k.id }"
                      (text)="explanation.set($event)"
                      (failed)="explanation.set(null)"
                    />
                  }
                </div>
                <app-kpi-chart [series]="series()" />
                @if (explanation(); as text) {
                  <div
                    class="mt-3 rounded-[10px] border border-accent-border bg-accent-soft p-3"
                    data-testid="deviation-explanation"
                    aria-live="polite"
                  >
                    <p class="mb-1 text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.ai.explanationLabel' | transloco }}
                    </p>
                    <div
                      class="cf-markdown text-[13.5px] text-fg"
                      [innerHTML]="text | appMarkdown"
                    ></div>
                  </div>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'objectives.kpi.definition' | transloco }}
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.kpiFields.direction' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ 'objectives.direction.' + k.direction | transloco }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.kpiFields.frequency' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ 'objectives.frequency.' + k.frequency | transloco }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.kpi.nextDue' | transloco }}
                    </dt>
                    <dd
                      [class.text-fail]="k.measurement_overdue"
                      [class.text-fg]="!k.measurement_overdue"
                    >
                      {{ (k.next_due_date | localDay) || '—' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.kpiFields.baseline' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ valueText(k.baseline_value) }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.kpiFields.target' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ valueText(k.target_value) }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.kpiFields.warning' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ valueText(k.warning_value) }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ k.owner?.name ?? ('objectives.common.noOwner' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.fields.department' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ department() ?? '—' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.fields.managementSystem' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ k.management_system ? (systemKey(k.management_system) | transloco) : '—' }}
                    </dd>
                  </div>
                  <div class="sm:col-span-3">
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.kpiFields.dataSource' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ k.data_source || '—' }}</dd>
                  </div>
                  @if (k.description) {
                    <div class="sm:col-span-3">
                      <dt class="text-[12px] font-semibold text-fg-muted">
                        {{ 'objectives.kpiFields.description' | transloco }}
                      </dt>
                      <dd
                        class="cf-markdown text-fg"
                        [innerHTML]="k.description | appMarkdown"
                      ></dd>
                    </div>
                  }
                </dl>
              </app-card>

              <app-card [padded]="false">
                <h2 class="px-4 pt-3.5 pb-2 font-display text-[15px] font-bold text-fg">
                  {{ 'objectives.kpi.measurements' | transloco }}
                </h2>
                @if (measurements().length === 0) {
                  <p class="px-4 pb-4 text-[13.5px] text-fg-muted">
                    {{ 'objectives.kpi.noMeasurements' | transloco }}
                  </p>
                } @else {
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-[13px]" data-testid="measurements-table">
                      <caption class="sr-only">
                        {{
                          'objectives.kpi.measurements' | transloco
                        }}
                      </caption>
                      <thead class="border-y border-border text-[12px] text-fg-muted">
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
                          <th scope="col" class="hidden px-4 py-2 font-semibold md:table-cell">
                            {{ 'objectives.measurement.recordedBy' | transloco }}
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
                          <tr>
                            <td class="px-4 py-2 whitespace-nowrap">
                              {{ m.period_start | localDay }} – {{ m.period_end | localDay }}
                              @if (m.note) {
                                <span
                                  class="block max-w-[260px] truncate text-[12px] text-fg-subtle"
                                >
                                  {{ m.note }}
                                </span>
                              }
                            </td>
                            <td class="px-4 py-2 text-right font-semibold whitespace-nowrap">
                              {{ m.value | localNumber: '1.0-2' }} {{ k.unit }}
                            </td>
                            <td class="px-4 py-2">
                              <app-badge [tone]="healthTone(m.status)">
                                {{ healthKey(m.status) | transloco }}
                              </app-badge>
                            </td>
                            <td class="hidden px-4 py-2 text-fg-muted md:table-cell">
                              {{ m.recorded_by?.name ?? '—' }}
                            </td>
                            <td class="px-4 py-2 text-right whitespace-nowrap">
                              @if (m.can_edit) {
                                <button
                                  type="button"
                                  class="rounded-[6px] px-2 py-1 text-[12.5px] font-semibold text-accent hover:bg-accent-soft"
                                  [attr.aria-label]="
                                    'objectives.measurement.editLabel'
                                      | transloco: { period: (m.period_end | localDay) }
                                  "
                                  (click)="openEdit(m)"
                                >
                                  {{ 'objectives.measurement.edit' | transloco }}
                                </button>
                                <button
                                  type="button"
                                  class="rounded-[6px] p-1 text-fg-subtle hover:text-fail"
                                  [attr.aria-label]="
                                    'objectives.measurement.deleteLabel'
                                      | transloco: { period: (m.period_end | localDay) }
                                  "
                                  (click)="askDeleteMeasurement(m)"
                                >
                                  <app-icon name="trash" [size]="14" />
                                </button>
                              }
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
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

            <ng-container aside>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="kpi" [entityId]="k.id" />
              </app-card>
              <app-why-it-matters [scope]="scope" page="kpiDetail" />
              <details class="rounded-card border border-border bg-surface p-4">
                <summary class="cursor-pointer text-[13.5px] font-semibold text-fg">
                  {{ 'objectives.lessons.goodKpis' | transloco }}
                </summary>
                <div class="mt-3"><app-lesson [scope]="scope" lesson="good-kpis" /></div>
              </details>
            </ng-container>
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
              >
                @if (draftError(); as key) {
                  <app-alert tone="error">{{ key | transloco }}</app-alert>
                }
                <div>
                  <app-form-field
                    [label]="'objectives.measurement.periodEnd' | transloco"
                    inputId="m-period-end"
                  >
                    <input
                      id="m-period-end"
                      type="date"
                      required
                      [max]="today"
                      [disabled]="!!d.id"
                      [value]="d.period_end"
                      (change)="patchDraft({ period_end: $any($event.target).value })"
                    />
                  </app-form-field>
                  <app-field-help [scope]="scope" page="measurement" field="periodEnd" />
                </div>
                <div>
                  <app-form-field
                    [label]="'objectives.measurement.periodStart' | transloco"
                    inputId="m-period-start"
                  >
                    <input
                      id="m-period-start"
                      type="date"
                      [value]="d.period_start"
                      (change)="patchDraft({ period_start: $any($event.target).value })"
                    />
                  </app-form-field>
                  <app-field-help [scope]="scope" page="measurement" field="periodStart" />
                </div>
                <div>
                  <app-form-field
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
                  </app-form-field>
                  <app-field-help [scope]="scope" page="measurement" field="value" />
                  @if (draftValueInvalid()) {
                    <p class="mt-1 text-[12.5px] text-fail">
                      {{ 'objectives.errors.invalid_number' | transloco }}
                    </p>
                  }
                </div>
                <div>
                  <app-form-field
                    [label]="'objectives.measurement.note' | transloco"
                    inputId="m-note"
                  >
                    <textarea
                      id="m-note"
                      rows="3"
                      maxlength="5000"
                      [value]="d.note"
                      (input)="patchDraft({ note: $any($event.target).value })"
                    ></textarea>
                  </app-form-field>
                  <app-field-help [scope]="scope" page="measurement" field="note" />
                </div>
                <div class="flex justify-end gap-2">
                  <app-button variant="ghost" (click)="closeDraft()">
                    {{ 'common.cancel' | transloco }}
                  </app-button>
                  <app-button type="submit" [loading]="busy()" [disabled]="busy()">
                    {{ 'common.save' | transloco }}
                  </app-button>
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
  protected readonly explainAssist = ASSIST_EXPLAIN_DEVIATION;
  protected readonly today = todayIso();
  protected readonly statusKey = kpiStatusKey;
  protected readonly statusTone = kpiStatusTone;
  protected readonly healthKey = healthKey;
  protected readonly healthTone = healthTone;
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

  protected readonly targetText = computed(() => {
    const k = this.kpi();
    return k?.target_value != null
      ? this.language.translate('objectives.kpi.targetIs', {
          value: this.valueText(k.target_value),
        })
      : '';
  });
  protected readonly changeText = computed(() => {
    const change = this.series()?.stats.change;
    if (change == null) {
      return '—';
    }
    return `${change > 0 ? '+' : ''}${this.num(change)}`;
  });
  protected readonly changePctText = computed(() => {
    const pct = this.series()?.stats.change_pct;
    return pct == null ? '' : `${pct > 0 ? '+' : ''}${this.num(pct)} %`;
  });
  protected readonly trendLabel = computed(() => {
    const trend = this.series()?.stats.trend ?? 'insufficient_data';
    return this.language.translate(trendKey(trend));
  });
  protected readonly trendToneValue = computed(() =>
    trendTone(this.series()?.stats.trend ?? 'insufficient_data'),
  );
  protected readonly onTrackText = computed(() => {
    const share = this.series()?.stats.on_track_share;
    return share == null ? '—' : `${this.num(share * 100, '1.0-0')} %`;
  });

  private request = new Subscription();
  private measurementsRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.measurementsRequest.unsubscribe();
    });
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'kpi',
      entityId: this.id(),
      view: 'detail',
      title: this.kpi()?.name ?? null,
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

  private num(value: number, digits = '1.0-2'): string {
    return formatNumber(value, this.language.locale(), digits);
  }

  protected edit(): void {
    void this.router.navigate(['/objectives/kpis', this.id(), 'edit']);
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

  protected openRecord(): void {
    this.draftSubmitted.set(false);
    this.draftError.set(null);
    this.draft.set({ id: null, period_end: this.today, period_start: '', value: '', note: '' });
  }

  protected openEdit(m: Measurement): void {
    this.draftSubmitted.set(false);
    this.draftError.set(null);
    this.draft.set({
      id: m.id,
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
          period_start: d.period_start || null,
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

  protected askDeleteMeasurement(m: Measurement): void {
    this.pendingDelete.set(m);
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
      this.draft.set({ ...draft, id: existing.id, period_start: existing.period_start });
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
