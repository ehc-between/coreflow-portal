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
import { Subscription, concatMap, from, last } from 'rxjs';
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
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { reviewStatusTone } from '../data/asset-display';
import { assetErrorMessage } from '../data/asset-errors';
import { AccessReviewDetail, ReviewItem, ReviewItemInput } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { ItemChange, ReviewItems, countItems } from './review-items';

const TABS: readonly RecordTab[] = [
  'details',
  'tasks',
  'related',
  'activity',
  'comments',
  'attachments',
];

/** Whether a review can be completed now (accounts exist, none undecided, still open). */
export function canComplete(r: AccessReviewDetail): boolean {
  const open = r.status === 'planned' || r.status === 'in_progress';
  return open && r.counts.total > 0 && r.counts.pending === 0;
}

/**
 * An access review (`/assets/access-reviews/:id`): the system, reviewer, due date
 * and scope; the accounts with the reviewer's decisions; and completion with a
 * signed attestation (ISO 27001 A.5.18). Completing closes the reviewer's task,
 * creates remediation tasks for revoked or changed access and, for a recurring
 * review, plans the next one.
 */
@Component({
  selector: 'app-access-review-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EntityTasks,
    GuideIntro,
    HasPermissionDirective,
    Icon,
    KpiTile,
    LessonView,
    PromptDialog,
    RecordDetailLayout,
    ReviewItems,
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
          {{ 'assets.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <a
            routerLink="/assets/access-reviews"
            class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'assets.common.backToReviews' | transloco }}
          </a>
          <app-alert>{{ 'assets.reviewDetail.notFound' | transloco }}</app-alert>
        </div>
      }
      @default {
        @if (review(); as r) {
          <app-record-detail-layout
            entityType="access_review"
            [entityId]="r.id"
            [tabs]="tabs"
            [canEdit]="r.can_manage"
            [includeAudit]="canAudit()"
            backLink="/assets/access-reviews"
            backLabelKey="assets.common.backToReviews"
          >
            <div header>
              <div class="mb-1.5 flex flex-wrap items-center gap-2">
                <span class="font-mono text-[12.5px] text-fg-muted">{{ r.code }}</span>
                <app-badge [tone]="tone(r.status)">
                  {{ 'assets.reviewStatus.' + r.status | transloco }}
                </app-badge>
                @if (r.overdue) {
                  <app-badge tone="fail">{{ 'assets.common.overdue' | transloco }}</app-badge>
                }
              </div>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
              >
                {{ r.title }}
              </h1>
            </div>

            <ng-container actions>
              <app-watch-button entityType="access_review" [entityId]="r.id" />
              <app-button variant="ghost" size="sm" (click)="askHelp()">
                <app-icon name="spark" [size]="14" />
                {{ 'assets.ai.reviewHelp' | transloco }}
              </app-button>
              @if (open() && r.can_work && r.status === 'planned') {
                <app-button variant="secondary" size="sm" [disabled]="busy()" (click)="start(r)">
                  {{ 'assets.reviewDetail.start' | transloco }}
                </app-button>
              }
              @if (open() && r.can_work) {
                <app-button
                  size="sm"
                  [disabled]="busy() || !completable()"
                  [attr.aria-describedby]="completable() ? null : 'ar-complete-why'"
                  (click)="completeOpen.set(true)"
                >
                  <app-icon name="checkcircle" [size]="14" />
                  {{ 'assets.reviewDetail.complete' | transloco }}
                </app-button>
              }
              @if (r.can_manage && open()) {
                <a
                  [routerLink]="['/assets/access-reviews', r.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                >
                  {{ 'assets.common.edit' | transloco }}
                </a>
                <app-button variant="ghost" size="sm" (click)="cancelOpen.set(true)">
                  {{ 'assets.reviewDetail.cancel' | transloco }}
                </app-button>
              }
              @if (r.can_manage) {
                <app-button variant="ghost" size="sm" (click)="deleteOpen.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'assets.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-5">
              <app-guide-intro scope="assets" page="review" />

              @if (open() && !completable()) {
                <p id="ar-complete-why" class="text-[12.5px] text-fg-muted">
                  {{
                    (r.counts.total === 0
                      ? 'assets.reviewDetail.needItems'
                      : 'assets.reviewDetail.needDecisions'
                    ) | transloco: { pending: r.counts.pending }
                  }}
                </p>
              }

              <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <app-kpi-tile
                  [label]="'assets.reviewDetail.accounts' | transloco"
                  [value]="r.counts.total"
                />
                <app-kpi-tile
                  [label]="'assets.decision.pending' | transloco"
                  [value]="r.counts.pending"
                  [tone]="r.counts.pending ? 'warn' : 'neutral'"
                />
                <app-kpi-tile
                  [label]="'assets.decision.keep' | transloco"
                  [value]="r.counts.keep"
                  tone="pass"
                />
                <app-kpi-tile
                  [label]="'assets.decision.revoke' | transloco"
                  [value]="r.counts.revoke"
                  [tone]="r.counts.revoke ? 'fail' : 'neutral'"
                />
                <app-kpi-tile
                  [label]="'assets.decision.modify' | transloco"
                  [value]="r.counts.modify"
                  [tone]="r.counts.modify ? 'warn' : 'neutral'"
                />
              </div>

              <app-card>
                <h2 class="mb-3 font-display text-[15px] font-bold text-fg">
                  {{ 'assets.reviewDetail.about' | transloco }}
                </h2>
                <dl
                  class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.system' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (r.system_asset; as s) {
                        <a [routerLink]="['/assets', s.id]" class="text-accent hover:underline">
                          <span class="font-mono text-[12px]">{{ s.code }}</span> {{ s.name }}
                        </a>
                      } @else {
                        {{ r.system_name || '–' }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.reviewer' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ r.reviewer?.name ?? '–' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.dueOn' | transloco }}
                    </dt>
                    <dd [class.text-fail]="r.overdue" [class.font-semibold]="r.overdue">
                      {{ r.due_on | localDay }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-[12px] text-fg-muted">
                      {{ 'assets.fields.frequencyMonths' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      @if (r.frequency_months; as months) {
                        {{ 'assets.reviews.everyMonths' | transloco: { months } }}
                      } @else {
                        {{ 'assets.reviewDetail.oneOff' | transloco }}
                      }
                    </dd>
                  </div>
                  @if (r.started_at) {
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.fields.startedAt' | transloco }}
                      </dt>
                      <dd class="text-fg">{{ r.started_at | localDate }}</dd>
                    </div>
                  }
                  @if (r.previous_review_id || r.next_review_id) {
                    <div>
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.reviewDetail.series' | transloco }}
                      </dt>
                      <dd class="flex flex-col text-fg">
                        @if (r.previous_review_id) {
                          <a
                            [routerLink]="['/assets/access-reviews', r.previous_review_id]"
                            class="text-accent hover:underline"
                          >
                            {{ 'assets.reviewDetail.previous' | transloco }}
                          </a>
                        }
                        @if (r.next_review_id) {
                          <a
                            [routerLink]="['/assets/access-reviews', r.next_review_id]"
                            class="text-accent hover:underline"
                          >
                            {{ 'assets.reviewDetail.next' | transloco }}
                          </a>
                        }
                      </dd>
                    </div>
                  }
                  @if (r.scope) {
                    <div class="sm:col-span-2 lg:col-span-3">
                      <dt class="text-[12px] text-fg-muted">
                        {{ 'assets.fields.scope' | transloco }}
                      </dt>
                      <dd class="cf-prose text-fg" [innerHTML]="r.scope | appMarkdown"></dd>
                    </div>
                  }
                </dl>
              </app-card>

              @if (r.status === 'completed') {
                <app-card>
                  <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                    {{ 'assets.reviewDetail.attestation' | transloco }}
                  </h2>
                  <p class="text-[12.5px] text-fg-muted">
                    {{
                      'assets.reviewDetail.completedBy'
                        | transloco
                          : {
                              name: r.completed_by?.name ?? '–',
                              date: (r.completed_at | localDate),
                            }
                    }}
                  </p>
                  <blockquote class="mt-2 border-l-2 border-accent pl-3 text-[13.5px] text-fg">
                    {{ r.attestation }}
                  </blockquote>
                  @if (r.counts.unremediated) {
                    <p class="mt-3 text-[12.5px] text-fg-muted">
                      {{
                        'assets.reviewDetail.remediationTasks'
                          | transloco: { count: r.counts.unremediated }
                      }}
                    </p>
                  }
                </app-card>
              }

              @if (!r.can_work && open()) {
                <app-alert tone="info">{{ 'assets.reviewDetail.readOnly' | transloco }}</app-alert>
              }

              <app-card>
                <app-review-items
                  [items]="r.items"
                  [editable]="open() && r.can_work"
                  [busy]="busy()"
                  (changed)="updateItem(r, $event)"
                  (added)="addItem(r, $event)"
                  (remove)="removeItem(r, $event)"
                  (importMembers)="importMembers(r)"
                  (keepAll)="keepAll(r)"
                />
              </app-card>

              <app-why-it-matters scope="assets" page="review" />
            </div>

            <ng-container aside>
              <app-card>
                <h2 class="mb-2 font-display text-[14px] font-bold text-fg">
                  {{ 'assets.detail.learn' | transloco }}
                </h2>
                <div class="flex flex-col items-start gap-2">
                  <app-lesson scope="assets" lesson="access-reviews" />
                  <app-teach-me topic="assets.review" [subject]="r.title" />
                </div>
              </app-card>
              <app-card *appHasPermission="'standards:read'">
                <app-supports-requirements entityType="access_review" [entityId]="r.id" />
              </app-card>
            </ng-container>

            <div tasks>
              <app-entity-tasks
                entityType="access_review"
                [entityId]="r.id"
                [canCreate]="r.can_manage"
                [entityLabel]="r.code + ' ' + r.title"
              />
            </div>
          </app-record-detail-layout>

          <app-prompt-dialog
            [open]="completeOpen()"
            [title]="'assets.reviewDetail.completeTitle' | transloco"
            [message]="
              'assets.reviewDetail.completeMessage'
                | transloco: { revoke: r.counts.revoke, modify: r.counts.modify }
            "
            [label]="'assets.reviewDetail.attestationLabel' | transloco"
            [placeholder]="
              'assets.reviewDetail.attestationPlaceholder' | transloco: { system: systemLabel() }
            "
            [confirmLabel]="'assets.reviewDetail.complete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [required]="true"
            [maxLength]="5000"
            [busy]="busy()"
            (confirmed)="complete(r, $event)"
            (cancelled)="completeOpen.set(false)"
          />
          <app-prompt-dialog
            [open]="cancelOpen()"
            [title]="'assets.reviewDetail.cancelTitle' | transloco"
            [message]="'assets.reviewDetail.cancelMessage' | transloco"
            [label]="'assets.reviewDetail.cancelReason' | transloco"
            [confirmLabel]="'assets.reviewDetail.cancel' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            confirmVariant="danger"
            [required]="true"
            [busy]="busy()"
            (confirmed)="cancelReview(r, $event)"
            (cancelled)="cancelOpen.set(false)"
          />
          <app-confirm-dialog
            [open]="deleteOpen()"
            [title]="'assets.reviewDetail.deleteTitle' | transloco"
            [message]="'assets.reviewDetail.deleteMessage' | transloco: { code: r.code }"
            [confirmLabel]="'assets.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove(r)"
            (cancelled)="deleteOpen.set(false)"
          />
        }
      }
    }
  `,
})
export class AccessReviewDetailPage {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly tone = reviewStatusTone;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly review = signal<AccessReviewDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly completeOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly deleteOpen = signal(false);

  protected readonly open = computed(() => {
    const status = this.review()?.status;
    return status === 'planned' || status === 'in_progress';
  });
  protected readonly completable = computed(() => {
    const r = this.review();
    return !!r && canComplete(r);
  });
  protected readonly systemLabel = computed(() => {
    const r = this.review();
    return r?.system_asset?.name ?? r?.system_name ?? '';
  });
  protected readonly canAudit = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('audit:read'),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const r = this.review();
      return {
        module: 'assets',
        entityType: 'access_review',
        entityId: this.id(),
        view: 'detail',
        title: r ? `${r.code} ${r.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id, true));
    });
  }

  protected askHelp(): void {
    this.ask.showWith(this.language.translate('assets.ai.prompts.reviewHelp'));
  }

  protected start(r: AccessReviewDetail): void {
    this.run(this.api.startReview(this.orgId(), r.id), 'assets.reviewDetail.started');
  }

  protected complete(r: AccessReviewDetail, attestation: string): void {
    this.run(
      this.api.completeReview(this.orgId(), r.id, attestation.trim()),
      'assets.reviewDetail.completed',
      () => this.completeOpen.set(false),
    );
  }

  protected cancelReview(r: AccessReviewDetail, reason: string): void {
    this.run(
      this.api.cancelReview(this.orgId(), r.id, reason.trim()),
      'assets.reviewDetail.cancelled',
      () => this.cancelOpen.set(false),
    );
  }

  protected updateItem(r: AccessReviewDetail, change: ItemChange): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateReviewItem(orgId, r.id, change.item.id, change.patch).subscribe({
      next: (item) => {
        this.busy.set(false);
        this.replaceItem(item);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toastError(err);
        this.reload();
      },
    });
  }

  protected addItem(r: AccessReviewDetail, item: ReviewItemInput): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.addReviewItems(orgId, r.id, [item]).subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toastError(err);
      },
    });
  }

  protected removeItem(r: AccessReviewDetail, item: ReviewItem): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteReviewItem(orgId, r.id, item.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toastError(err);
      },
    });
  }

  protected importMembers(r: AccessReviewDetail): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.importMembers(orgId, r.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('assets.reviewItems.imported');
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toastError(err);
      },
    });
  }

  /** Mark every undecided account as "keep" (one request per account, in order). */
  protected keepAll(r: AccessReviewDetail): void {
    const orgId = this.orgId();
    const pending = r.items.filter((i) => i.decision === 'pending');
    if (!orgId || this.busy() || pending.length === 0) {
      return;
    }
    this.busy.set(true);
    from(pending)
      .pipe(
        concatMap((item) => this.api.updateReviewItem(orgId, r.id, item.id, { decision: 'keep' })),
        last(),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.reload();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.toastError(err);
          this.reload();
        },
      });
  }

  protected remove(r: AccessReviewDetail): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteReview(orgId, r.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('assets.reviewDetail.deleted', { code: r.code });
        void this.router.navigate(['/assets/access-reviews']);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.toastError(err);
      },
    });
  }

  private orgId(): string {
    return this.selectedOrg.currentOrgId() ?? '';
  }

  private run(
    call: ReturnType<AssetsApi['startReview']>,
    successKey: string,
    done?: () => void,
  ): void {
    if (!this.orgId() || this.busy()) {
      return;
    }
    this.busy.set(true);
    call.subscribe({
      next: (r) => {
        this.busy.set(false);
        done?.();
        this.review.set(r);
        this.notifications.success(successKey, { code: r.code });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        done?.();
        this.toastError(err);
        this.reload();
      },
    });
  }

  private replaceItem(item: ReviewItem): void {
    this.review.update((r) => {
      if (!r) {
        return r;
      }
      const items = r.items.map((i) => (i.id === item.id ? item : i));
      const status =
        r.status === 'planned' && item.decision !== 'pending' ? 'in_progress' : r.status;
      return { ...r, items, status, counts: countItems(items) };
    });
  }

  private toastError(err: unknown): void {
    const message = assetErrorMessage(err);
    this.notifications.error(message.key, { ...message.params });
  }

  private reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
  }

  private load(orgId: string | null, id: string, showLoading: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (showLoading) {
      this.state.set('loading');
    }
    this.request = this.api.getReview(orgId, id).subscribe({
      next: (r) => {
        this.review.set(r);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
