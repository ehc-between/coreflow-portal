import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import { SJA_REASON_ACTIONS, Sja, SjaAction } from '../data/hse.models';
import { incompleteSteps, riskTone, sjaStatusTone } from '../hse-format';
import {
  HSE_MODULE,
  HseAskButton,
  departmentName,
  injectHsePermissions,
} from '../shared/hse-shared';

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
export const SJA_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'hse.sja.fields.title',
  job_description: 'hse.sja.fields.job_description',
  location: 'hse.sja.fields.location',
  work_start_at: 'hse.sja.fields.work_start_at',
  work_end_at: 'hse.sja.fields.work_end_at',
  owner_user_id: 'hse.sja.fields.owner',
  department_id: 'hse.common.department',
  participants: 'hse.sja.fields.participants',
  steps: 'hse.sja.edit.stepsSection',
  required_ppe: 'hse.sja.fields.required_ppe',
  risk_level: 'hse.sja.fields.risk_level',
  residual_risk_level: 'hse.sja.fields.residual_risk_level',
  emergency_measures: 'hse.sja.fields.emergency_measures',
  status: 'hse.common.status',
};

/** Primary (non-destructive) actions come first; cancel is shown last. */
const ACTION_ORDER: readonly SjaAction[] = [
  'submit',
  'approve',
  'complete',
  'return',
  'revise',
  'cancel',
];

/**
 * `/hse/sja/:id`: a safe job analysis — the job, its steps with hazards and
 * controls, required PPE, emergency measures and the approval trail; lifecycle
 * actions (submit, approve, return, revise, complete, cancel) from
 * `allowed_actions`; follow-up actions (F2 tasks), related records, activity,
 * comments, attachments and revisions; clause evidence.
 */
