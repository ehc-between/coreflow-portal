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
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { RuleSummary } from '../../shared/tasks/rule-summary';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { EnvironmentApi } from './data/environment-api';
import {
  ENTITY_METRIC,
  Measurement,
  MeasurementCreate,
  Metric,
  PERM_MANAGE,
  PERM_RECORD,
  PERM_WRITE,
  TREND_BUCKETS,
  Trend,
  TrendBucket,
} from './data/environment.models';
import { localDay, statusTone } from './data/environment-display';
import { environmentErrorKey } from './data/environment-errors';
import { EnvTrendChart } from './env-trend-chart';
import { EnvLessonLink } from './lesson-link';
import { EnvMeasurementDialog } from './measurement-dialog';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
];

const MEASUREMENTS_PAGE = 20;

/** How far back the trend looks per bucket (days). */
const TREND_WINDOW: Readonly<Record<TrendBucket, number>> = {
  month: 365 * 2,
  quarter: 365 * 3,
  year: 365 * 10,
};

/**
 * A monitoring metric (`/environment/metrics/:id`): what it measures, its trend
 * by month, quarter or year (with CO2e where an emission factor applies), the
 * recorded measurements (`?measurement=<id>` highlights one) and recording new
 * ones; collection reminders in the Tasks tab and the shared record kit.
 */
