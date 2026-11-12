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
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { ContextApi } from '../data/context-api';
import {
  ContextRecord,
  ControlledFields,
  ControlledStatus,
  LifecycleAction,
} from '../data/context.models';
import { KINDS, asKind, contextErrorKey, lifecycleActions, statusTone } from '../context-kinds';
import { injectContextPermissions } from '../context-permissions';
import { ContextLessonButton } from '../ui/context-lesson-button';
import { CommunicatePanel } from './communicate-panel';
import { RecordBody } from './record-body';

/** Snapshot field -> label key, for the revisions tab. */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'context.fields.title',
  name: 'context.fields.name',
  method: 'context.fields.method',
  framework: 'context.fields.framework',
  frameworks: 'context.fields.frameworks',
  summary: 'context.fields.summary',
  items: 'context.fields.items',
  category: 'context.fields.category',
  party_type: 'context.fields.partyType',
  description: 'context.fields.description',
  needs: 'context.fields.needs',
  expectations: 'context.fields.expectations',
  requirements: 'context.fields.requirements',
  is_compliance_obligation: 'context.fields.isComplianceObligation',
  addressed_status: 'context.fields.addressedStatus',
  how_addressed: 'context.fields.howAddressed',
  influence: 'context.fields.influence',
  interest: 'context.fields.interest',
  statement: 'context.fields.statement',
  boundaries: 'context.fields.boundaries',
  products_services: 'context.fields.productsServices',
  sites: 'context.fields.sites',
  exclusions: 'context.fields.exclusions',
  kind: 'context.fields.kind',
  area: 'context.fields.area',
  authorities: 'context.fields.authorities',
  assignments: 'context.fields.assignments',
  owner_user_id: 'context.fields.owner',
  review_interval_months: 'context.fields.reviewInterval',
  next_review_at: 'context.fields.nextReview',
  status: 'context.fields.status',
  version_no: 'context.fields.version',
};

type PromptAction = Exclude<LifecycleAction, 'submit'>;

/** Prompt dialog texts per lifecycle step (the reason is required only to return). */
const PROMPTS: Readonly<
  Record<PromptAction, { required: boolean; variant: 'primary' | 'danger' }>
> = {
  approve: { required: false, variant: 'primary' },
  return: { required: true, variant: 'primary' },
  review: { required: false, variant: 'primary' },
  retire: { required: false, variant: 'danger' },
};

/** The request body of a prompted lifecycle step. */
export function lifecycleBody(action: PromptAction, text: string): Record<string, string> {
  const value = text.trim();
  switch (action) {
    case 'approve':
      return value ? { comment: value } : {};
    case 'return':
      return { reason: value };
    case 'review':
      return value ? { notes: value } : {};
    case 'retire':
      return value ? { reason: value } : {};
  }
}

/**
 * The detail page of any M01 record (`/context/<segment>/:id`; kind from route
 * data): header with code, status and version; lifecycle actions for analyses,
 * scopes and policies (submit, approve, return, periodic review, retire);
 * "communicate" for approved policies; the shared record layout with related
 * items, activity timeline, comments, attachments, revision history and tasks;
 * clause evidence; learning-mode guidance and assistant actions.
 */
