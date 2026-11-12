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
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachMe } from '../../../shared/guidance/teach-me';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import { controlledStatusTone, criticalityTone, impactTone } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { BiaDetail, IMPACT_CATEGORIES } from '../data/continuity.models';
import { ContinuityControlledPanel, ControlledActionRequest } from '../shared/controlled-panel';
import { ContinuityDuration } from '../shared/duration';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key (the BIA's controlled fields). */
export const BIA_FIELD_LABELS: Readonly<Record<string, string>> = {
  code: 'continuity.fields.code',
  status: 'continuity.fields.status',
  version: 'continuity.fields.version',
  last_reviewed_on: 'continuity.fields.lastReviewed',
  next_review_on: 'continuity.fields.nextReview',
  title: 'continuity.fields.title',
  description: 'continuity.fields.description',
  owner_user_id: 'continuity.fields.owner',
  department_id: 'continuity.fields.department',
  criticality: 'continuity.fields.criticality',
  impacts: 'continuity.fields.impacts',
  impact_notes: 'continuity.fields.impactNotes',
  mtpd_minutes: 'continuity.fields.mtpd',
  rto_minutes: 'continuity.fields.rto',
  rpo_minutes: 'continuity.fields.rpo',
  mbco: 'continuity.fields.mbco',
  peak_periods: 'continuity.fields.peakPeriods',
  workarounds: 'continuity.fields.workarounds',
  dependencies: 'continuity.fields.dependencies',
  review_interval_months: 'continuity.fields.reviewInterval',
};

/**
 * A business impact analysis (`/continuity/bias/:id`): the approval card with the
 * workflow actions, the impact ratings, the recovery targets, workarounds and
 * dependencies, the plans that cover it, and the shared record tabs (tasks,
 * related, activity, comments, attachments, revisions).
 */
@Component({
  selector: 'app-bia-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    MarkdownPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ContinuityControlledPanel,
    ContinuityDuration,
    EntityTasks,
    GuideIntro,
    HasPermissionDirective,
    Icon,
    LessonView,
    RecordDetailLayout,
    SupportsRequirements,
    TeachMe,
    WatchButton,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="mx-auto max-w-[1180px] px-4 pt-7 text-[14px] text-fg-muted sm:px-8">
          {{ 'continuity.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/continuity/bias"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'continuity.bias.back' | transloco }}
          </a>
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (bia(); as b) {
          <app-record-detail-layout
            entityType="bia"
            [entityId]="b.id"
            [tabs]="tabs"
            [canEdit]="b.can_edit"
            [includeAudit]="canAudit()"
            [fieldLabels]="fieldLabels"
            backLink="/continuity/bias"
            backLabelKey="continuity.bias.back"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] text-fg-muted">{{ b.code }}</span>
                <app-badge [tone]="statusTone(b.status)">
                  {{ 'continuity.status.' + b.status | transloco }}
                </app-badge>
                @if (b.criticality) {
                  <app-badge [tone]="critTone(b.criticality)">
                    {{ 'continuity.criticality.' + b.criticality | transloco }}
                  </app-badge>
                }
                @if (b.plans.length === 0 && b.status !== 'retired') {
                  <app-badge tone="warn">{{ 'continuity.bias.uncovered' | transloco }}</app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ b.title }}
              </h1>
            </div>

            <ng-container actions>
              <app-watch-button entityType="bia" [entityId]="b.id" />
              <app-button variant="ghost" size="sm" (click)="askSummary()">
                <app-icon name="spark" [size]="14" />
                {{ 'continuity.ai.summarise' | transloco }}
              </app-button>
              @if (b.can_edit) {
                <a
                  [routerLink]="['/continuity/bias', b.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'continuity.common.edit' | transloco }}
                </a>
              }
              @if (canWrite() && b.status !== 'retired') {
                <a
                  routerLink="/continuity/plans/new"
                  [queryParams]="{ bia: b.id }"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'continuity.bias.createPlan' | transloco }}
                </a>
              }
              @if (b.can_delete) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'continuity.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="continuity" page="biaDetail" />

              <app-continuity-controlled-panel
                [record]="b"
                [busy]="busy()"
                [error]="actionError()"
                (acted)="act(b, $event)"
              />

              @if (b.description) {
                <app-card>
                  <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                    {{ 'continuity.fields.description' | transloco }}
                  </h2>
                  <div
                    class="cf-prose text-[13.5px] leading-relaxed text-fg"
                    [innerHTML]="b.description | appMarkdown"
                  ></div>
                </app-card>
              }

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.form.sections.impacts' | transloco }}
                </h2>
                <ul
                  class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
                  data-testid="impacts"
                >
                  @for (c of impactCategories; track c) {
                    <li
                      class="flex items-center justify-between gap-2 rounded-tile border border-border px-3 py-2"
                    >
                      <span class="text-[13px] text-fg">{{
                        'continuity.impacts.' + c | transloco
                      }}</span>
                      @if (b.impacts[c] !== null && b.impacts[c] !== undefined) {
                        <app-badge [tone]="impTone(b.impacts[c])">
                          {{ 'continuity.impactLevel.' + b.impacts[c] | transloco }}
                        </app-badge>
                      } @else {
                        <span class="text-[12.5px] text-fg-subtle">{{
                          'continuity.common.notSet' | transloco
                        }}</span>
                      }
                    </li>
                  }
                </ul>
                @if (b.impact_notes) {
                  <p class="mt-3 text-[13px] whitespace-pre-line text-fg-muted">
                    {{ b.impact_notes }}
                  </p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.form.sections.targets' | transloco }}
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.mtpd' | transloco }}
                    </dt>
                    <dd class="text-[15px] font-semibold text-fg">
                      <app-continuity-duration [minutes]="b.mtpd_minutes" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.rto' | transloco }}
                    </dt>
                    <dd class="text-[15px] font-semibold text-fg">
                      <app-continuity-duration [minutes]="b.rto_minutes" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.rpo' | transloco }}
                    </dt>
                    <dd class="text-[15px] font-semibold text-fg">
                      <app-continuity-duration [minutes]="b.rpo_minutes" />
                    </dd>
                  </div>
                  @for (field of textFields; track field.key) {
                    @if (b[field.key]; as text) {
                      <div class="sm:col-span-3">
                        <dt class="text-[12px] text-fg-muted">{{ field.label | transloco }}</dt>
                        <dd class="whitespace-pre-line text-fg">{{ text }}</dd>
                      </div>
                    }
                  }
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.form.sections.dependencies' | transloco }}
                </h2>
                @if (b.dependencies.length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'continuity.form.noDependencies' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-2">
                    @for (dep of b.dependencies; track $index) {
                      <li class="rounded-tile border border-border px-3 py-2 text-[13px]">
                        <span class="flex flex-wrap items-center gap-2">
                          <app-badge>{{
                            'continuity.dependencyKind.' + dep.kind | transloco
                          }}</app-badge>
                          @if (dep.ict_system_id) {
                            <a
                              [routerLink]="['/continuity/ict-systems', dep.ict_system_id]"
                              class="font-semibold text-accent hover:underline"
                            >
                              {{ dep.ict_system_code }} {{ dep.name }}
                            </a>
                          } @else {
                            <span class="font-semibold text-fg">{{ dep.name }}</span>
                          }
                        </span>
                        @if (dep.notes) {
                          <span class="mt-1 block text-fg-muted">{{ dep.notes }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.bias.coveringPlans' | transloco }}
                </h2>
                @if (b.plans.length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'continuity.bias.noPlans' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-1.5">
                    @for (p of b.plans; track p.id) {
                      <li class="flex flex-wrap items-center gap-2 text-[13px]">
                        <a
                          [routerLink]="['/continuity/plans', p.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-[12px] text-fg-muted">{{ p.code }}</span>
                          {{ p.title }}
                        </a>
                        @if (p.status) {
                          <app-badge [tone]="statusTone(p.status)">
                            {{ 'continuity.status.' + p.status | transloco }}
                          </app-badge>
                        }
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-why-it-matters scope="continuity" page="biaDetail" />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'continuity.common.learn' | transloco }}
                </h2>
                <div class="flex flex-col items-start gap-2">
                  <app-lesson scope="continuity" lesson="running-a-bia" />
                  <app-lesson scope="continuity" lesson="recovery-targets" />
                  <app-teach-me topic="continuity.bia" [subject]="b.title" />
                </div>
              </app-card>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="bia" [entityId]="b.id" />
              </app-card>
            </ng-container>

            <div tasks>
              <app-entity-tasks
                entityType="bia"
                [entityId]="b.id"
                [canCreate]="b.can_edit"
                [entityLabel]="b.code + ' ' + b.title"
              />
            </div>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="confirmDelete()"
            [title]="'continuity.bias.deleteTitle' | transloco"
            [message]="
              'continuity.common.deleteMessage' | transloco: { code: b.code, title: b.title }
            "
            [confirmLabel]="'continuity.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(b)"
            (cancelled)="confirmDelete.set(false)"
          />
        }
      }
    }
  `,
})
export class BiaDetailPage {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly panel = viewChild(ContinuityControlledPanel);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = BIA_FIELD_LABELS;
  protected readonly impactCategories = IMPACT_CATEGORIES;
  protected readonly statusTone = controlledStatusTone;
  protected readonly critTone = criticalityTone;
  protected readonly impTone = impactTone;
  protected readonly textFields = [
    { key: 'mbco', label: 'continuity.fields.mbco' },
    { key: 'peak_periods', label: 'continuity.fields.peakPeriods' },
    { key: 'workarounds', label: 'continuity.fields.workarounds' },
  ] as const;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly bia = signal<BiaDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));
  protected readonly canWrite = computed(() => this.permissions().includes('continuity:write'));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const b = this.bia();
      return {
        module: 'continuity',
        entityType: 'bia',
        entityId: this.id(),
        view: 'detail',
        title: b ? `${b.code} ${b.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected askSummary(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.summariseBia'));
  }

  protected act(b: BiaDetail, request: ControlledActionRequest): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    this.api.biaAction(orgId, b.id, request.action, request.note).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.panel()?.close();
        this.bia.set(updated);
        this.notifications.success('continuity.actionDone.' + request.action, { code: b.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.panel()?.close();
        this.actionError.set(continuityErrorKey(err));
      },
    });
  }

  protected remove(b: BiaDetail): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteBia(orgId, b.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('continuity.common.deleted', { code: b.code });
        void this.router.navigate(['/continuity/bias']);
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
    this.request = this.api.getBia(orgId, id).subscribe({
      next: (b) => {
        this.bia.set(b);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
