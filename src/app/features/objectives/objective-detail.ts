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
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LessonView } from '../../shared/guidance/lesson';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { departmentName } from './components/owner-select';
import { ObjectivesApi } from './data/objectives-api';
import { objectivesErrorKey } from './data/objectives-errors';
import { ObjectiveDetail as ObjectiveDetailDto } from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  healthKey,
  healthTone,
  managementSystemKey,
  objectiveStatusKey,
  objectiveStatusTone,
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

/** Snapshot field -> label key, for the revisions tab. */
export const OBJECTIVE_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'objectives.fields.title',
  description: 'objectives.fields.description',
  management_system: 'objectives.fields.managementSystem',
  status: 'objectives.fields.status',
  owner_user_id: 'objectives.fields.owner',
  department_id: 'objectives.fields.department',
  target: 'objectives.fields.target',
  plan: 'objectives.fields.plan',
  resources: 'objectives.fields.resources',
  evaluation_method: 'objectives.fields.evaluationMethod',
  start_date: 'objectives.fields.startDate',
  due_date: 'objectives.fields.dueDate',
  progress: 'objectives.fields.progress',
  closing_note: 'objectives.fields.closingNote',
};

/**
 * `/objectives/:id`: an objective's target, plan and status, its KPIs and how
 * they are doing, plus the shared record tabs (tasks, related items, activity,
 * comments, attachments, revisions) and the clauses it is evidence for.
 */
