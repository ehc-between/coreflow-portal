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
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import {
  controlledStatusTone,
  exerciseStatusTone,
  outcomeTone,
  readinessTone,
} from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { IctDetail } from '../data/continuity.models';
import { ContinuityDuration } from '../shared/duration';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments', 'attachments'];

/**
 * An ICT service (`/continuity/ict-systems/:id`): readiness against the BIAs that
 * depend on it (achievable vs required RTO/RPO, issues), recovery and backup
 * strategies, the test cycle and test history, and the shared record tabs (link it
 * to an asset or supplier under "Related").
 */
@Component({
  selector: 'app-ict-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ContinuityDuration,
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
            routerLink="/continuity/ict-systems"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
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
            [tabs]="tabs"
            [canEdit]="s.can_edit"
            [includeAudit]="canAudit()"
            backLink="/continuity/ict-systems"
            backLabelKey="continuity.ict.back"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] text-fg-muted">{{ s.code }}</span>
                <app-badge [tone]="tone(s.readiness.state)">
                  {{ 'continuity.readiness.' + s.readiness.state | transloco }}
                </app-badge>
                @if (s.status === 'retired') {
                  <app-badge>{{ 'continuity.ictStatus.retired' | transloco }}</app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ s.name }}
              </h1>
            </div>

            <ng-container actions>
              <app-watch-button entityType="continuity_ict_system" [entityId]="s.id" />
              <app-button variant="ghost" size="sm" (click)="askGap()">
                <app-icon name="spark" [size]="14" />
                {{ 'continuity.ai.explainReadiness' | transloco }}
              </app-button>
              @if (s.can_edit) {
                <a
                  [routerLink]="['/continuity/ict-systems', s.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'continuity.common.edit' | transloco }}
                </a>
                @if (s.status === 'active') {
                  <a
                    routerLink="/continuity/exercises/new"
                    [queryParams]="{ ict: s.id }"
                    class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  >
                    {{ 'continuity.ict.planTest' | transloco }}
                  </a>
                }
                <app-button
                  variant="secondary"
                  size="sm"
                  [disabled]="busy()"
                  (click)="toggleStatus(s)"
                >
                  {{
                    (s.status === 'active' ? 'continuity.ict.retire' : 'continuity.ict.reactivate')
                      | transloco
                  }}
                </app-button>
              }
              @if (s.can_delete) {
                <app-button variant="ghost" size="sm" (click)="confirmDelete.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'continuity.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="continuity" page="ictDetail" />

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.ict.readinessTitle' | transloco }}
                </h2>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-[13.5px]">
                    <thead class="text-[12px] text-fg-muted">
                      <tr>
                        <th scope="col" class="py-1.5 pr-3 font-semibold"></th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'continuity.ict.achievable' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 font-semibold">
                          {{ 'continuity.ict.required' | transloco }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr class="border-t border-border">
                        <th scope="row" class="py-2 pr-3 font-semibold text-fg">
                          {{ 'continuity.fields.rtoShort' | transloco }}
                        </th>
                        <td
                          class="py-2 pr-3"
                          [class.text-fail]="s.readiness.issues.includes('rto_gap')"
                        >
                          <app-continuity-duration [minutes]="s.achievable_rto_minutes" />
                        </td>
                        <td class="py-2">
                          <app-continuity-duration [minutes]="s.readiness.required_rto_minutes" />
                        </td>
                      </tr>
                      <tr class="border-t border-border">
                        <th scope="row" class="py-2 pr-3 font-semibold text-fg">
                          {{ 'continuity.fields.rpoShort' | transloco }}
                        </th>
                        <td
                          class="py-2 pr-3"
                          [class.text-fail]="s.readiness.issues.includes('rpo_gap')"
                        >
                          <app-continuity-duration [minutes]="s.achievable_rpo_minutes" />
                        </td>
                        <td class="py-2">
                          <app-continuity-duration [minutes]="s.readiness.required_rpo_minutes" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                @if (s.readiness.issues.length) {
                  <ul class="mt-3 flex flex-col gap-1" data-testid="readiness-issues">
                    @for (issue of s.readiness.issues; track issue) {
                      <li class="flex items-start gap-2 text-[13px] text-fg">
                        <span class="mt-0.5 text-warn"><app-icon name="alert" [size]="14" /></span>
                        {{ 'continuity.readinessIssueHelp.' + issue | transloco }}
                      </li>
                    }
                  </ul>
                } @else if (s.readiness.state === 'ready') {
                  <p class="mt-3 text-[13px] text-pass">
                    {{ 'continuity.ict.allGood' | transloco }}
                  </p>
                }
                <dl class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.lastTested' | transloco }}
                    </dt>
                    <dd class="flex flex-wrap items-center gap-2 text-fg">
                      {{
                        s.last_tested_on
                          ? (s.last_tested_on | localDay)
                          : ('continuity.ict.neverTested' | transloco)
                      }}
                      @if (s.last_test_outcome) {
                        <app-badge [tone]="resultTone(s.last_test_outcome)">
                          {{ 'continuity.outcome.' + s.last_test_outcome | transloco }}
                        </app-badge>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.ict.nextTestDue' | transloco }}
                    </dt>
                    <dd
                      class="text-fg"
                      [class.text-fail]="s.readiness.issues.includes('test_overdue')"
                    >
                      {{
                        s.readiness.next_test_due_on
                          ? (s.readiness.next_test_due_on | localDay)
                          : '–'
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.testInterval' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        'continuity.common.months' | transloco: { count: s.test_interval_months }
                      }}
                    </dd>
                  </div>
                  @if (s.last_test_recovery_minutes !== null) {
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'continuity.ict.lastTestRecovery' | transloco }}
                      </dt>
                      <dd class="text-fg">
                        <app-continuity-duration [minutes]="s.last_test_recovery_minutes" />
                      </dd>
                    </div>
                  }
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.ict.profile' | transloco }}
                </h2>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.provider' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ s.provider || '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'continuity.fields.owner' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{ s.owner?.name ?? ('continuity.common.nobody' | transloco) }}
                    </dd>
                  </div>
                  @for (field of textFields; track field.key) {
                    @if (s[field.key]; as text) {
                      <div class="sm:col-span-2">
                        <dt class="text-[12px] text-fg-muted">{{ field.label | transloco }}</dt>
                        <dd class="whitespace-pre-line text-fg">{{ text }}</dd>
                      </div>
                    }
                  }
                </dl>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.ict.dependentBiasTitle' | transloco }}
                </h2>
                @if (s.dependent_bias.length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'continuity.ict.noDependents' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-1.5">
                    @for (b of s.dependent_bias; track b.id) {
                      <li class="flex flex-wrap items-center gap-2 text-[13px]">
                        <a
                          [routerLink]="['/continuity/bias', b.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-[12px] text-fg-muted">{{ b.code }}</span>
                          {{ b.title }}
                        </a>
                        <app-badge [tone]="statusTone(b.status)">
                          {{ 'continuity.status.' + b.status | transloco }}
                        </app-badge>
                        <span class="text-fg-subtle">
                          {{ 'continuity.fields.rtoShort' | transloco }}:
                          <app-continuity-duration [minutes]="b.rto_minutes" />
                          · {{ 'continuity.fields.rpoShort' | transloco }}:
                          <app-continuity-duration [minutes]="b.rpo_minutes" />
                        </span>
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'continuity.ict.tests' | transloco }}
                </h2>
                @if (s.tests.length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'continuity.ict.noTests' | transloco }}
                  </p>
                } @else {
                  <ul class="flex flex-col gap-1.5">
                    @for (t of s.tests; track t.id) {
                      <li class="flex flex-wrap items-center gap-2 text-[13px]">
                        <a
                          [routerLink]="['/continuity/exercises', t.id]"
                          class="text-fg hover:underline"
                        >
                          <span class="font-mono text-[12px] text-fg-muted">{{ t.code }}</span>
                          {{ t.title }}
                        </a>
                        <app-badge [tone]="exerciseTone(t.status)">
                          {{ 'continuity.exerciseStatus.' + t.status | transloco }}
                        </app-badge>
                        @if (t.outcome) {
                          <app-badge [tone]="resultTone(t.outcome)">
                            {{ 'continuity.outcome.' + t.outcome | transloco }}
                          </app-badge>
                        }
                      </li>
                    }
                  </ul>
                }
              </app-card>

              <app-why-it-matters scope="continuity" page="ictDetail" />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'continuity.common.learn' | transloco }}
                </h2>
                <div class="flex flex-col items-start gap-2">
                  <app-lesson scope="continuity" lesson="ict-readiness" />
                  <app-teach-me topic="continuity.ict" [subject]="s.name" />
                </div>
              </app-card>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="continuity_ict_system" [entityId]="s.id" />
              </app-card>
            </ng-container>
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

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly tone = readinessTone;
  protected readonly statusTone = controlledStatusTone;
  protected readonly exerciseTone = exerciseStatusTone;
  protected readonly resultTone = outcomeTone;
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
        title: s ? `${s.code} ${s.name}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
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