@Component({
  selector: 'app-sja-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    MarkdownPipe,
    Badge,
    Button,
    Card,
    Icon,
    ConfirmDialog,
    PromptDialog,
    RecordDetailLayout,
    EntityTasks,
    WatchButton,
    SupportsRequirements,
    GuideIntro,
    WhyItMatters,
    HseAskButton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sja(); as s) {
      <app-record-detail-layout
        entityType="sja"
        [entityId]="s.id"
        [tabs]="tabs"
        [canEdit]="perms.write()"
        [fieldLabels]="fieldLabels"
        backLink="/hse/sja"
        backLabelKey="hse.sja.list.back"
      >
        <div header>
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <span class="font-mono text-[12.5px] text-fg-subtle">{{ s.code }}</span>
            <app-badge [tone]="statusTone(s.status)">{{
              'hse.sja.status.' + s.status | transloco
            }}</app-badge>
            @if (s.residual_risk_level) {
              <app-badge [tone]="riskTone(s.residual_risk_level)">
                {{
                  'hse.sja.residualBadge'
                    | transloco: { level: ('hse.risk.' + s.residual_risk_level | transloco) }
                }}
              </app-badge>
            }
          </div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ s.title }}
          </h1>
        </div>

        <ng-container actions>
          <app-watch-button entityType="sja" [entityId]="s.id" />
          <app-hse-ask-button
            labelKey="hse.common.summarise"
            promptKey="hse.sja.ai.summarisePrompt"
            [params]="{ code: s.code }"
          />
          @for (action of actions(); track action) {
            <app-button
              [variant]="
                action === 'cancel'
                  ? 'ghost'
                  : action === 'submit' || action === 'approve' || action === 'complete'
                    ? 'primary'
                    : 'secondary'
              "
              size="sm"
              [disabled]="busy()"
              (click)="start(action)"
              [attr.data-testid]="'sja-action-' + action"
            >
              {{ 'hse.sja.actions.' + action | transloco }}
            </app-button>
          }
          @if (editable()) {
            <a [routerLink]="['/hse/sja', s.id, 'edit']" tabindex="-1">
              <app-button variant="secondary" size="sm">
                <app-icon name="sliders" [size]="14" />
                {{ 'hse.common.edit' | transloco }}
              </app-button>
            </a>
          }
          @if (canDelete()) {
            <app-button variant="ghost" size="sm" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="14" />
              {{ 'hse.common.delete' | transloco }}
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="hse" page="sja-detail" />
          @if (s.status === 'draft' && incomplete().length) {
            <p
              class="rounded-tile border border-warn/40 bg-warn-soft px-3 py-2 text-[13px] text-warn"
              role="status"
            >
              {{
                (s.steps.length ? 'hse.sja.detail.incomplete' : 'hse.sja.detail.noSteps')
                  | transloco: { steps: incompleteLabel() }
              }}
            </p>
          }
          <app-card>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.sja.fields.location' | transloco }}
                </dt>
                <dd class="text-fg">{{ s.location || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.sja.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">{{ s.owner?.name || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.sja.detail.period' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (s.work_start_at || s.work_end_at) {
                    {{ s.work_start_at | localDate: 'medium' }} –
                    {{ s.work_end_at | localDate: 'medium' }}
                  } @else {
                    —
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.common.department' | transloco }}
                </dt>
                <dd class="text-fg">{{ department() || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.sja.fields.risk_level' | transloco }}
                </dt>
                <dd>
                  @if (s.risk_level) {
                    <app-badge [tone]="riskTone(s.risk_level)">{{
                      'hse.risk.' + s.risk_level | transloco
                    }}</app-badge>
                  } @else {
                    —
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.sja.fields.residual_risk_level' | transloco }}
                </dt>
                <dd>
                  @if (s.residual_risk_level) {
                    <app-badge [tone]="riskTone(s.residual_risk_level)">{{
                      'hse.risk.' + s.residual_risk_level | transloco
                    }}</app-badge>
                  } @else {
                    —
                  }
                </dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.sja.fields.job_description' | transloco }}
                </dt>
                <dd
                  class="cf-prose text-fg"
                  [innerHTML]="s.job_description || '—' | appMarkdown"
                ></dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-subtle">
                  {{ 'hse.sja.fields.participants' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ s.participants.length ? s.participants.join(', ') : '—' }}
                </dd>
              </div>
            </dl>
          </app-card>

          <app-card>
            <h2
              class="mb-3 flex flex-wrap items-center gap-2 font-display text-[16px] font-bold text-fg"
            >
              {{ 'hse.sja.edit.stepsSection' | transloco }}
              <span class="text-[12.5px] font-semibold text-fg-muted">
                {{
                  'hse.sja.list.counts'
                    | transloco: { hazards: s.hazard_count, controls: s.control_count }
                }}
              </span>
            </h2>
            @if (s.steps.length) {
              <ol class="flex flex-col gap-3">
                @for (step of s.steps; track $index; let i = $index) {
                  <li class="rounded-tile border border-border p-3">
                    <div class="mb-2 flex flex-wrap items-center gap-2">
                      <span class="text-[12px] font-bold text-fg-subtle">{{ i + 1 }}.</span>
                      <span class="flex-1 font-semibold text-fg">{{ step.description }}</span>
                      @if (step.risk_level) {
                        <app-badge [tone]="riskTone(step.risk_level)">{{
                          'hse.risk.' + step.risk_level | transloco
                        }}</app-badge>
                      }
                    </div>
                    <div class="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                      <div>
                        <h3 class="text-[12px] font-semibold text-fail">
                          {{ 'hse.sja.fields.hazards' | transloco }}
                        </h3>
                        <ul class="list-disc pl-5 text-fg">
                          @for (h of step.hazards; track $index) {
                            <li>{{ h }}</li>
                          } @empty {
                            <li class="list-none text-fg-subtle">
                              {{ 'hse.sja.detail.noneYet' | transloco }}
                            </li>
                          }
                        </ul>
                      </div>
                      <div>
                        <h3 class="text-[12px] font-semibold text-pass">
                          {{ 'hse.sja.fields.controls' | transloco }}
                        </h3>
                        <ul class="list-disc pl-5 text-fg">
                          @for (c of step.controls; track $index) {
                            <li>{{ c }}</li>
                          } @empty {
                            <li class="list-none text-fg-subtle">
                              {{ 'hse.sja.detail.noneYet' | transloco }}
                            </li>
                          }
                        </ul>
                      </div>
                    </div>
                    @if (step.responsible) {
                      <p class="mt-2 text-[12.5px] text-fg-muted">
                        {{ 'hse.sja.detail.responsible' | transloco: { name: step.responsible } }}
                      </p>
                    }
                  </li>
                }
              </ol>
            } @else {
              <p class="text-[13.5px] text-fg-muted">
                {{ 'hse.sja.detail.noStepsYet' | transloco }}
              </p>
            }
          </app-card>

          <app-card>
            <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
              {{ 'hse.sja.fields.required_ppe' | transloco }}
            </h2>
            <div class="flex flex-wrap gap-1.5">
              @for (p of s.required_ppe; track p) {
                <app-badge tone="accent">{{ 'hse.ppeCategory.' + p | transloco }}</app-badge>
              } @empty {
                <span class="text-[13.5px] text-fg-muted">—</span>
              }
            </div>
            <h2 class="mt-4 mb-2 font-display text-[16px] font-bold text-fg">
              {{ 'hse.sja.fields.emergency_measures' | transloco }}
            </h2>
            <div
              class="cf-prose text-[13.5px] text-fg"
              [innerHTML]="s.emergency_measures || '—' | appMarkdown"
            ></div>
          </app-card>
        </div>

        <app-entity-tasks
          tasks
          entityType="sja"
          [entityId]="s.id"
          [canCreate]="perms.write()"
          [entityLabel]="s.code + ' ' + s.title"
        />

        <ng-container aside>
          <app-card>
            <h2 class="mb-2 text-[12px] font-bold tracking-wide text-fg-subtle uppercase">
              {{ 'hse.sja.detail.approval' | transloco }}
            </h2>
            <dl class="flex flex-col gap-2 text-[13px]">
              <div>
                <dt class="text-fg-subtle">{{ 'hse.sja.detail.submittedAt' | transloco }}</dt>
                <dd class="text-fg">{{ (s.submitted_at | localDate: 'medium') || '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'hse.sja.detail.approvedBy' | transloco }}</dt>
                <dd class="text-fg">
                  @if (s.approved_by) {
                    {{ s.approved_by.name }} · {{ s.approved_at | localDate: 'medium' }}
                  } @else {
                    —
                  }
                </dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'hse.sja.detail.completedAt' | transloco }}</dt>
                <dd class="text-fg">{{ (s.completed_at | localDate: 'medium') || '—' }}</dd>
              </div>
              <div>
                <dt class="text-fg-subtle">{{ 'hse.common.createdBy' | transloco }}</dt>
                <dd class="text-fg">
                  {{ s.created_by?.name || '—' }} · {{ s.created_at | localDate: 'mediumDate' }}
                </dd>
              </div>
            </dl>
          </app-card>
          <app-why-it-matters scope="hse" page="sja-detail" />
          <app-supports-requirements entityType="sja" [entityId]="s.id" />
        </ng-container>
      </app-record-detail-layout>

      <app-prompt-dialog
        [open]="reasonAction() !== null"
        [title]="'hse.sja.actions.' + (reasonAction() ?? 'cancel') | transloco"
        [message]="'hse.sja.reasonMessage.' + (reasonAction() ?? 'cancel') | transloco"
        [label]="'hse.common.reason' | transloco"
        [required]="true"
        [busy]="busy()"
        [confirmVariant]="reasonAction() === 'cancel' ? 'danger' : 'primary'"
        [confirmLabel]="'hse.sja.actions.' + (reasonAction() ?? 'cancel') | transloco"
        [cancelLabel]="'hse.common.cancel' | transloco"
        (confirmed)="run(reasonAction()!, $event)"
        (cancelled)="reasonAction.set(null)"
      />
      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'hse.sja.deleteTitle' | transloco"
        [message]="'hse.sja.deleteMessage' | transloco: { code: s.code }"
        [confirmLabel]="'hse.common.delete' | transloco"
        [cancelLabel]="'hse.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 py-10 text-center sm:px-8">
        <p class="text-[14px] text-fail" role="alert">{{ 'hse.common.notFound' | transloco }}</p>
        <a routerLink="/hse/sja" class="mt-3 inline-block text-[13px] font-semibold text-accent">
          {{ 'hse.sja.list.back' | transloco }}
        </a>
      </div>
    } @else {
      <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
        {{ 'hse.common.loading' | transloco }}
      </p>
    }
  `,
})
export class SjaDetail {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly directory = inject(AssigneeOptionsService);

  protected readonly perms = injectHsePermissions();
  protected readonly tabs = TABS;
  protected readonly fieldLabels = SJA_FIELD_LABELS;
  protected readonly statusTone = sjaStatusTone;
  protected readonly riskTone = riskTone;

  private readonly id = signal(inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '');
  protected readonly sja = signal<Sja | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly busy = signal(false);
  protected readonly reasonAction = signal<SjaAction | null>(null);
  protected readonly deleteOpen = signal(false);

  protected readonly actions = computed(() => {
    const allowed = this.sja()?.allowed_actions ?? [];
    return ACTION_ORDER.filter((a) => allowed.includes(a));
  });
  protected readonly editable = computed(() => {
    const s = this.sja();
    return (
      !!s && s.can_edit && (s.status === 'draft' || s.status === 'in_review') && this.perms.write()
    );
  });
  protected readonly canDelete = computed(() => {
    const s = this.sja();
    if (!s) {
      return false;
    }
    if (this.perms.manage()) {
      return true;
    }
    return this.perms.write() && s.status === 'draft' && s.created_by?.id === this.auth.user()?.id;
  });
  protected readonly incomplete = computed(() => {
    const s = this.sja();
    if (!s) {
      return [];
    }
    return s.steps.length ? incompleteSteps(s.steps) : [-1];
  });
  protected readonly incompleteLabel = computed(() =>
    this.incomplete()
      .filter((i) => i >= 0)
      .map((i) => i + 1)
      .join(', '),
  );
  protected readonly department = computed(() =>
    departmentName(this.directory, this.sja()?.department_id ?? null),
  );

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'sja',
      entityId: this.id() || null,
      view: 'detail',
      title: this.sja()?.title ?? null,
    }));
    this.directory.ensureLoaded();

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() => this.load(orgId, id));
      }
    });
  }

  private load(orgId: string, id: string): void {
    this.api.getSja(orgId, id).subscribe({
      next: (sja) => {
        this.sja.set(sja);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected start(action: SjaAction): void {
    if (SJA_REASON_ACTIONS.includes(action)) {
      this.reasonAction.set(action);
      return;
    }
    this.run(action, null);
  }

  protected run(action: SjaAction, reason: string | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.sja();
    if (!orgId || !s || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.transitionSja(orgId, s.id, action, reason).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.reasonAction.set(null);
        this.sja.set(updated);
        this.notifications.success(`hse.sja.done.${action}`, { code: updated.code });
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.sja();
    if (!orgId || !s || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteSja(orgId, s.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('hse.common.deleted', { code: s.code });
        void this.router.navigate(['/hse/sja']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