@Component({
  selector: 'app-objective-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    MarkdownPipe,
    WatchButton,
    AskAbout,
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
    Icon,
    ProgressBar,
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
            routerLink="/objectives"
            class="mt-3 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'objectives.common.backToList' | transloco }}
          </a>
        </div>
      }
      @case ('ready') {
        @if (objective(); as o) {
          <app-record-detail-layout
            entityType="objective"
            [entityId]="o.id"
            [tabs]="tabs"
            [canEdit]="o.can_edit"
            [fieldLabels]="fieldLabels"
            backLink="/objectives"
            backLabelKey="objectives.common.backToList"
          >
            <div header>
              <p class="font-mono text-[12.5px] text-fg-subtle">{{ o.code }}</p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
              >
                {{ o.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(o.status)">{{
                  statusKey(o.status) | transloco
                }}</app-badge>
                @if (o.management_system) {
                  <app-badge tone="neutral">{{
                    systemKey(o.management_system) | transloco
                  }}</app-badge>
                }
                @if (o.overdue) {
                  <app-badge tone="fail">
                    <app-icon name="alert" [size]="12" />
                    {{ 'objectives.common.overdue' | transloco }}
                  </app-badge>
                }
              </div>
            </div>

            <ng-container actions>
              <app-watch-button entityType="objective" [entityId]="o.id" />
              <app-button variant="ghost" size="sm" (click)="askAi('summarise')">
                <app-icon name="spark" [size]="14" />
                {{ 'objectives.ai.summarise' | transloco }}
              </app-button>
              @if (o.can_edit) {
                <app-button variant="secondary" size="sm" (click)="edit()">
                  {{ 'objectives.detail.edit' | transloco }}
                </app-button>
              }
              @if (o.can_delete) {
                <app-button variant="danger" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'objectives.detail.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-4">
              <app-guide-intro [scope]="scope" page="detail" />

              <app-card>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-4 text-[13.5px] sm:grid-cols-2">
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ o.owner?.name ?? ('objectives.common.noOwner' | transloco) }}
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
                      {{ 'objectives.fields.startDate' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ (o.start_date | localDay) || '—' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.fields.dueDate' | transloco }}
                    </dt>
                    <dd [class.text-fail]="o.overdue" [class.text-fg]="!o.overdue">
                      {{ (o.due_date | localDay) || ('objectives.common.noDueDate' | transloco) }}
                    </dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="mb-1 text-[12px] font-semibold text-fg-muted">
                      {{ 'objectives.fields.progress' | transloco }}
                    </dt>
                    <dd>
                      <app-progress-bar
                        [value]="o.progress ?? 0"
                        [label]="'objectives.list.progress' | transloco: { value: o.progress ?? 0 }"
                      />
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <div class="flex items-start justify-between gap-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'objectives.fields.target' | transloco }}
                  </h2>
                  <app-ask-about
                    field="target"
                    labelKey="objectives.ai.askTarget"
                    [prompt]="askTargetPrompt()"
                  />
                </div>
                @if (o.target) {
                  <p class="mt-1 text-[13.5px] whitespace-pre-line text-fg">{{ o.target }}</p>
                } @else {
                  <p class="mt-1 text-[13.5px] text-fg-muted">
                    {{ 'objectives.detail.noTarget' | transloco }}
                  </p>
                }
                @if (o.description) {
                  <div
                    class="cf-markdown mt-3 text-[13.5px] text-fg-muted"
                    [innerHTML]="o.description | appMarkdown"
                  ></div>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'objectives.detail.planHeading' | transloco }}
                </h2>
                <dl class="flex flex-col gap-3 text-[13.5px]">
                  @for (f of planFields; track f.key) {
                    <div>
                      <dt class="text-[12px] font-semibold text-fg-muted">
                        {{ f.label | transloco }}
                      </dt>
                      <dd class="whitespace-pre-line text-fg">
                        {{ o[f.key] || ('objectives.detail.notSet' | transloco) }}
                      </dd>
                    </div>
                  }
                </dl>
              </app-card>

              @if (o.closed_at || o.closing_note) {
                <app-card>
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'objectives.fields.closingNote' | transloco }}
                  </h2>
                  @if (o.closed_at) {
                    <p class="text-[12px] text-fg-subtle">
                      {{
                        'objectives.detail.closedAt'
                          | transloco: { date: (o.closed_at | localDate) }
                      }}
                    </p>
                  }
                  <p class="mt-1 text-[13.5px] whitespace-pre-line text-fg">
                    {{ o.closing_note || ('objectives.detail.notSet' | transloco) }}
                  </p>
                </app-card>
              }

              <app-card [padded]="false">
                <div class="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2">
                  <h2 class="font-display text-[15px] font-bold text-fg">
                    {{ 'objectives.detail.kpisHeading' | transloco: { count: o.kpi_items.length } }}
                  </h2>
                  @if (o.can_edit) {
                    <a
                      [routerLink]="['/objectives/kpis/new']"
                      [queryParams]="{ objective: o.id }"
                      class="inline-flex items-center gap-1 rounded-tile px-2.5 py-1 text-[13px] font-semibold text-accent hover:bg-accent-soft"
                    >
                      <app-icon name="plus" [size]="13" />
                      {{ 'objectives.detail.addKpi' | transloco }}
                    </a>
                  }
                </div>
                @if (o.kpi_items.length === 0) {
                  <p class="px-4 pb-4 text-[13.5px] text-fg-muted">
                    {{ 'objectives.detail.noKpis' | transloco }}
                  </p>
                } @else {
                  <ul
                    class="divide-y divide-border border-t border-border"
                    data-testid="objective-kpis"
                  >
                    @for (k of o.kpi_items; track k.id) {
                      <li class="flex flex-wrap items-center gap-2 px-4 py-2.5">
                        <a
                          [routerLink]="['/objectives/kpis', k.id]"
                          class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg hover:underline"
                        >
                          <span class="font-mono text-[12px] text-fg-subtle">{{ k.code }}</span>
                          {{ k.name }}
                        </a>
                        <span class="text-[13px] text-fg">
                          @if (k.last_value !== null) {
                            {{ k.last_value | localNumber: '1.0-2' }} {{ k.unit }}
                          } @else {
                            <span class="text-fg-muted">{{
                              'objectives.common.noValue' | transloco
                            }}</span>
                          }
                        </span>
                        <app-badge [tone]="healthTone(k.last_status)">
                          {{ healthKey(k.last_status) | transloco }}
                        </app-badge>
                      </li>
                    }
                  </ul>
                }
              </app-card>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="objective"
                [entityId]="o.id"
                [canCreate]="o.can_edit"
                [defaultAssignee]="defaultAssignee()"
                [entityLabel]="o.code + ' ' + o.title"
              />
            </div>

            <ng-container aside>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="objective" [entityId]="o.id" />
              </app-card>
              <app-why-it-matters [scope]="scope" page="detail" />
              <details class="rounded-card border border-border bg-surface p-4">
                <summary class="cursor-pointer text-[13.5px] font-semibold text-fg">
                  {{ 'objectives.lessons.smartObjectives' | transloco }}
                </summary>
                <div class="mt-3"><app-lesson [scope]="scope" lesson="smart-objectives" /></div>
              </details>
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'objectives.detail.deleteTitle' | transloco"
            [message]="'objectives.detail.deleteMessage' | transloco: { code: o.code }"
            [confirmLabel]="'objectives.detail.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class ObjectiveDetail {
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
  protected readonly fieldLabels = OBJECTIVE_FIELD_LABELS;
  protected readonly statusKey = objectiveStatusKey;
  protected readonly statusTone = objectiveStatusTone;
  protected readonly systemKey = managementSystemKey;
  protected readonly healthKey = healthKey;
  protected readonly healthTone = healthTone;
  protected readonly planFields = [
    { key: 'plan', label: 'objectives.fields.plan' },
    { key: 'resources', label: 'objectives.fields.resources' },
    { key: 'evaluation_method', label: 'objectives.fields.evaluationMethod' },
  ] as const;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly objective = signal<ObjectiveDetailDto | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly busy = signal(false);

  protected readonly department = computed(() =>
    departmentName(this.options, this.objective()?.department_id ?? null),
  );
  protected readonly defaultAssignee = computed<AssigneeIn | null>(() => {
    const owner = this.objective()?.owner;
    return owner ? { type: 'user', value: owner.id } : null;
  });
  protected readonly askTargetPrompt = computed(() =>
    this.language.translate('objectives.ai.prompts.askTarget', {
      title: this.objective()?.title ?? '-',
      target: this.objective()?.target ?? '-',
    }),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    this.options.ensureLoaded();
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'objective',
      entityId: this.id(),
      view: 'detail',
      title: this.objective()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected edit(): void {
    void this.router.navigate(['/objectives', this.id(), 'edit']);
  }

  protected askAi(kind: 'summarise'): void {
    const o = this.objective();
    if (o) {
      this.ask.showWith(
        this.language.translate(`objectives.ai.prompts.${kind}Objective`, {
          code: o.code,
          title: o.title,
        }),
      );
    }
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, this.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('objectives.notices.deleted');
        void this.router.navigate(['/objectives']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(objectivesErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (o) => {
        this.objective.set(o);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
