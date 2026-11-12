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
import { NotificationService } from '../../../core/notifications/notification.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { RiskApi } from '../data/risk-api';
import { opportunityStatusTone } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import { OPPORTUNITY_STATUSES, Opportunity, OpportunityStatus } from '../data/risk.models';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/** One opportunity: evaluation, plan, owner, status and the record kit tabs. */
@Component({
  selector: 'app-opportunity-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (opportunity(); as o) {
      <app-record-detail-layout
        entityType="opportunity"
        [entityId]="o.id"
        [tabs]="tabs"
        [canEdit]="o.can_edit"
        [includeAudit]="perms.canReadAudit()"
        backLink="/risk/opportunities"
        backLabelKey="risk.common.backToOpportunities"
      >
        <div header>
          <p class="mb-1 font-mono text-[12.5px] text-fg-subtle">{{ o.code }}</p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ o.title }}
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <app-badge [tone]="tone()">{{
              'risk.opportunities.status.' + o.status | transloco
            }}</app-badge>
            @if (o.overdue) {
              <app-badge tone="fail">{{ 'risk.opportunities.overdue' | transloco }}</app-badge>
            }
          </div>
        </div>
        <ng-container actions>
          <app-watch-button entityType="opportunity" [entityId]="o.id" />
          @if (o.can_edit) {
            <app-button size="sm" (click)="edit()">{{ 'risk.common.edit' | transloco }}</app-button>
          }
          @if (o.can_delete) {
            <app-button size="sm" variant="ghost" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="14" />
              <span class="sr-only sm:not-sr-only">{{ 'risk.common.delete' | transloco }}</span>
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-5">
          <app-risk-page-guide page="opportunityDetail" />
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          <app-card>
            <h2 class="mb-3 flex items-center gap-1.5 font-display text-[16px] font-bold text-fg">
              {{ 'risk.opportunities.evaluation' | transloco }}
              <app-ask-about [prompt]="'risk.ask.opportunity' | transloco" field="score" />
            </h2>
            <dl class="grid grid-cols-3 gap-3 text-[13.5px]">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.benefit' | transloco }}
                </dt>
                <dd class="text-fg">{{ o.benefit ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.feasibility' | transloco }}
                </dt>
                <dd class="text-fg">{{ o.feasibility ?? '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.score' | transloco }}
                </dt>
                <dd class="font-display text-[18px] font-bold text-fg">{{ o.score ?? '—' }}</dd>
              </div>
            </dl>
            @if (o.can_edit) {
              <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <label for="opp-status" class="text-[12.5px] font-semibold text-fg-muted">
                  {{ 'risk.detail.changeStatus' | transloco }}
                </label>
                <select
                  id="opp-status"
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
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
          <app-card>
            <dl class="flex flex-col gap-3 text-[13.5px]">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.description' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ o.description || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.actionPlan' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ o.action_plan || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.sourceType' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ o.source_type ? ('risk.sourceTypes.' + o.source_type | transloco) : '—' }}
                  @if (o.source_ref) {
                    · {{ o.source_ref }}
                  }
                </dd>
              </div>
            </dl>
          </app-card>
        </div>

        <ng-container aside>
          <app-card>
            <dl class="flex flex-col gap-3 text-[13px]">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ o.owner?.name ?? ('risk.common.unassigned' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.department' | transloco }}
                </dt>
                <dd class="text-fg">{{ o.department?.name ?? '—' }}</dd>
              </div>
              @if (o.register; as reg) {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'risk.fields.register' | transloco }}
                  </dt>
                  <dd>
                    <a
                      [routerLink]="['/risk/registers', reg.id]"
                      class="text-accent hover:underline"
                      >{{ reg.name }}</a
                    >
                  </dd>
                </div>
              }
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.dueAt' | transloco }}
                </dt>
                <dd [class.text-fail]="o.overdue" class="text-fg">
                  {{ o.due_at ? (o.due_at | localDay) : '—' }}
                </dd>
              </div>
              @if (o.realised_at) {
                <div>
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'risk.fields.realisedAt' | transloco }}
                  </dt>
                  <dd class="text-fg">{{ o.realised_at | localDate: 'mediumDate' }}</dd>
                </div>
              }
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'risk.fields.updatedAt' | transloco }}
                </dt>
                <dd class="text-fg">{{ o.updated_at | localDate: 'medium' }}</dd>
              </div>
            </dl>
          </app-card>
          <app-card>
            <app-supports-requirements entityType="opportunity" [entityId]="o.id" />
          </app-card>
        </ng-container>
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
        <app-alert tone="error">{{ loadErrorKey() | transloco }}</app-alert>
      </div>
    } @else {
      <p class="py-16 text-center text-[14px] text-fg-muted">
        {{ 'risk.common.loading' | transloco }}
      </p>
    }
  `,
})
export class OpportunityDetailPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  protected readonly perms = inject(RiskPermissions);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly statuses = OPPORTUNITY_STATUSES;
  protected readonly opportunity = signal<Opportunity | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('risk.common.loadFailed');
  protected readonly errorKey = signal<string | null>(null);
  protected readonly deleteOpen = signal(false);
  private sub: Subscription | null = null;

  protected readonly tone = computed(() =>
    opportunityStatusTone(this.opportunity()?.status ?? 'identified'),
  );

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'opportunity',
      entityId: this.id(),
      view: 'detail',
      title: this.opportunity()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
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
