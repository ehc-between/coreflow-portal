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
import { providePageContext } from '../../../core/ai/page-context';
import { humanize } from '../../../core/kit/entity-types.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { internalLink } from '../../../core/search/internal-link';
import { WatchButton } from '../../../shared/activity/watch-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { RuleSummary } from '../../../shared/tasks/rule-summary';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ReportsAsk } from '../components/ask-button';
import { ReportsNav } from '../components/reports-nav';
import { registerStatusLabel } from '../components/register-filters';
import { blobErrorKey, fileStem, reportErrorKey, saveBlob } from '../data/report-errors';
import {
  cellText,
  formatBytes,
  frameworkLabelKey,
  labelOr,
  localized,
} from '../data/report-display';
import {
  EXPORT_FORMATS,
  ExportFormat,
  REPORTS_MODULE,
  Register,
  ReportDefinition,
  ReportRun,
  ReportSchedule,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { pluralKey } from '../../../shared/i18n/plural';
import { ScheduleDialog } from './schedule-dialog';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'revisions',
];

/** Runs shown at first; "Vis flere" loads the next page. */
const RUNS_PAGE = 10;

/** Field labels for the revisions tab (snapshot field -> i18n key). */
export const DEFINITION_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'reports.form.name',
  description: 'reports.form.description',
  register_key: 'reports.form.register',
  filters: 'reports.form.filtersTitle',
  columns: 'reports.columns.legend',
  default_format: 'reports.form.format',
  lang: 'reports.form.lang',
  owner_user_id: 'reports.form.owner',
};

/** The first 12 characters of a checksum, for a table cell (the full value is in its title). */
export function shortHash(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 12) : '—';
}

/**
 * `/reports/custom/:id`: a saved report — what it exports, run it (one button,
 * other formats in its menu), the active schedule (how often, next run, who), every
 * run so far (who, when, format, rows, checksum, and the file when it was kept), and
 * the report's tasks, links, activity, comments and revision history. A run is
 * evidence for monitoring and management review (ISO 9.1 / 9.3). Owners, creators
 * and `reports:manage` holders may edit, schedule and delete it.
 */
