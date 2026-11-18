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
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContinuityApi } from '../data/continuity-api';
import { badge, telHref } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { IctDetail } from '../data/continuity.models';
import { CONTINUITY_NAV, ContinuityLearnMore, recordCrumbs } from '../shared/continuity-page';
import { ContinuityDuration } from '../shared/duration';
import { confirmedRequirementRefs } from '../shared/page-requirements';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
];

/**
 * An ICT service (`/continuity/ict-systems/:id`): what it can recover in against what
 * the BIAs that depend on it require (and the contract SLA and the last test), the
 * issues found, what it runs on (asset), who provides it (supplier, contract and their
 * crisis contacts), the plans that act when it is down, the test history, and the
 * shared record tabs (tasks to close a readiness gap included).
 */
@Component({
  selector: 'app-ict-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    ContinuityDuration,
    ContinuityLearnMore,
    EntityChip,
    EntityTasks,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    ModuleNav,
    RecordDetailLayout,
    StatusBadge,
    Term,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8"><app-loading-state [rows]="6" /></div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/continuity/ict-systems"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'continuity.ict.back' | transloco }}
          </a>
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (system(); as s) {
          <app-record-detail-layout
            entityType="continuity_ict_system"
            [entityId]="s.id"
            [title]="s.name"
            [breadcrumbs]="crumbs()"
            [tabs]="tabs"
            [canEdit]="s.can_edit"
            [includeAudit]="canAudit()"
            [requirementsPanel]="true"
            backLink="/continuity/ict-systems"
            backLabelKey="continuity.ict.back"
          >
            <ng-container meta>
              <span class="font-mono">{{ s.code }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="readinessBadge().meaning"
                [value]="readinessBadge().value"
                [labelKey]="'continuity.readiness.' + s.readiness.state"
              />
              @if (s.status === 'retired') {
                <app-status-badge
                  meaning="lifecycle"
                  value="retired"
                  labelKey="continuity.ictStatus.retired"
                />
              }
            </ng-container>

            <app-watch-button secondary entityType="continuity_ict_system" [entityId]="s.id" />
            @if (s.can_edit && s.status === 'active') {
              <app-button secondary variant="secondary" (click)="planTest(s)">
                {{ 'continuity.ict.planTest' | transloco }}
              </app-button>
            }
            @if (s.can_edit) {
              <app-button primary (click)="edit(s)">
                {{ 'continuity.common.edit' | transloco }}
              </app-button>
            }
            <button appMenuItem overflow (click)="askGap()">
              {{ 'continuity.ai.explainReadiness' | transloco }}
            </button>
            @if (s.can_edit) {
              <button appMenuItem overflow [disabled]="busy()" (click)="toggleStatus(s)">
                {{
                  (s.status === 'active' ? 'continuity.ict.retire' : 'continuity.ict.reactivate')
                    | transloco
                }}
              </button>
            }
            @if (s.can_delete) {
              <button appMenuItem overflow [danger]="true" (click)="confirmDelete.set(true)">
                {{ 'continuity.common.delete' | transloco }}
              </button>
            }

            <app-module-nav nav labelKey="continuity.nav.label" [items]="nav" />
            <app-help-strip
              help
              scope="continuity"
              page="ictDetail"
              lesson="ict-readiness"
              [subject]="s.name"
            />

            <div class="flex flex-col gap-5">
              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.ict.readinessTitle' | transloco }}
                </h2>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-body">
                    <thead class="text-meta text-fg-muted">
                      <tr>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          <span class="sr-only">{{ 'continuity.ict.target' | transloco }}</span>
                        </th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'continuity.ict.achievable' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'continuity.ict.required' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 font-semibold">
                          {{ 'continuity.ict.lastTest' | transloco }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr class="border-t border-border">
                        <th scope="row" class="py-2 pr-3 font-semibold text-fg">
                          <app-term key="rto" scope="continuity">{{
                            'continuity.fields.rtoShort' | transloco
                          }}</app-term>
                        </th>
                        <td
                          class="py-2 pr-3"
                          [class]="has(s, 'rto_gap') ? 'font-semibold text-fail-ink' : ''"
                        >
                          <app-continuity-duration [minutes]="s.achievable_rto_minutes" />
                        </td>
                        <td class="py-2 pr-3">
                          <app-continuity-duration [minutes]="s.readiness.required_rto_minutes" />
                        </td>
                        <td
                          class="py-2"
                          [class]="has(s, 'tested_rto_missed') ? 'font-semibold text-fail-ink' : ''"
                        >
                          @if (
                            s.last_test_recovery_minutes !== null &&
                            s.last_test_recovery_minutes !== undefined
                          ) {
                            <app-continuity-duration [minutes]="s.last_test_recovery_minutes" />
                          } @else {
                            —
                          }
                        </td>
                      </tr>
                      <tr class="border-t border-border">
                        <th scope="row" class="py-2 pr-3 font-semibold text-fg">
                          <app-term key="rpo" scope="continuity">{{
                            'continuity.fields.rpoShort' | transloco
                          }}</app-term>
                        </th>
                        <td
                          class="py-2 pr-3"
                          [class]="has(s, 'rpo_gap') ? 'font-semibold text-fail-ink' : ''"
                        >
                          <app-continuity-duration [minutes]="s.achievable_rpo_minutes" />
                        </td>
                        <td class="py-2 pr-3">
                          <app-continuity-duration [minutes]="s.readiness.required_rpo_minutes" />
                        </td>
                        <td class="py-2">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                @if (s.sla_rto_minutes !== null && s.sla_rto_minutes !== undefined) {
                  <p
                    class="mt-2 text-ui"
                    [class]="has(s, 'sla_rto_exceeds') ? 'text-warn-ink' : 'text-fg-muted'"
                  >
                    {{ 'continuity.ict.slaLine' | transloco }}
                    <span class="font-semibold"
                      ><app-continuity-duration [minutes]="s.sla_rto_minutes"
                    /></span>
                  </p>
                }
                @if (s.readiness.issues.length) {
                  <ul class="mt-3 flex flex-col gap-1" data-testid="readiness-issues">
                    @for (issue of s.readiness.issues; track issue) {
                      <li class="flex items-start gap-2 text-ui text-fg">
                        <span class="mt-0.5 text-warn"><app-icon name="alert" [size]="14" /></span>
                        {{ 'continuity.readinessIssueHelp.' + issue | transloco }}
                      </li>
                    }
                  </ul>
                  @if (canCreateTask(s)) {
                    <div class="mt-3">
                      <app-button
                        size="sm"
                        variant="secondary"
                        [disabled]="flows.starting() !== null"
                        (click)="closeGapTask(s)"
                      >
                        <app-icon name="plus" [size]="14" />
                        {{ 'continuity.ict.closeGapTask' | transloco }}
                      </app-button>
                    </div>
                  }
                } @else if (s.readiness.state === 'ready') {
                  <p class="mt-3 text-ui text-pass-ink">
                    {{ 'continuity.ict.allGood' | transloco }}
                  </p>
                }
                <dl class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-3">
                  <div>
                    <dt class="text-meta text-fg-muted">
                      {{ 'continuity.fields.lastTested' | transloco }}
                    </dt>
                    <dd class="flex flex-wrap items-center gap-2 text-fg">
                      {{
                        s.last_tested_on
                          ? (s.last_tested_on | localDay)
                          : ('continuity.ict.neverTested' | transloco)
                      }}
                      @if (s.last_test_outcome) {
                        <app-status-badge
                          [meaning]="outcomeBadge(s.last_test_outcome).meaning"
                          [value]="outcomeBadge(s.last_test_outcome).value"
                          [labelKey]="'continuity.outcome.' + s.last_test_outcome"
                        />
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-muted">
                      {{ 'continuity.ict.nextTestDue' | transloco }}
                    </dt>
                    <dd
                      [class]="has(s, 'test_overdue') ? 'font-semibold text-warn-ink' : 'text-fg'"
                    >
                      {{
                        s.readiness.next_test_due_on
                          ? (s.readiness.next_test_due_on | localDay)
                          : ('continuity.common.notSet' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta text-fg-muted">
                      {{ 'continuity.fields.testInterval' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        'continuity.common.months' | transloco: { count: s.test_interval_months }
                      }}
                    </dd>
                  </div>
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.ict.profile' | transloco }}
                </h2>
                <app-field-list>
                  <app-field-item labelKey="continuity.fields.asset">
                    @if (s.asset; as asset) {
                      <app-entity-chip [ref]="asset" [showType]="false" [statusText]="true" />
                    }
                  </app-field-item>
                  <app-field-item labelKey="continuity.fields.supplier">
                    @if (s.supplier; as supplier) {
                      <app-entity-chip [ref]="supplier" [showType]="false" [statusText]="true" />
                    } @else if (s.provider) {
                      {{ s.provider }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="continuity.fields.contract">
                    @if (s.contract; as contract) {
                      <app-entity-chip [ref]="contract" [showType]="false" [statusText]="true" />
                    }
                  </app-field-item>
                  <app-field-item labelKey="continuity.fields.owner" [value]="s.owner?.name" />
                  @for (field of textFields; track field.key) {
                    @if (s[field.key]; as text) {
                      <app-field-item
                        [labelKey]="field.label"
                        [value]="text"
                        [wide]="true"
                        [multiline]="true"
                      />
                    }
                  }
                </app-field-list>
                @if ((s.supplier_contacts ?? []).length) {
                  <h3 class="mt-4 mb-2 text-ui font-semibold text-fg-muted">
                    {{ 'continuity.ict.supplierContacts' | transloco }}
                  </h3>
                  <ul class="flex flex-col gap-1.5" data-testid="supplier-contacts">
                    @for (c of s.supplier_contacts; track c.id) {
                      <li class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-ui">
                        <span class="font-semibold text-fg">{{ c.name }}</span>
                        @if (c.crisis_role) {
                          <span class="text-fg-muted">{{ c.crisis_role }}</span>
                        }
                        @if (tel(c.phone); as href) {
                          <a [href]="href" class="text-accent hover:underline">{{ c.phone }}</a>
                        }
                        @if (c.email) {
                          <a [href]="'mailto:' + c.email" class="text-accent hover:underline">{{
                            c.email
                          }}</a>
                        }
                        @if (c.available_24_7) {
                          <span class="text-meta text-fg-subtle">{{
                            'continuity.contacts.available247' | transloco
                          }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.ict.dependentBiasTitle' | transloco }}
                </h2>
                @if (s.dependent_bias.length === 0) {
                  <p class="text-ui text-fg-muted">
                    {{ 'continuity.ict.noDependents' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-1.5">
                    @for (b of s.dependent_bias; track b.id) {
                      <li class="flex flex-wrap items-center gap-2 text-ui">
                        <a
                          [routerLink]="['/continuity/bias', b.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-muted">{{ b.code }}</span>
                          {{ b.title }}
                        </a>
                        <span class="text-meta text-fg-subtle">
                          {{ 'continuity.fields.rtoShort' | transloco }}
                          <app-continuity-duration [minutes]="b.rto_minutes" />
                          · {{ 'continuity.fields.rpoShort' | transloco }}
                          <app-continuity-duration [minutes]="b.rpo_minutes" />
                        </span>
                      </li>
                    }
                  </ul>
                }
                @if ((s.dependent_plans ?? []).length) {
                  <h3 class="mt-4 mb-2 text-ui font-semibold text-fg-muted">
                    {{ 'continuity.ict.dependentPlans' | transloco }}
                  </h3>
                  <ul class="flex flex-col gap-1.5" data-testid="dependent-plans">
                    @for (p of s.dependent_plans; track p.id) {
                      <li class="flex flex-wrap items-center gap-2 text-ui">
                        <a [routerLink]="p.url" class="text-fg hover:underline">
                          <span class="font-mono text-meta text-fg-muted">{{ p.code }}</span>
                          {{ p.title }}
                        </a>
                        <app-status-badge
                          meaning="lifecycle"
                          [value]="p.status"
                          [labelKey]="'continuity.status.' + p.status"
                        />
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.ict.tests' | transloco }}
                </h2>
                @if (s.tests.length === 0) {
                  <p class="text-ui text-fg-muted">{{ 'continuity.ict.noTests' | transloco }}</p>
                } @else {
                  <ul class="flex flex-col gap-1.5">
                    @for (t of s.tests; track t.id) {
                      <li class="flex flex-wrap items-center gap-2 text-ui">
                        <a
                          [routerLink]="['/continuity/exercises', t.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-muted">{{ t.code }}</span>
                          {{ t.title }}
                        </a>
                        @if (t.outcome) {
                          <app-status-badge
                            [meaning]="outcomeBadge(t.outcome).meaning"
                            [value]="outcomeBadge(t.outcome).value"
                            [labelKey]="'continuity.outcome.' + t.outcome"
                          />
                        } @else {
                          <app-status-badge
                            meaning="lifecycle"
                            [value]="t.status"
                            [labelKey]="'continuity.exerciseStatus.' + t.status"
                          />
                        }
                        @if (t.conducted_on ?? t.scheduled_on; as day) {
                          <span class="text-meta text-fg-subtle">{{ day | localDay }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-why-it-matters scope="continuity" page="ictDetail" />
            </div>

            <app-continuity-learn-more
              aside-learn
              [lessons]="['recovery-targets', 'exercising-plans']"
            />

            <div tasks>
              <app-entity-tasks
                entityType="continuity_ict_system"
                [entityId]="s.id"
                [canCreate]="s.can_edit"
                [entityLabel]="s.code + ' ' + s.name"
              />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'continuity.ict.deleteTitle' | transloco"
            [message]="
              'continuity.common.deleteMessage' | transloco: { code: s.code, title: s.name }
            "
            [confirmLabel]="'continuity.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(s)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class IctDetailPage {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  protected readonly flows = inject(CreateFlowService);

  readonly id = input.required<string>();

  protected readonly nav = CONTINUITY_NAV;
  protected readonly tabs = TABS;
  protected readonly tel = telHref;
  protected readonly outcomeBadge = badge.outcome;
  protected readonly textFields = [
    { key: 'description', label: 'continuity.fields.description' },
    { key: 'recovery_strategy', label: 'continuity.fields.recoveryStrategy' },
    { key: 'backup_strategy', label: 'continuity.fields.backupStrategy' },
  ] as const;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly system = signal<IctDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly canAudit = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('audit:read'),
  );
  protected readonly crumbs = computed(() => recordCrumbs('ict', this.system()?.code ?? ''));
  protected readonly readinessBadge = computed(() =>
    badge.readiness(this.system()?.readiness.state ?? null),
  );

  /** Requirements the record documents, for the assistant's page context. */
  private readonly requirements = confirmedRequirementRefs('continuity_ict_system', () =>
    this.id(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const s = this.system();
      return {
        module: 'continuity',
        entityType: 'continuity_ict_system',
        entityId: this.id(),
        view: 'detail',
        requirements: this.requirements(),
        title: s ? `${s.code} ${s.name}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected has(s: IctDetail, issue: string): boolean {
    return s.readiness.issues.includes(issue as never);
  }

  protected canCreateTask(s: IctDetail): boolean {
    return s.can_edit && s.status === 'active';
  }

  /** A task to close the readiness gap, prefilled and kept on the service (P4 flow). */
  protected closeGapTask(s: IctDetail): void {
    void this.flows.start('continuity_ict_system.to_task', 'continuity_ict_system', s.id);
  }

  protected edit(s: IctDetail): void {
    void this.router.navigate(['/continuity/ict-systems', s.id, 'edit']);
  }

  protected planTest(s: IctDetail): void {
    void this.router.navigate(['/continuity/exercises/new'], { queryParams: { ict: s.id } });
  }

  protected askGap(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.ictGap'));
  }

  protected toggleStatus(s: IctDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .updateIct(orgId, s.id, { status: s.status === 'active' ? 'retired' : 'active' })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.system.set(updated);
          this.notifications.success('continuity.form.saved');
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.notifications.error(continuityErrorKey(err));
        },
      });
  }

  protected remove(s: IctDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteIct(orgId, s.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('continuity.common.deleted', { code: s.code });
        void this.router.navigate(['/continuity/ict-systems']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getIct(orgId, id).subscribe({
      next: (s) => {
        this.system.set(s);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