@Component({
  selector: 'app-env-metric-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    RuleSummary,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    Pager,
    EnvTrendChart,
    EnvLessonLink,
    EnvMeasurementDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'environment.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a
            routerLink="/environment/metrics"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'environment.metrics.back' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (metric(); as m) {
          <app-record-detail-layout
            [entityType]="entityType"
            [entityId]="m.id"
            [tabs]="tabs"
            [canEdit]="canWrite()"
            backLink="/environment/metrics"
            backLabelKey="environment.metrics.back"
          >
            <div header>
              <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
                <span class="font-mono font-semibold">{{ m.code }}</span>
                <span>{{ 'environment.categories.' + m.category | transloco }}</span>
                @if (m.ghg_scope) {
                  <span>{{ 'environment.scopes.' + m.ghg_scope | transloco }}</span>
                }
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="metric-heading"
              >
                {{ m.name }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="tone(m.status)" data-testid="metric-status">{{
                  'environment.status.' + m.status | transloco
                }}</app-badge>
                <span class="text-[12.5px] text-fg-muted">{{
                  'environment.metric.unitLabel' | transloco: { unit: m.unit }
                }}</span>
              </div>
            </div>

            <ng-container actions>
              <app-watch-button [entityType]="entityType" [entityId]="m.id" />
              <app-ask-about [prompt]="'environment.ask.explainTrend' | transloco" />
              @if (canRecord() && m.status === 'active') {
                <app-button size="sm" (click)="openRecord()" data-testid="record-measurement">
                  <app-icon name="plus" [size]="14" />
                  {{ 'environment.measurement.record' | transloco }}
                </app-button>
              }
              @if (canWrite()) {
                <a
                  [routerLink]="['/environment/metrics', m.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="metric-edit"
                >
                  {{ 'environment.common.edit' | transloco }}
                </a>
              }
              @if (canManage()) {
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'environment.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="environment" page="metricDetail" />
              @if (m.status === 'retired') {
                <app-alert tone="info">{{
                  'environment.metric.retiredNotice' | transloco
                }}</app-alert>
              }

              <app-card>
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'environment.metric.trend' | transloco }}
                  </h2>
                  <div
                    class="inline-flex rounded-[10px] border border-border p-0.5"
                    role="group"
                    [attr.aria-label]="'environment.metric.bucket' | transloco"
                  >
                    @for (b of buckets; track b) {
                      <button
                        type="button"
                        class="rounded-[8px] px-2.5 py-1 text-[12.5px] font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
                  <app-env-trend-chart [points]="t.points" [bucket]="t.bucket" [unit]="t.unit" />
                  <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-muted">
                    <span>
                      {{
                        'environment.metric.total'
                          | transloco: { value: (t.total | localNumber: '1.0-2'), unit: t.unit }
                      }}
                    </span>
                    @if (t.total_co2e_kg !== null) {
                      <span>
                        {{
                          'environment.metric.totalCo2e'
                            | transloco: { value: (t.total_co2e_kg | localNumber: '1.0-1') }
                        }}
                      </span>
                    }
                  </p>
                } @else if (trendFailed()) {
                  <p class="text-[13px] text-fail" role="alert">
                    {{ 'environment.common.loadFailed' | transloco }}
                  </p>
                } @else {
                  <p class="text-[13px] text-fg-muted" role="status">
                    {{ 'environment.common.loading' | transloco }}
                  </p>
                }
              </app-card>

              <app-card [padded]="false">
                <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'environment.measurement.listTitle' | transloco }}
                  </h2>
                </div>
                @if (measurements().length) {
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-[13px]" data-testid="measurement-rows">
                      <thead class="text-fg-subtle">
                        <tr>
                          <th scope="col" class="px-4 py-1.5 font-semibold">
                            {{ 'environment.metric.period' | transloco }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 text-right font-semibold">
                            {{ 'environment.metric.value' | transloco }}
                          </th>
                          <th scope="col" class="px-2 py-1.5 text-right font-semibold">kg CO₂e</th>
                          <th scope="col" class="px-2 py-1.5 font-semibold">
                            {{ 'environment.measurement.recordedByCol' | transloco }}
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
                            [class.bg-accent-soft]="x.id === highlightMeasurement()"
                          >
                            <td class="px-4 py-2 whitespace-nowrap">
                              {{ x.period_start | localDay }} – {{ x.period_end | localDay }}
                              @if (x.site) {
                                <span class="block text-[11.5px] text-fg-subtle">{{ x.site }}</span>
                              }
                              @if (x.note) {
                                <span
                                  class="block max-w-[280px] truncate text-[11.5px] text-fg-subtle"
                                  >{{ x.note }}</span
                                >
                              }
                            </td>
                            <td class="px-2 py-2 text-right font-semibold whitespace-nowrap">
                              {{ x.value | localNumber: '1.0-2' }} {{ x.unit }}
                            </td>
                            <td class="px-2 py-2 text-right whitespace-nowrap">
                              {{ x.co2e_kg === null ? '–' : (x.co2e_kg | localNumber: '1.0-1') }}
                            </td>
                            <td class="px-2 py-2 text-fg-muted">{{ x.recorded_by_name ?? '' }}</td>
                            <td class="px-4 py-2 text-right whitespace-nowrap">
                              @if (x.can_edit) {
                                <app-button
                                  variant="ghost"
                                  size="sm"
                                  [attr.aria-label]="'environment.measurement.edit' | transloco"
                                  (click)="openEdit(x)"
                                >
                                  {{ 'environment.common.edit' | transloco }}
                                </app-button>
                                <app-button
                                  variant="ghost"
                                  size="sm"
                                  [attr.aria-label]="'environment.measurement.delete' | transloco"
                                  (click)="deletingMeasurement.set(x)"
                                >
                                  <app-icon name="trash" [size]="14" />
                                </app-button>
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
                } @else {
                  <p class="px-4 pb-4 text-[13px] text-fg-muted" data-testid="no-measurements">
                    {{ 'environment.measurement.none' | transloco }}
                  </p>
                }
              </app-card>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="m.id"
                [canCreate]="canWrite()"
                [entityLabel]="m.code + ' ' + m.name"
              />
            </div>

            <ng-container aside>
              <app-card>
                <dl class="flex flex-col gap-2 text-[13px]" data-testid="metric-summary">
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'environment.fields.emissionFactor' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (m.emission_factor !== null) {
                        {{
                          'environment.metric.factorValue'
                            | transloco
                              : { value: (m.emission_factor | localNumber: '1.0-6'), unit: m.unit }
                        }}
                      } @else {
                        {{ 'environment.common.none' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'environment.metric.collection' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (m.collection_rrule) {
                        <app-rule-summary [rrule]="m.collection_rrule" />
                      } @else {
                        {{ 'environment.metric.noCollection' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'environment.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ m.owner_name ?? ('environment.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'environment.fields.site' | transloco }}</dt>
                    <dd class="text-fg">{{ m.site ?? ('environment.common.none' | transloco) }}</dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">
                      {{ 'environment.metric.measurementCount' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ m.measurement_count | localNumber }}</dd>
                  </div>
                </dl>
                @if (m.description) {
                  <p class="mt-3 text-[13px] whitespace-pre-line text-fg-muted">
                    {{ m.description }}
                  </p>
                }
              </app-card>
              <app-supports-requirements [entityType]="entityType" [entityId]="m.id" />
              <app-why-it-matters scope="environment" page="metricDetail" />
              <app-env-lesson-link lesson="monitoring-and-emissions" />
            </ng-container>
          </app-record-detail-layout>

          <app-env-measurement-dialog
            [open]="recording()"
            [busy]="acting()"
            [unit]="m.unit"
            [metricName]="m.code + ' ' + m.name"
            [measurement]="editing()"
            (saved)="saveMeasurement($event)"
            (cancelled)="closeDialog()"
          />
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

  readonly id = input.required<string>();

  protected readonly entityType = ENTITY_METRIC;
  protected readonly tabs = TABS;
  protected readonly buckets = TREND_BUCKETS;
  protected readonly pageSize = MEASUREMENTS_PAGE;
  protected readonly tone = statusTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
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
  /** Bumped after a measurement changes, to reload the trend and the table. */
  private readonly version = signal(0);

  protected readonly highlightMeasurement = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('measurement'))),
    { initialValue: null },
  );

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes(PERM_WRITE));
  protected readonly canManage = computed(() => this.permissions().includes(PERM_MANAGE));
  protected readonly canRecord = computed(() => this.permissions().includes(PERM_RECORD));

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
        module: 'environment',
        entityType: ENTITY_METRIC,
        entityId: this.id(),
        view: 'detail',
        title: m ? `${m.code} ${m.name}` : null,
      };
    });
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
    this.editing.set(null);
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
      next: () => {
        this.acting.set(false);
        this.closeDialog();
        this.notifications.success(
          editing
            ? 'environment.notices.measurementSaved'
            : 'environment.notices.measurementRecorded',
        );
        this.changed();
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
    this.version.update((v) => v + 1);
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  private load(orgId: string | null, id: string, initial: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (initial) {
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
    if (!orgId) {
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
    if (!orgId) {
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