@Component({
  selector: 'app-definition-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    WatchButton,
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
    FieldItem,
    FieldList,
    Icon,
    LoadingState,
    MenuItem,
    OverflowMenu,
    ReportsAsk,
    ReportsNav,
    ScheduleDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as key) {
      <div class="mx-auto max-w-[860px] px-4 pt-8 sm:px-8">
        <app-alert>{{ key | transloco }}</app-alert>
        <a
          routerLink="/reports/custom"
          class="mt-3 inline-block text-ui font-semibold text-accent hover:underline"
        >
          {{ 'reports.definitions.back' | transloco }}
        </a>
      </div>
    } @else if (definition(); as d) {
      <app-record-detail-layout
        entityType="report_definition"
        [entityId]="d.id"
        [title]="d.name"
        [breadcrumbs]="[
          { labelKey: 'reports.hub.title', link: '/reports' },
          { labelKey: 'reports.nav.definitions', link: '/reports/custom' },
          { label: d.name },
        ]"
        [tabs]="tabs"
        [canEdit]="d.can_edit"
        [fieldLabels]="fieldLabels"
        backLink="/reports/custom"
        backLabelKey="reports.definitions.back"
      >
        <ng-container meta>
          <app-badge tone="info">{{ registerName() }}</app-badge>
          <span>{{ 'reports.formats.' + d.default_format | transloco }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ 'reports.langs.' + d.lang | transloco }}</span>
          @if (schedule()) {
            <app-badge tone="accent">
              <app-icon name="clock" [size]="12" />
              {{ 'reports.definitions.scheduled' | transloco }}
            </app-badge>
          }
        </ng-container>

        <app-watch-button secondary entityType="report_definition" [entityId]="d.id" />
        @if (d.can_edit) {
          <app-button secondary variant="secondary" (click)="scheduleOpen.set(true)">
            <app-icon name="clock" [size]="15" />
            {{ (schedule() ? 'reports.detail.reschedule' : 'reports.detail.schedule') | transloco }}
          </app-button>
        }
        <span primary class="inline-flex items-center gap-1">
          <app-button
            [loading]="exporting() === d.default_format"
            [disabled]="!!exporting()"
            (click)="export(d.default_format)"
            data-testid="run-report"
          >
            {{
              'reports.detail.run'
                | transloco: { format: ('reports.formats.' + d.default_format | transloco) }
            }}
          </app-button>
          <app-overflow-menu labelKey="reports.detail.otherFormats" data-testid="run-formats">
            @for (format of otherFormats(); track format) {
              <button type="button" appMenuItem (click)="export(format)">
                {{
                  'reports.detail.runAs'
                    | transloco: { format: ('reports.formats.' + format | transloco) }
                }}
              </button>
            }
          </app-overflow-menu>
        </span>
        @if (d.can_edit) {
          <ng-container overflow>
            <button type="button" appMenuItem (click)="edit()">
              {{ 'reports.detail.edit' | transloco }}
            </button>
            <button type="button" appMenuItem [danger]="true" (click)="deleteOpen.set(true)">
              {{ 'reports.detail.delete' | transloco }}
            </button>
          </ng-container>
        }

        <app-reports-nav nav />

        <app-card class="mb-4 block">
          <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
            <h2 class="text-card font-semibold text-fg">
              {{ 'reports.detail.whatTitle' | transloco }}
            </h2>
            <app-reports-ask
              [prompt]="'reports.detail.askSummarise' | transloco: { name: d.name }"
              [requirements]="requirementRefs()"
            />
          </div>
          @if (d.description) {
            <p class="mb-4 text-body whitespace-pre-line text-fg">{{ d.description }}</p>
          }
          <app-field-list [columns]="2">
            <app-field-item labelKey="reports.form.register">
              @if (registerLink(); as link) {
                <a
                  [routerLink]="link.path"
                  [queryParams]="link.queryParams"
                  class="font-semibold text-accent hover:underline"
                  >{{ registerName() }}</a
                >
              } @else {
                {{ registerName() }}
              }
            </app-field-item>
            <app-field-item labelKey="reports.form.owner" [value]="d.owner?.name" />
            <app-field-item labelKey="reports.form.filtersTitle" [wide]="true" empty="none">
              @if (filterChips().length) {
                <span class="flex flex-wrap gap-1.5">
                  @for (f of filterChips(); track f) {
                    <app-badge>{{ f }}</app-badge>
                  }
                </span>
              } @else {
                <span class="text-fg-muted">{{ 'reports.detail.noFilters' | transloco }}</span>
              }
            </app-field-item>
            <app-field-item
              labelKey="reports.columns.legend"
              [wide]="true"
              [value]="columnsText()"
            />
            <app-field-item labelKey="reports.detail.lastExported" empty="none">
              @if (lastRunAt(); as at) {
                {{ at | localDate }}
              } @else {
                {{ 'reports.definitions.neverExported' | transloco }}
              }
            </app-field-item>
            <app-field-item
              labelKey="reports.detail.createdBy"
              [value]="
                'reports.detail.created'
                  | transloco
                    : {
                        name: d.created_by?.name || ('reports.detail.unknownUser' | transloco),
                        date: (d.created_at | localDay),
                      }
              "
            />
          </app-field-list>
        </app-card>

        <app-card class="mb-4 block">
          <section aria-labelledby="def-schedule" data-testid="definition-schedule">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="def-schedule" class="text-card font-semibold text-fg">
                {{ 'reports.detail.scheduleTitle' | transloco }}
              </h2>
              @if (schedule(); as s) {
                @if (taskLink(s); as target) {
                  <a
                    [routerLink]="target.path"
                    [queryParams]="target.queryParams"
                    class="text-meta font-semibold text-accent hover:underline"
                    >{{ 'reports.detail.openTask' | transloco }}</a
                  >
                }
              }
            </div>
            @if (schedule(); as s) {
              <app-field-list [columns]="3">
                <app-field-item labelKey="reports.detail.repeats">
                  @if (s.rrule) {
                    <app-rule-summary [rrule]="s.rrule" />
                  } @else {
                    {{ 'reports.detail.once' | transloco }}
                  }
                </app-field-item>
                <app-field-item labelKey="reports.detail.nextRun" empty="none">
                  @if (s.next_due_at || s.due_at; as next) {
                    {{ next | localDay }}
                  }
                </app-field-item>
                <app-field-item labelKey="reports.schedule.assignee" [value]="assigneeName(s)" />
              </app-field-list>
              <p class="mt-3 text-meta text-fg-muted">
                {{ 'reports.detail.scheduleNote' | transloco }}
              </p>
            } @else {
              <p class="text-ui text-fg-muted">{{ 'reports.detail.notScheduled' | transloco }}</p>
            }
          </section>
        </app-card>

        <app-card [padded]="false" class="mb-4 block">
          <section aria-labelledby="def-runs" data-testid="definition-runs">
            <div class="border-b border-border px-4 py-3">
              <h2 id="def-runs" class="text-card font-semibold text-fg">
                {{ 'reports.runs.title' | transloco }}
                @if (runsTotal()) {
                  <span class="ml-1 text-meta font-normal text-fg-muted">({{ runsTotal() }})</span>
                }
              </h2>
              <p class="text-meta text-fg-muted">{{ 'reports.runs.subtitle' | transloco }}</p>
            </div>
            @if (runsLoading() && runs().length === 0) {
              <div class="p-4"><app-loading-state [rows]="3" /></div>
            } @else if (runs().length === 0) {
              <p class="px-4 py-5 text-ui text-fg-muted">{{ 'reports.runs.empty' | transloco }}</p>
            } @else {
              <ul class="divide-y divide-border">
                @for (run of runs(); track run.id) {
                  <li
                    class="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div class="min-w-0 text-ui">
                      <p class="font-semibold text-fg">
                        {{ run.run_at | localDate }}
                        <span class="font-normal text-fg-muted">
                          · {{ run.run_by?.name || ('reports.detail.unknownUser' | transloco) }}
                        </span>
                      </p>
                      <p class="text-meta text-fg-muted">
                        {{ 'reports.formats.' + run.format | transloco }} ·
                        {{ plural('reports.runs.rows', run.rows) | transloco: { count: run.rows } }}
                        · {{ size(run.size_bytes) }} ·
                        <span class="font-mono" [title]="run.sha256">{{ hash(run.sha256) }}</span>
                        @if (run.task_id) {
                          · {{ 'reports.runs.fromTask' | transloco }}
                        }
                      </p>
                    </div>
                    @if (run.has_file) {
                      <app-button
                        variant="secondary"
                        size="sm"
                        [loading]="downloading() === run.id"
                        [disabled]="!!downloading()"
                        (click)="downloadRun(run)"
                        [attr.aria-label]="
                          'reports.runs.downloadLabel'
                            | transloco: { date: (run.run_at | localDate) }
                        "
                      >
                        {{ 'reports.runs.download' | transloco }}
                      </app-button>
                    } @else {
                      <span class="text-meta text-fg-subtle">{{
                        'reports.runs.notKept' | transloco
                      }}</span>
                    }
                  </li>
                }
              </ul>
              @if (runs().length < runsTotal()) {
                <div class="border-t border-border px-4 py-2">
                  <app-button
                    variant="ghost"
                    size="sm"
                    [loading]="runsLoading()"
                    (click)="moreRuns()"
                  >
                    {{ 'reports.runs.more' | transloco }}
                  </app-button>
                </div>
              }
            }
          </section>
        </app-card>

        <app-why-it-matters scope="reports" page="definitionDetail" />

        <div tasks>
          <app-entity-tasks
            entityType="report_definition"
            [entityId]="d.id"
            [canCreate]="d.can_edit && canWriteTasks()"
            [entityLabel]="d.name"
          />
        </div>

        <app-supports-requirements
          aside-requirements
          entityType="report_definition"
          [entityId]="d.id"
          [canEdit]="d.can_edit"
          (linksChange)="onLinks($event)"
        />
      </app-record-detail-layout>

      <app-schedule-dialog
        [open]="scheduleOpen()"
        [definition]="d"
        (closed)="scheduleOpen.set(false)"
        (scheduled)="onScheduled()"
      />

      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'reports.detail.deleteTitle' | transloco"
        [message]="'reports.detail.deleteMessage' | transloco: { name: d.name }"
        [confirmLabel]="'reports.detail.delete' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="deleting()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class DefinitionDetail {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  /** Route param (component input binding). */
  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly plural = pluralKey;
  protected readonly fieldLabels = DEFINITION_FIELD_LABELS;

  protected readonly definition = signal<ReportDefinition | null>(null);
  private readonly allRegisters = signal<readonly Register[]>([]);
  /** The register behind the report (column names, status words). */
  protected readonly register = computed<Register | null>(() => {
    const key = this.definition()?.register_key;
    return key ? (this.allRegisters().find((r) => r.key === key) ?? null) : null;
  });
  protected readonly error = signal<string | null>(null);
  protected readonly exporting = signal<ExportFormat | null>(null);
  protected readonly downloading = signal<string | null>(null);
  protected readonly scheduleOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);
  protected readonly runs = signal<readonly ReportRun[]>([]);
  protected readonly runsTotal = signal(0);
  protected readonly runsLoading = signal(false);
  /** The schedule from its own endpoint (fresher than the definition's copy after scheduling). */
  private readonly loadedSchedule = signal<ReportSchedule | null | undefined>(undefined);
  protected readonly requirementRefs = signal<readonly string[]>([]);

  protected readonly canWriteTasks = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('tasks:write'),
  );

  protected readonly schedule = computed<ReportSchedule | null>(() => {
    const loaded = this.loadedSchedule();
    return loaded !== undefined ? loaded : (this.definition()?.schedule ?? null);
  });

  protected readonly otherFormats = computed(() => {
    const d = this.definition();
    return EXPORT_FORMATS.filter((f) => f !== d?.default_format);
  });

  protected readonly registerName = computed(() => {
    const d = this.definition();
    return d ? localized(d.register_label, this.language.active(), d.register_key) : '';
  });

  protected readonly registerLink = computed(() => {
    const d = this.definition();
    return d
      ? internalLink(`/reports/exports?register=${encodeURIComponent(d.register_key)}`)
      : null;
  });

  protected readonly lastRunAt = computed(() => {
    const d = this.definition();
    return this.runs()[0]?.run_at ?? d?.last_run?.run_at ?? d?.last_exported_at ?? null;
  });

  protected readonly filterChips = computed(() => {
    const f = this.definition()?.filters;
    if (!f) {
      return [];
    }
    const t = (k: string, p?: Record<string, unknown>) => this.language.translate(k, p);
    const lang = this.language.active();
    const chips: string[] = [];
    if (f.q) chips.push(t('reports.detail.filterQ', { q: f.q }));
    for (const status of f.status ?? []) {
      chips.push(registerStatusLabel(this.register(), status, (k) => t(k), lang));
    }
    if (f.from) chips.push(t('reports.detail.filterFrom', { date: cellText(f.from, lang) }));
    if (f.to) chips.push(t('reports.detail.filterTo', { date: cellText(f.to, lang) }));
    if (f.standard_key) {
      const name = labelOr(
        (k) => t(k),
        frameworkLabelKey(frameworkOf(f.standard_key)),
        f.standard_key,
      );
      chips.push(t('reports.detail.filterStandard', { standard: name }));
    }
    return chips;
  });

  /** The chosen columns by their names (in the report's language), or "All columns". */
  protected readonly columnsText = computed(() => {
    const d = this.definition();
    if (!d || d.columns.length === 0) {
      return this.language.translate('reports.detail.allColumns');
    }
    const columns = this.register()?.columns ?? [];
    return d.columns
      .map((key) => {
        const col = columns.find((c) => c.key === key);
        return col ? localized(col.label, this.language.active(), key) : humanize(key);
      })
      .join(', ');
  });

  private sub = new Subscription();
  private runsSub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      entityType: 'report_definition',
      entityId: this.id(),
      view: 'detail',
      title: this.definition()?.name ?? null,
      requirements: this.requirementRefs().length ? this.requirementRefs() : null,
    }));
    inject(DestroyRef).onDestroy(() => {
      this.sub.unsubscribe();
      this.runsSub.unsubscribe();
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.requirementRefs.set(
      links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
    );
  }

  protected edit(): void {
    void this.router.navigate(['/reports/custom', this.id(), 'edit']);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes, this.language.active());
  }

  protected hash(sha: string): string {
    return shortHash(sha);
  }

  protected assigneeName(s: ReportSchedule): string | null {
    return s.assignee?.name || null;
  }

  protected taskLink(s: ReportSchedule) {
    return internalLink(s.url);
  }

  protected export(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.definition();
    if (!orgId || !d || this.exporting()) {
      return;
    }
    this.exporting.set(format);
    this.api.exportDefinition(orgId, d.id, format).subscribe({
      next: (blob) => {
        this.exporting.set(null);
        saveBlob(blob, `${fileStem(d.name)}.${format}`);
        this.notifications.success('reports.detail.ran');
        // The run is recorded (and an open reminder task closed): refresh both.
        this.load(orgId, d.id, true);
      },
      error: (error: unknown) => {
        this.exporting.set(null);
        void blobErrorKey(error).then((key) => this.notifications.error(key));
      },
    });
  }

  protected downloadRun(run: ReportRun): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.definition();
    if (!orgId || !d || this.downloading()) {
      return;
    }
    this.downloading.set(run.id);
    this.api.downloadRun(orgId, d.id, run.id).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        saveBlob(blob, run.file_name || `${fileStem(d.name)}.${run.format}`);
      },
      error: (error: unknown) => {
        this.downloading.set(null);
        void blobErrorKey(error).then((key) => this.notifications.error(key));
      },
    });
  }

  protected moreRuns(): void {
    this.loadRuns(this.selectedOrg.currentOrgId(), this.id(), this.runs().length);
  }

  protected onScheduled(): void {
    this.scheduleOpen.set(false);
    this.notifications.success('reports.schedule.created');
    this.load(this.selectedOrg.currentOrgId(), this.id(), true);
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.definition();
    if (!orgId || !d || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteDefinition(orgId, d.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('reports.detail.deleted');
        void this.router.navigate(['/reports/custom']);
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.notifications.error(reportErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string, quiet = false): void {
    if (!orgId) {
      return;
    }
    if (!quiet) {
      this.sub.unsubscribe();
      this.sub = new Subscription();
      this.definition.set(null);
      this.error.set(null);
      this.loadedSchedule.set(undefined);
      this.sub.add(
        this.api.registers(orgId).subscribe({
          next: (list) => this.allRegisters.set(list.items),
          error: () => this.allRegisters.set([]),
        }),
      );
    }
    this.sub.add(
      this.api.getDefinition(orgId, id).subscribe({
        next: (d) => this.definition.set(d),
        error: (error: unknown) => {
          if (!quiet) {
            this.error.set(reportErrorKey(error));
          }
        },
      }),
    );
    // Older backends have no schedule endpoint: keep the definition's copy then.
    this.sub.add(
      this.api.getSchedule(orgId, id).subscribe({
        next: (s) => this.loadedSchedule.set(s ?? null),
        error: () => undefined,
      }),
    );
    this.loadRuns(orgId, id, 0);
  }

  private loadRuns(orgId: string | null, id: string, offset: number): void {
    if (!orgId) {
      return;
    }
    if (offset === 0) {
      this.runsSub.unsubscribe();
      this.runsSub = new Subscription();
    }
    this.runsLoading.set(true);
    this.runsSub.add(
      this.api.listRuns(orgId, id, { limit: RUNS_PAGE, offset }).subscribe({
        next: (page) => {
          this.runsLoading.set(false);
          this.runs.set(offset === 0 ? page.items : [...this.runs(), ...page.items]);
          this.runsTotal.set(page.total);
        },
        error: () => {
          this.runsLoading.set(false);
          if (offset === 0) {
            this.runs.set([]);
            this.runsTotal.set(0);
          }
        },
      }),
    );
  }
}