@Component({
  selector: 'app-context-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    PromptDialog,
    ContextLessonButton,
    CommunicatePanel,
    RecordBody,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
          {{ 'context.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-alert tone="error">{{ 'context.detail.notFound' | transloco }}</app-alert>
          <a
            [routerLink]="listPath()"
            class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
          >
            {{ 'context.kinds.' + kind() + '.back' | transloco }}
          </a>
        </div>
      }
      @case ('ready') {
        @if (record(); as r) {
          <app-record-detail-layout
            [entityType]="cfg().entityType"
            [entityId]="r.id"
            [tabs]="tabs"
            [canEdit]="r.can_edit"
            [fieldLabels]="fieldLabels"
            [backLink]="listPath()"
            [backLabelKey]="'context.kinds.' + kind() + '.back'"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] font-semibold text-fg-muted">{{
                  r.code
                }}</span>
                <app-badge [tone]="statusTone(r.status)">
                  {{ 'context.status.' + r.status | transloco }}
                </app-badge>
                @if (controlled(); as c) {
                  <span class="text-[12px] text-fg-subtle">
                    {{ 'context.common.version' | transloco: { version: c.version_no } }}
                  </span>
                  @if (c.review_overdue) {
                    <app-badge tone="fail">{{
                      'context.detail.reviewOverdue' | transloco
                    }}</app-badge>
                  }
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ title() }}
              </h1>
              <p class="mt-0.5 text-[12.5px] text-fg-muted">
                {{ 'context.kinds.' + kind() + '.one' | transloco }}
              </p>
            </div>

            <div
              actions
              class="flex flex-wrap items-center gap-2"
              role="group"
              [attr.aria-label]="'context.detail.actions' | transloco"
            >
              <app-watch-button [entityType]="cfg().entityType" [entityId]="r.id" />
              @if (r.can_edit) {
                <a [routerLink]="[listPath(), r.id, 'edit']" tabindex="-1">
                  <app-button variant="secondary" size="sm" data-testid="context-edit">
                    {{ 'context.actions.edit' | transloco }}
                  </app-button>
                </a>
              }
              @for (action of actions(); track action) {
                <app-button
                  [variant]="
                    action === 'approve' ? 'primary' : action === 'retire' ? 'ghost' : 'secondary'
                  "
                  size="sm"
                  [loading]="busy() === action"
                  [disabled]="!!busy()"
                  (click)="start(action)"
                  [attr.data-testid]="'context-' + action"
                >
                  {{ 'context.actions.' + action | transloco }}
                </app-button>
              }
              @if (canCommunicate()) {
                <app-button
                  size="sm"
                  (click)="communicateOpen.set(true)"
                  data-testid="context-communicate"
                >
                  <app-icon name="send" [size]="14" />
                  {{ 'context.actions.communicate' | transloco }}
                </app-button>
              }
              @if (perms.canManage()) {
                <app-button
                  variant="ghost"
                  size="sm"
                  [disabled]="!!busy()"
                  (click)="deleteOpen.set(true)"
                >
                  <app-icon name="trash" [size]="14" />
                  {{ 'context.actions.delete' | transloco }}
                </app-button>
              }
            </div>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="context" [page]="cfg().guidance + '-detail'" />
              @if (controlled(); as c) {
                @if (c.status === 'approved' && r.can_edit) {
                  <app-alert tone="info">{{ 'context.detail.approvedHint' | transloco }}</app-alert>
                }
                @if (c.status === 'retired') {
                  <app-alert tone="info">{{ 'context.detail.retiredHint' | transloco }}</app-alert>
                }
              }
              <div
                class="flex flex-wrap items-center gap-2"
                role="group"
                [attr.aria-label]="'context.ai.groupLabel' | transloco"
              >
                <app-button variant="ghost" size="sm" (click)="askAi('summarise')">
                  <app-icon name="spark" [size]="14" />
                  {{ 'context.ai.summarise' | transloco }}
                </app-button>
                <app-button variant="ghost" size="sm" (click)="askAi('improve')">
                  <app-icon name="spark" [size]="14" />
                  {{ 'context.ai.improve.' + kind() | transloco }}
                </app-button>
                <app-ask-about
                  [prompt]="'context.ai.prompts.explain' | transloco: { type: kindLabel() }"
                />
              </div>
              <app-context-record-body [kind]="kind()" [record]="r" />
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="cfg().entityType"
                [entityId]="r.id"
                [canCreate]="canCreateTasks()"
                [entityLabel]="r.code + ' ' + title()"
              />
            </div>

            <div aside class="flex flex-col gap-4">
              <app-card>
                <dl class="flex flex-col gap-3 text-[13px]">
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-subtle">
                      {{ 'context.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ r.owner?.name || ('context.fields.noOwner' | transloco) }}
                    </dd>
                  </div>
                  @if (controlled(); as c) {
                    @if (c.approved_at) {
                      <div>
                        <dt class="text-[12px] font-semibold text-fg-subtle">
                          {{ 'context.detail.approved' | transloco }}
                        </dt>
                        <dd class="text-fg">
                          {{
                            'context.detail.byOn'
                              | transloco
                                : {
                                    name: c.approved_by?.name || '–',
                                    date: (c.approved_at | localDate: 'mediumDate'),
                                  }
                          }}
                        </dd>
                      </div>
                    }
                    @if (c.submitted_at && c.status === 'in_review') {
                      <div>
                        <dt class="text-[12px] font-semibold text-fg-subtle">
                          {{ 'context.detail.submitted' | transloco }}
                        </dt>
                        <dd class="text-fg">
                          {{
                            'context.detail.byOn'
                              | transloco
                                : {
                                    name: c.submitted_by?.name || '–',
                                    date: (c.submitted_at | localDate: 'mediumDate'),
                                  }
                          }}
                        </dd>
                      </div>
                    }
                    <div>
                      <dt class="text-[12px] font-semibold text-fg-subtle">
                        {{ 'context.fields.reviewInterval' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        @if (c.review_interval_months) {
                          {{
                            'context.detail.everyMonths'
                              | transloco: { count: c.review_interval_months }
                          }}
                        } @else {
                          {{ 'context.common.notSet' | transloco }}
                        }
                      </dd>
                    </div>
                    @if (c.last_reviewed_at) {
                      <div>
                        <dt class="text-[12px] font-semibold text-fg-subtle">
                          {{ 'context.fields.lastReviewed' | transloco }}
                        </dt>
                        <dd class="text-fg">{{ c.last_reviewed_at | localDate: 'mediumDate' }}</dd>
                      </div>
                    }
                  }
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-subtle">
                      {{ 'context.fields.nextReview' | transloco }}
                    </dt>
                    <dd
                      [class.text-fail]="controlled()?.review_overdue"
                      [class.text-fg]="!controlled()?.review_overdue"
                    >
                      @if (r.next_review_at) {
                        {{ r.next_review_at | localDay: 'mediumDate' }}
                      } @else {
                        {{ 'context.common.notSet' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] font-semibold text-fg-subtle">
                      {{ 'context.fields.updated' | transloco }}
                    </dt>
                    <dd class="text-fg-muted">
                      {{
                        'context.detail.byOn'
                          | transloco
                            : {
                                name: r.updated_by?.name || r.created_by?.name || '–',
                                date: (r.updated_at | localDate: 'medium'),
                              }
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>
              <app-supports-requirements [entityType]="cfg().entityType" [entityId]="r.id" />
              <app-why-it-matters scope="context" [page]="cfg().guidance + '-detail'" />
              <div class="flex flex-col items-start gap-2">
                <app-context-lesson-button
                  [lessonKey]="
                    kind() === 'party'
                      ? 'interested-parties'
                      : kind() === 'policy' || kind() === 'responsibility'
                        ? 'policies-and-raci'
                        : 'context-foundation'
                  "
                />
              </div>
            </div>
          </app-record-detail-layout>

          <app-prompt-dialog
            [open]="!!prompt()"
            [title]="'context.lifecycle.' + (prompt() ?? 'approve') + '.title' | transloco"
            [message]="
              'context.lifecycle.' + (prompt() ?? 'approve') + '.message'
                | transloco: { title: title() }
            "
            [label]="'context.lifecycle.' + (prompt() ?? 'approve') + '.label' | transloco"
            [required]="promptRequired()"
            [confirmVariant]="promptVariant()"
            [confirmLabel]="'context.actions.' + (prompt() ?? 'approve') | transloco"
            [cancelLabel]="'context.common.cancel' | transloco"
            [busy]="!!busy()"
            (confirmed)="confirmPrompt($event)"
            (cancelled)="prompt.set(null)"
          />
          <app-confirm-dialog
            [open]="deleteOpen()"
            [title]="'context.delete.title' | transloco"
            [message]="'context.delete.message' | transloco: { title: title() }"
            [confirmLabel]="'context.actions.delete' | transloco"
            [cancelLabel]="'context.common.cancel' | transloco"
            [busy]="busy() === 'delete'"
            (confirmed)="remove()"
            (cancelled)="deleteOpen.set(false)"
          />
          @if (kind() === 'policy') {
            <app-context-communicate-panel
              [open]="communicateOpen()"
              [policyId]="r.id"
              [policyTitle]="r.code + ' · ' + title()"
              (closed)="communicateOpen.set(false)"
              (sent)="communicateOpen.set(false)"
            />
          }
        }
      }
    }
  `,
})
export class ContextDetail {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  /** Route param and data (component input binding). */
  readonly id = input.required<string>();
  readonly contextKind = input<unknown>(undefined);

  protected readonly kind = computed(() => asKind(this.contextKind()));
  protected readonly cfg = computed(() => KINDS[this.kind()]);
  protected readonly listPath = computed(() => `/context/${this.cfg().segment}`);
  protected readonly perms = injectContextPermissions();
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly tabs: readonly RecordTab[] = [
    'details',
    'related',
    'activity',
    'comments',
    'attachments',
    'revisions',
    'tasks',
  ];
  protected readonly statusTone = statusTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly record = signal<ContextRecord | null>(null);
  protected readonly busy = signal<LifecycleAction | 'delete' | null>(null);
  protected readonly prompt = signal<PromptAction | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly communicateOpen = signal(false);

  protected readonly title = computed(() => {
    const r = this.record();
    return r ? ('name' in r ? r.name : r.title) : '';
  });
  protected readonly kindLabel = computed(() =>
    this.language.translate(`context.kinds.${this.kind()}.one`),
  );

  /** The record's lifecycle fields (analyses, scopes and policies only). */
  protected readonly controlled = computed<ControlledFields | null>(() => {
    const r = this.record();
    return r && this.cfg().controlled ? (r as unknown as ControlledFields) : null;
  });

  /** Lifecycle buttons the caller may use on this record now. */
  protected readonly actions = computed<readonly LifecycleAction[]>(() => {
    const c = this.controlled();
    const r = this.record();
    if (!c || !r) {
      return [];
    }
    return lifecycleActions(c.status as ControlledStatus).filter((action) => {
      switch (action) {
        case 'submit':
          return r.can_edit;
        case 'retire':
          return this.perms.canManage();
        default:
          return c.can_approve || (action === 'review' && this.perms.canApprove());
      }
    });
  });

  protected readonly canCommunicate = computed(
    () =>
      this.kind() === 'policy' && this.controlled()?.status === 'approved' && this.perms.canWrite(),
  );
  protected readonly canCreateTasks = computed(
    () => !!this.selectedOrg.currentOrg()?.permissions.includes('tasks:write'),
  );
  protected readonly promptRequired = computed(() => {
    const p = this.prompt();
    return p ? PROMPTS[p].required : false;
  });
  protected readonly promptVariant = computed(() => {
    const p = this.prompt();
    return p ? PROMPTS[p].variant : 'primary';
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'context',
      entityType: this.cfg().entityType,
      entityId: this.id(),
      view: 'detail',
      title: this.title() || null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const kind = this.kind();
      untracked(() => this.load(orgId, kind, id));
    });
  }

  protected start(action: LifecycleAction): void {
    if (action === 'submit') {
      this.run('submit', {});
      return;
    }
    this.prompt.set(action);
  }

  protected confirmPrompt(text: string): void {
    const action = this.prompt();
    if (!action) {
      return;
    }
    this.run(action, lifecycleBody(action, text));
  }

  protected askAi(kind: 'summarise' | 'improve'): void {
    const r = this.record();
    if (!r) {
      return;
    }
    const key =
      kind === 'summarise'
        ? 'context.ai.prompts.summarise'
        : `context.ai.prompts.improve.${this.kind()}`;
    this.ask.askAbout(
      this.language.translate(key, { code: r.code, title: this.title(), type: this.kindLabel() }),
    );
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r) {
      return;
    }
    this.busy.set('delete');
    this.api.delete(orgId, this.kind(), r.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.deleteOpen.set(false);
        this.notifications.success('context.notices.deleted', { code: r.code });
        void this.router.navigateByUrl(this.listPath());
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.deleteOpen.set(false);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  private run(action: LifecycleAction, body: Record<string, string>): void {
    const orgId = this.selectedOrg.currentOrgId();
    const r = this.record();
    if (!orgId || !r || this.busy()) {
      return;
    }
    this.busy.set(action);
    this.api.transition(orgId, this.kind(), r.id, action, body).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.prompt.set(null);
        this.record.set(updated);
        this.notifications.success(`context.notices.${action}`, { code: updated.code });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.prompt.set(null);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, kind: ReturnType<typeof asKind>, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, kind, id).subscribe({
      next: (record) => {
        this.record.set(record);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
