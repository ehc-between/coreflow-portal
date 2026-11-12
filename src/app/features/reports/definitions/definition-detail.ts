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
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { blobErrorKey, fileStem, reportErrorKey, saveBlob } from '../data/report-errors';
import { cellText, labelOr, localized } from '../data/report-display';
import {
  EXPORT_FORMATS,
  ExportFormat,
  REPORTS_MODULE,
  ReportDefinition,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { ScheduleDialog } from './schedule-dialog';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'revisions',
];

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

/**
 * `/reports/definitions/:id`: a saved report — what it exports, run it in any
 * format, schedule it as a recurring task, and its tasks, links, activity,
 * comments and revision history. Owners, creators and `reports:manage` holders
 * may edit, schedule and delete it.
 */
@Component({
  selector: 'app-definition-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ScheduleDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as key) {
      <div class="mx-auto max-w-[860px] px-4 pt-8 sm:px-8">
        <app-alert>{{ key | transloco }}</app-alert>
        <a
          routerLink="/reports/definitions"
          class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
        >
          {{ 'reports.form.back' | transloco }}
        </a>
      </div>
    } @else if (definition(); as d) {
      <app-record-detail-layout
        entityType="report_definition"
        [entityId]="d.id"
        [tabs]="tabs"
        [canEdit]="d.can_edit"
        [fieldLabels]="fieldLabels"
        backLink="/reports/definitions"
        backLabelKey="reports.definitions.back"
      >
        <div header class="min-w-0">
          <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
            <app-badge tone="info">{{ registerName() }}</app-badge>
            <span>{{ 'modules.entities.report_definition' | transloco }}</span>
          </p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ d.name }}
          </h1>
        </div>
        <ng-container actions>
          <app-watch-button entityType="report_definition" [entityId]="d.id" />
          <app-button
            [loading]="exporting() === d.default_format"
            [disabled]="!!exporting()"
            (click)="export(d.default_format)"
          >
            {{
              'reports.detail.run'
                | transloco: { format: ('reports.formats.' + d.default_format | transloco) }
            }}
          </app-button>
          @if (d.can_edit) {
            <app-button variant="secondary" (click)="scheduleOpen.set(true)">
              <app-icon name="clock" [size]="15" />
              {{ 'reports.detail.schedule' | transloco }}
            </app-button>
            <app-button variant="secondary" (click)="edit()">{{
              'reports.detail.edit' | transloco
            }}</app-button>
            <app-button variant="ghost" (click)="deleteOpen.set(true)">
              <span class="sr-only">{{ 'reports.detail.delete' | transloco }}</span>
              <app-icon name="trash" [size]="15" />
            </app-button>
          }
        </ng-container>

        <app-guide-intro class="mb-4 block" scope="reports" page="definitionDetail" />

        <app-card class="mb-4 block">
          @if (d.description) {
            <p class="mb-4 text-[13.5px] whitespace-pre-line text-fg">{{ d.description }}</p>
          }
          <dl class="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt class="text-[12px] font-semibold text-fg-muted">
                {{ 'reports.form.register' | transloco }}
              </dt>
              <dd class="text-fg">{{ registerName() }}</dd>
            </div>
            <div>
              <dt class="text-[12px] font-semibold text-fg-muted">
                {{ 'reports.form.format' | transloco }}
              </dt>
              <dd class="text-fg">
                {{ 'reports.formats.' + d.default_format | transloco }} ·
                {{ 'reports.langs.' + d.lang | transloco }}
              </dd>
            </div>
            <div>
              <dt class="text-[12px] font-semibold text-fg-muted">
                {{ 'reports.form.owner' | transloco }}
              </dt>
              <dd class="text-fg">
                {{ d.owner?.name || ('reports.detail.unknownUser' | transloco) }}
              </dd>
            </div>
            <div>
              <dt class="text-[12px] font-semibold text-fg-muted">
                {{ 'reports.detail.lastExported' | transloco }}
              </dt>
              <dd class="text-fg">
                {{
                  d.last_exported_at
                    ? (d.last_exported_at | localDate: 'medium')
                    : ('reports.definitions.neverExported' | transloco)
                }}
              </dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-[12px] font-semibold text-fg-muted">
                {{ 'reports.form.filtersTitle' | transloco }}
              </dt>
              <dd class="mt-1 flex flex-wrap gap-1.5">
                @for (f of filterChips(); track f) {
                  <app-badge>{{ f }}</app-badge>
                } @empty {
                  <span class="text-fg-muted">{{ 'reports.detail.noFilters' | transloco }}</span>
                }
              </dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-[12px] font-semibold text-fg-muted">
                {{ 'reports.columns.legend' | transloco }}
              </dt>
              <dd class="text-fg">{{ columnsText() }}</dd>
            </div>
          </dl>
          <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span class="text-[12.5px] font-semibold text-fg-muted">{{
              'reports.detail.exportAs' | transloco
            }}</span>
            @for (format of formats; track format) {
              <app-button
                variant="secondary"
                size="sm"
                [loading]="exporting() === format"
                [disabled]="!!exporting()"
                (click)="export(format)"
              >
                {{ 'reports.formats.' + format | transloco }}
              </app-button>
            }
            <span class="ml-auto">
              <app-ask-about
                [prompt]="'reports.detail.askSummarise' | transloco: { name: d.name }"
              />
            </span>
          </div>
          <p class="mt-3 text-[12px] text-fg-subtle">
            {{
              'reports.detail.created'
                | transloco
                  : {
                      name: d.created_by?.name || ('reports.detail.unknownUser' | transloco),
                      date: (d.created_at | localDate),
                    }
            }}
          </p>
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

        <ng-container aside>
          <app-card>
            <app-supports-requirements entityType="report_definition" [entityId]="d.id" />
          </app-card>
        </ng-container>
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
      <p class="py-16 text-center text-[13.5px] text-fg-muted" role="status">
        {{ 'reports.common.loading' | transloco }}
      </p>
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
  protected readonly formats = EXPORT_FORMATS;
  protected readonly fieldLabels = DEFINITION_FIELD_LABELS;

  protected readonly definition = signal<ReportDefinition | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly exporting = signal<ExportFormat | null>(null);
  protected readonly scheduleOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);

  protected readonly canWriteTasks = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('tasks:write'),
  );

  protected readonly registerName = computed(() => {
    const d = this.definition();
    return d ? localized(d.register_label, this.language.active(), d.register_key) : '';
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
      chips.push(labelOr((k) => t(k), `reports.statuses.${status}`, status));
    }
    if (f.from) chips.push(t('reports.detail.filterFrom', { date: cellText(f.from, lang) }));
    if (f.to) chips.push(t('reports.detail.filterTo', { date: cellText(f.to, lang) }));
    if (f.standard_key)
      chips.push(t('reports.detail.filterStandard', { standard: f.standard_key }));
    return chips;
  });

  protected readonly columnsText = computed(() => {
    const d = this.definition();
    if (!d || d.columns.length === 0) {
      return this.language.translate('reports.detail.allColumns');
    }
    return d.columns.join(', ');
  });

  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      entityType: 'report_definition',
      entityId: this.id(),
      view: 'detail',
      title: this.definition()?.name ?? null,
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected edit(): void {
    void this.router.navigate(['/reports/definitions', this.id(), 'edit']);
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
        this.notifications.success('reports.registers.exported');
        this.load(orgId, d.id, true);
      },
      error: (error: unknown) => {
        this.exporting.set(null);
        void blobErrorKey(error).then((key) => this.notifications.error(key));
      },
    });
  }

  protected onScheduled(): void {
    this.scheduleOpen.set(false);
    this.notifications.success('reports.schedule.created');
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
        void this.router.navigate(['/reports/definitions']);
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
  }
}
