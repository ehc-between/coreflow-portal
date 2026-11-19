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
import { AskPanelService } from '../../ask/ask-panel.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
  StatusLineTone,
} from '../../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RiskApi } from '../data/risk-api';
import { opportunityStatusValue } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import { OPPORTUNITY_STATUSES, Opportunity, OpportunityStatus } from '../data/risk.models';
import { OpportunityScore } from '../shared/opportunity-score';
import { RiskPermissions } from '../shared/risk-permissions';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
];

/** Tone of the status sentence: realised is done (green), open work is a to-do. */
const STATUS_TONE: Readonly<Record<OpportunityStatus, StatusLineTone>> = {
  identified: 'warn',
  evaluating: 'warn',
  planned: 'info',
  in_progress: 'info',
  realised: 'pass',
  rejected: 'neutral',
};

export function opportunityTone(status: OpportunityStatus): StatusLineTone {
  return STATUS_TONE[status] ?? 'neutral';
}

/** What an opportunity still needs ("Oppfølging", docs/ux-guide.md §2.7). */
export function opportunityMissing(
  o: Opportunity,
  editLink: readonly unknown[],
): RecordMissingItem[] {
  if (!o.can_edit || o.status === 'realised' || o.status === 'rejected') {
    return [];
  }
  const items: RecordMissingItem[] = [];
  if (o.overdue) {
    items.push({ key: 'overdue', labelKey: 'risk.opportunities.missing.overdue', link: editLink });
  }
  if (o.benefit === null || o.feasibility === null) {
    items.push({ key: 'score', labelKey: 'risk.opportunities.missing.score', link: editLink });
  }
  const actions = o.actions ? o.actions.open + o.actions.done : 0;
  if (!o.action_plan?.trim() && actions === 0) {
    items.push({ key: 'plan', labelKey: 'risk.opportunities.missing.plan', link: editLink });
  }
  if (!o.owner) {
    items.push({ key: 'owner', labelKey: 'risk.opportunities.missing.owner', link: editLink });
  }
  return items;
}

/**
 * One opportunity, on the detail-page anatomy (docs/ux-guide.md §2.7):
 * "Hovedinformasjon" says what it is, how valuable it is (benefit x feasibility),
 * how we will realise it and what it concerns; the action items (tasks, in the
 * owners' My Work) have their own tab; the "Oppfølging" card holds what is
 * missing, the requirements, the connections and owner / due date. "Create from
 * this" turns it into a task, an objective or a project that links back.
 */
