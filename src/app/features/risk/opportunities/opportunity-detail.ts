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
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
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

/**
 * One opportunity: what it concerns (a real record where there is one), benefit x
 * feasibility out of 25, the action items (tasks on the opportunity, in the owners'
 * My Work) and the record kit tabs. "Create from this" turns it into a task, an
 * objective or a project that links back.
 */
@Component({
  selector: 'app-opportunity-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    EntityChip,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    EntityTasks,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    LoadingState,
    MenuItem,
    StatusBadge,
    OpportunityScore,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (opportunity(); as o) {
      <app-record-detail-layout
        entityType="opportunity"
        [entityId]="o.id"
        [title]="o.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.risk', link: '/risk' },
          { labelKey: 'risk.opportunities.title', link: '/risk/opportunities' },
          { label: o.code },
        ]"
        settingsLink="/risk/registers"
        [tabs]="tabs"
        [counts]="{ tasks: o.actions?.open ?? 0 }"
        [canEdit]="o.can_edit"
        [requirementsPanel]="true"
        [includeAudit]="perms.canReadAudit()"
        backLink="/risk/opportunities"
        backLabelKey="risk.common.backToOpportunities"
      >
        <ng-container ngProjectAs="[meta]">
          <span class="font-mono">{{ o.code }}</span>
          @if (o.register; as reg) {
            <span aria-hidden="true">·</span>
            <a [routerLink]="['/risk/registers', reg.id]" class="hover:text-fg hover:underline">{{
              reg.name
            }}</a>
          }
          <app-status-badge
            meaning="lifecycle"
            [value]="statusValue(o.status)"
            [labelKey]="'risk.opportunities.status.' + o.status"
          />
          <app-opportunity-score [score]="o.score" [max]="o.max_score ?? 25" />
          @if (o.overdue) {
            <app-badge tone="warn">{{ 'risk.opportunities.overdue' | transloco }}</app-badge>
          }
          <app-watch-button entityType="opportunity" [entityId]="o.id" />
        </ng-container>

        @if (o.can_edit) {
          <app-button primary size="sm" (click)="edit()">{{
            'risk.common.edit' | transloco
          }}</app-button>
        }
        @if (o.can_delete) {
          <button appMenuItem overflow [danger]="true" (click)="deleteOpen.set(true)">
            {{ 'risk.common.delete' | transloco }}
          </button>
        }

        <div class="flex flex-col gap-5">
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          <app-card>
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'risk.opportunities.what' | transloco }}
            </h2>
            @if (o.description) {
              <p class="mb-4 text-body whitespace-pre-line text-fg">{{ o.description }}</p>
            }
            <app-field-list>
              <app-field-item labelKey="risk.opportunities.concerns" [wide]="true">
                <div class="flex flex-wrap items-center gap-2">
                  @if (o.source_type) {
                    <span>{{ 'risk.sourceTypes.' + o.source_type | transloco }}</span>
                  }
                  @if (o.source_entity; as entity) {
                    <app-entity-chip [ref]="entity" />
                  } @else if (o.source_ref) {
                    <span class="text-fg-muted">· {{ o.source_ref }}</span>
                  } @else if (!o.source_type) {
                    <span class="text-fg-muted">{{ 'common.empty.notSet' | transloco }}</span>
                  }
                </div>
              </app-field-item>
              <app-field-item
                labelKey="risk.fields.actionPlan"
                [value]="o.action_plan"
                [wide]="true"
                [multiline]="true"
              />
            </app-field-list>
          </app-card>

          <app-card>
            <h2 class="mb-3 flex items-center gap-1.5 font-display text-section font-bold text-fg">
              {{ 'risk.opportunities.evaluation' | transloco }}
              <app-ask-about [prompt]="'risk.ask.opportunity' | transloco" field="score" />
            </h2>
            <dl class="grid grid-cols-1 gap-3 text-body sm:grid-cols-3">
              <div>
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'risk.fields.benefit' | transloco }}
                </dt>
                <dd class="text-fg">{{ scaleText(o.benefit) }}</dd>
              </div>
              <div>
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'risk.fields.feasibility' | transloco }}
                </dt>
                <dd class="text-fg">{{ scaleText(o.feasibility) }}</dd>
              </div>
              <div>
                <dt class="text-meta font-semibold text-fg-muted">
                  {{ 'risk.fields.score' | transloco }}
                </dt>
                <dd><app-opportunity-score [score]="o.score" [max]="o.max_score ?? 25" /></dd>
              </div>
            </dl>
            <p class="mt-3 text-meta text-fg-muted">
              {{ 'risk.opportunities.scoreHint' | transloco }}
            </p>
            @if (o.can_edit) {
              <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <label for="opp-status" class="text-meta font-semibold text-fg-muted">
                  {{ 'risk.detail.changeStatus' | transloco }}
                </label>
                <select
                  id="opp-status"
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                  (change)="setStatus($any($event.target).value)"
                >
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="s === o.status">
                      {{ 'risk.opportunities.status.' + s | transloco }}
                    </option>
                  }
                </select>
              </div>
            }
          </app-card>
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

        <app-card aside>
          <h2 class="mb-3 text-card font-semibold text-fg">
            {{ 'risk.detail.summary' | transloco }}
          </h2>
          <app-field-list [columns]="1">
            <app-field-item labelKey="risk.fields.owner" [value]="o.owner?.name" empty="none" />
            <app-field-item labelKey="risk.fields.department" [value]="o.department?.name" />
            <app-field-item
              labelKey="risk.fields.dueAt"
              [value]="o.due_at ? (o.due_at | localDay) : null"
            />
            @if (o.realised_at) {
              <app-field-item
                labelKey="risk.fields.realisedAt"
                [value]="o.realised_at | localDay"
              />
            }
            <app-field-item labelKey="risk.fields.updatedAt" [value]="o.updated_at | localDate" />
          </app-field-list>
        </app-card>

        <app-help-strip aside-learn scope="risk" page="opportunityDetail" lesson="opportunities" />
      </app-record-detail-layout>

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
  protected readonly perms = inject(RiskPermissions);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly statuses = OPPORTUNITY_STATUSES;
  protected readonly statusValue = opportunityStatusValue;
  protected readonly opportunity = signal<Opportunity | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('risk.common.loadFailed');
  protected readonly errorKey = signal<string | null>(null);
  protected readonly deleteOpen = signal(false);
  private readonly revision = signal(0);
  private sub: Subscription | null = null;

  protected readonly title = computed(() => this.opportunity()?.title ?? null);

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

  private t(key: string): string {
    return this.lang.translate(key);
  }

  protected edit(): void {
    void this.router.navigate(['/risk/opportunities', this.id(), 'edit']);
  }

  protected setStatus(value: string): void {
    const orgId = this.perms.orgId();
    const current = this.opportunity();
    if (!orgId || !current || value === current.status) {
      return;
    }
    this.api
      .updateOpportunity(orgId, current.id, { status: value as OpportunityStatus })
      .subscribe({
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