@Component({
  selector: 'app-opportunity-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    EntityChip,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    EntityTasks,
    Alert,
    Badge,
    Button,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FormField,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    OpportunityScore,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (opportunity(); as o) {
      <app-record-detail-layout
        [anatomy]="true"
        entityType="opportunity"
        [entityId]="o.id"
        [title]="o.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.risk', link: '/risk' },
          { labelKey: 'risk.opportunities.title', link: '/risk/opportunities' },
          { label: o.code },
        ]"
        settingsLink="/settings/modules/risk"
        [tabs]="tabs"
        [counts]="{ tasks: o.actions?.open ?? 0 }"
        [canEdit]="o.can_edit"
        [requirementsPanel]="true"
        [includeAudit]="perms.canReadAudit()"
        [missing]="missing()"
        backLink="/risk/opportunities"
        backLabelKey="risk.common.backToOpportunities"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono">{{ o.code }}</span>
          @if (o.register; as reg) {
            <span aria-hidden="true">·</span>
            <a
              [routerLink]="['/settings/modules/risk/registers', reg.id]"
              class="hover:text-fg hover:underline"
              >{{ reg.name }}</a
            >
          }
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(o.status)"
            [labelKey]="'risk.opportunities.status.' + o.status"
          />
          @if (o.overdue) {
            <app-badge tone="warn">{{ 'risk.opportunities.overdue' | transloco }}</app-badge>
          }
        </ng-container>

        @if (o.can_edit) {
          <app-button primary (click)="edit()">{{ 'risk.common.edit' | transloco }}</app-button>
        }
        @if (o.can_edit) {
          <button
            appMenuItem
            overflow
            type="button"
            (click)="openStatus()"
            data-testid="opportunity-change-status"
          >
            {{ 'risk.detail.changeStatusAction' | transloco }}
          </button>
        }
        @if (o.can_delete) {
          <button appMenuItem overflow type="button" [danger]="true" (click)="deleteOpen.set(true)">
            {{ 'risk.common.delete' | transloco }}
          </button>
        }

        <button appMenuItem ask type="button" (click)="explain()">
          <app-icon name="spark" [size]="15" />
          {{ 'risk.ai.explainOpportunity' | transloco }}
        </button>

        <app-help-strip help scope="risk" page="opportunityDetail" lesson="opportunities" />

        <app-record-lead record-lead [fillLink]="o.can_edit ? editLink() : null">
          <app-record-status-line
            status
            [tone]="tone(o.status)"
            data-testid="opportunity-status-line"
          >
            {{ 'risk.opportunities.statusLine.' + o.status | transloco }}
          </app-record-status-line>
          <app-field-item
            size="lead"
            labelKey="risk.opportunities.lead.what"
            [wide]="true"
            [value]="o.description"
            [multiline]="true"
          />
          <app-field-item size="lead" labelKey="risk.opportunities.lead.value">
            @if (o.score !== null) {
              <span class="flex flex-col gap-1.5">
                <app-opportunity-score [score]="o.score" [max]="o.max_score ?? 25" />
                <span class="text-ui text-fg-muted">
                  {{ 'risk.fields.benefit' | transloco }}: {{ scaleText(o.benefit) }}
                  <span aria-hidden="true"> · </span>
                  {{ 'risk.fields.feasibility' | transloco }}: {{ scaleText(o.feasibility) }}
                </span>
              </span>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="risk.opportunities.lead.plan">
            @if (o.action_plan || (o.actions && o.actions.open + o.actions.done > 0)) {
              <span class="flex flex-col gap-1">
                @if (o.action_plan) {
                  <span class="whitespace-pre-line">{{ o.action_plan }}</span>
                }
                @if (o.actions && o.actions.open + o.actions.done > 0) {
                  <span class="text-ui text-fg-muted">{{
                    'risk.detail.treatmentCounts'
                      | transloco: { open: o.actions.open, done: o.actions.done }
                  }}</span>
                }
              </span>
            }
          </app-field-item>
          <app-field-item size="lead" labelKey="risk.opportunities.lead.concerns">
            @if (o.source_type || o.source_entity || o.source_ref) {
              <span class="flex flex-col gap-1">
                @if (o.source_type) {
                  <span>{{ 'risk.sourceTypes.' + o.source_type | transloco }}</span>
                }
                @if (o.source_entity; as entity) {
                  <app-entity-chip [ref]="entity" />
                } @else if (o.source_ref) {
                  <span class="text-ui text-fg-muted">{{ o.source_ref }}</span>
                }
              </span>
            }
          </app-field-item>
        </app-record-lead>

        <div class="flex flex-col gap-5">
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          <app-record-details [columns]="2" [fillLink]="o.can_edit ? editLink() : null">
            <app-field-item
              labelKey="risk.fields.benefit"
              [value]="o.benefit !== null ? levelText('benefit', o.benefit) : null"
            />
            <app-field-item
              labelKey="risk.fields.feasibility"
              [value]="o.feasibility !== null ? levelText('feasibility', o.feasibility) : null"
            />
            <app-field-item labelKey="risk.fields.department" [value]="o.department?.name" />
          </app-record-details>
          @if (o.score !== null) {
            <p class="text-meta text-fg-subtle">
              {{ 'risk.opportunities.scoreHint' | transloco }}
            </p>
          }
        </div>

        <div tasks>
          <p class="mb-3 text-ui text-fg-muted">
            {{ 'risk.opportunities.actionsHint' | transloco }}
          </p>
          <app-entity-tasks
            entityType="opportunity"
            [entityId]="o.id"
            [canCreate]="o.can_edit && perms.canWriteTasks()"
            [entityLabel]="o.code + ' ' + o.title"
          />
        </div>

        <app-record-meta follow-up-meta>
          <app-field-item layout="inline" labelKey="risk.fields.owner" [value]="o.owner?.name" />
          <app-field-item layout="inline" labelKey="risk.fields.dueAt">
            @if (o.due_at) {
              <span [class.text-warn-ink]="o.overdue">{{ o.due_at | localDay }}</span>
            }
          </app-field-item>
          <app-field-item
            layout="inline"
            labelKey="risk.fields.realisedAt"
            [value]="o.realised_at ? (o.realised_at | localDay) : null"
          />
          <app-field-item
            layout="inline"
            labelKey="risk.fields.updatedAt"
            [value]="o.updated_at | localDate"
          />
        </app-record-meta>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="statusOpen()"
        [title]="'risk.detail.statusTitle' | transloco"
        confirmVariant="primary"
        [confirmLabel]="'risk.common.save' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        (confirmed)="setStatus()"
        (cancelled)="statusOpen.set(false)"
      >
        <div class="mt-3" data-testid="opportunity-status-dialog">
          <app-form-field [label]="'risk.detail.newStatus' | transloco" inputId="opp-status">
            <select id="opp-status" (change)="statusChoice.set($any($event.target).value)">
              @for (s of statuses; track s) {
                <option [value]="s" [selected]="s === statusChoice()">
                  {{ 'risk.opportunities.status.' + s | transloco }}
                </option>
              }
            </select>
          </app-form-field>
        </div>
      </app-confirm-dialog>

      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'risk.opportunities.deleteTitle' | transloco"
        [message]="'risk.detail.deleteMessage' | transloco: { code: o.code }"
        [confirmLabel]="'risk.common.delete' | transloco"
        [cancelLabel]="'risk.common.cancel' | transloco"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-error-state [bodyKey]="loadErrorKey()" (retry)="reload()" />
      </div>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-loading-state [rows]="5" />
      </div>
    }
  `,
})
export class OpportunityDetailPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly lang = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  protected readonly perms = inject(RiskPermissions);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly statuses = OPPORTUNITY_STATUSES;
  protected readonly statusValue = opportunityStatusValue;
  protected readonly tone = opportunityTone;
  protected readonly opportunity = signal<Opportunity | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('risk.common.loadFailed');
  protected readonly errorKey = signal<string | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly statusOpen = signal(false);
  protected readonly statusChoice = signal<OpportunityStatus>('identified');
  private readonly revision = signal(0);
  private sub: Subscription | null = null;

  protected readonly title = computed(() => this.opportunity()?.title ?? null);
  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/risk/opportunities',
    this.id(),
    'edit',
  ]);
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const o = this.opportunity();
    return o ? opportunityMissing(o, this.editLink()) : [];
  });

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'opportunity',
      entityId: this.id(),
      view: 'detail',
      title: this.title(),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      this.revision();
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.sub = this.api.getOpportunity(orgId, id).subscribe({
          next: (o) => {
            this.opportunity.set(o);
            this.state.set('ready');
          },
          error: (e: unknown) => {
            this.loadErrorKey.set(riskErrorKey(e));
            this.state.set('error');
          },
        });
      });
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.revision.update((n) => n + 1);
  }

  /** "4 · Høy" for a 1-5 level, "Ikke satt" when empty. */
  protected scaleText(value: number | null): string {
    return value === null
      ? this.t('common.empty.notSet')
      : `${value} · ${this.t('risk.opportunities.scale.' + value)}`;
  }

  /** "4 – En stor gevinst for flere områder eller kunder": what the level means. */
  protected levelText(kind: 'benefit' | 'feasibility', value: number): string {
    return `${value} – ${this.t(`risk.opportunities.levels.${kind}.${value}`)}`;
  }

  private t(key: string): string {
    return this.lang.translate(key);
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
  }

  protected explain(): void {
    this.ask.askAbout(this.t('risk.ask.opportunity'), { field: 'score' });
  }

  protected openStatus(): void {
    const o = this.opportunity();
    if (!o) {
      return;
    }
    this.statusChoice.set(o.status);
    this.statusOpen.set(true);
  }

  protected setStatus(): void {
    const orgId = this.perms.orgId();
    const current = this.opportunity();
    const value = this.statusChoice();
    this.statusOpen.set(false);
    if (!orgId || !current || value === current.status) {
      return;
    }
    this.api.updateOpportunity(orgId, current.id, { status: value }).subscribe({
      next: (o) => {
        this.opportunity.set(o);
        this.toasts.success('risk.notices.statusChanged', { code: o.code });
      },
      error: (e: unknown) => {
        this.errorKey.set(riskErrorKey(e));
        this.opportunity.set({ ...current });
      },
    });
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    const current = this.opportunity();
    this.deleteOpen.set(false);
    if (!orgId || !current) {
      return;
    }
    this.api.deleteOpportunity(orgId, current.id).subscribe({
      next: () => {
        this.toasts.success('risk.notices.deleted', { code: current.code });
        void this.router.navigate(['/risk/opportunities']);
      },
      error: (e: unknown) => this.errorKey.set(riskErrorKey(e)),
    });
  }
}
