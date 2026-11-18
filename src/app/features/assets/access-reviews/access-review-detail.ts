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
import { pluralKey } from '../../../shared/i18n/plural';
import { Subscription, catchError, concatMap, from, last, of } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { isFlaggedSubject, reviewStatusBadge } from '../data/asset-display';
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

/** The next step of a review, shown as the page's one primary action. */
export type ReviewNextStep = 'start' | 'complete' | null;

export function reviewNextStep(r: AccessReviewDetail): ReviewNextStep {
  if (!r.can_work) {
    return null;
  }
  if (canComplete(r)) {
    return 'complete';
  }
  if (r.status === 'planned' && r.counts.total > 0) {
    return 'start';
  }
  return null;
}

/**
 * An access review (`/assets/access-reviews/:id`): progress ("3 av 5 avgjort"), accounts
 * flagged against People (left, leaving, no longer a member; "Fjern" suggested), the
 * decisions, the revocations still to carry out with their tasks, and completion with
 * a signed attestation (ISO 27001 A.5.15–A.5.18). The header shows only the next step
 * ("Start gjennomgangen" / "Fullfør og bekreft"); editing, importing accounts,
 * cancelling and deleting sit under "Mer". Accounts can be pasted from the system's
 * account list (CSV). After completion, revocations are ticked off as they are carried
 * out, which closes the matching remediation task.
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
    Button,
    Card,
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    KpiTile,
    LoadingState,
    MenuItem,
    PromptDialog,
    RecordDetailLayout,
    ReviewItems,
    StatusBadge,
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
            routerLink="/assets/access-reviews"
            class="mb-3 inline-flex items-center gap-1 text-ui font-semibold text-fg-muted hover:text-fg"
          >
            <app-icon name="back" [size]="14" />
            {{ 'assets.common.backToReviews' | transloco }}
          </a>
          <app-error-state
            titleKey="assets.reviewDetail.notFoundTitle"
            bodyKey="assets.reviewDetail.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @default {
        @if (review(); as r) {
          <app-record-detail-layout
            entityType="access_review"
            [entityId]="r.id"
            [title]="r.title"
            [breadcrumbs]="[
              { labelKey: 'modules.names.assets', link: '/assets' },
              { labelKey: 'assets.reviews.title', link: '/assets/access-reviews' },
              { label: r.code },
            ]"
            [tabs]="tabs"
            [canEdit]="r.can_manage"
            [requirementsPanel]="true"
            [includeAudit]="canAudit()"
            backLink="/assets/access-reviews"
            backLabelKey="assets.common.backToReviews"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ r.code }}</span>
              <span aria-hidden="true">·</span>
              <app-status-badge
                [meaning]="statusBadge(r.status).meaning"
                [value]="statusBadge(r.status).value"
                [labelKey]="'assets.reviewStatus.' + r.status"
              />
              @if (r.overdue) {
                <app-status-badge
                  meaning="lifecycle"
                  value="overdue"
                  labelKey="assets.common.overdue"
                />
              }
              @if (r.counts.total) {
                <span data-testid="review-progress">{{
                  'assets.reviews.progress'
                    | transloco: { done: r.counts.total - r.counts.pending, total: r.counts.total }
                }}</span>
              }
            </ng-container>

            @if (nextStep() === 'start') {
              <app-button primary [disabled]="busy()" data-testid="review-start" (click)="start(r)">
                {{ 'assets.reviewDetail.start' | transloco }}
              </app-button>
            }
            @if (nextStep() === 'complete') {
              <app-button
                primary
                [disabled]="busy()"
                data-testid="review-complete"
                (click)="completeOpen.set(true)"
              >
                <app-icon name="checkcircle" [size]="14" />
                {{ 'assets.reviewDetail.complete' | transloco }}
              </app-button>
            }
            @if (r.can_manage && open()) {
              <a
                secondary
                [routerLink]="['/assets/access-reviews', r.id, 'edit']"
                class="inline-flex h-9 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
              >
                {{ 'assets.common.edit' | transloco }}
              </a>
            }
            <app-watch-button secondary entityType="access_review" [entityId]="r.id" />
            @if (open() && r.can_work) {
              <button appMenuItem overflow type="button" (click)="csvOpen.set(true)">
                {{ 'assets.reviewItems.importCsv' | transloco }}
              </button>
            }
            @if (open() && r.can_work) {
              <button appMenuItem overflow type="button" (click)="importMembers(r)">
                {{ 'assets.reviewItems.importMembers' | transloco }}
              </button>
            }
            @if (!ai.unavailable()) {
              <button appMenuItem overflow type="button" (click)="askHelp()">
                {{ 'assets.ai.reviewHelp' | transloco }}
              </button>
            }
            @if (r.can_manage && open()) {
              <button appMenuItem overflow type="button" (click)="cancelOpen.set(true)">
                {{ 'assets.reviewDetail.cancel' | transloco }}
              </button>
            }
            @if (r.can_manage) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleteOpen.set(true)"
              >
                {{ 'assets.common.delete' | transloco }}
              </button>
            }

            <app-help-strip
              help
              scope="assets"
              page="review"
              lesson="access-reviews"
              [subject]="r.title"
            />

            <div class="flex flex-col gap-5">
              @if (open() && !completable() && r.can_work) {
                <p class="text-ui text-fg-muted" data-testid="review-next-hint">
                  {{
                    (r.counts.total === 0
                      ? 'assets.reviewDetail.needItems'
                      : 'assets.reviewDetail.needDecisions'
                    ) | transloco: { pending: r.counts.pending }
                  }}
                </p>
              }

              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <app-kpi-tile
                  noLink="shownBelow"
                  [label]="'assets.reviewDetail.accounts' | transloco"
                  [value]="r.counts.total"
                />
                <app-kpi-tile
                  noLink="shownBelow"
                  [label]="'assets.reviewDetail.decided' | transloco"
                  [value]="r.counts.total - r.counts.pending"
                  [delta]="
                    r.counts.pending
                      ? ('assets.reviewDetail.left' | transloco: { count: r.counts.pending })
                      : ''
                  "
                  [tone]="r.counts.pending ? 'warn' : r.counts.total ? 'pass' : 'neutral'"
                />
                <app-kpi-tile
                  noLink="shownBelow"
                  [label]="'assets.reviewDetail.flagged' | transloco"
                  [value]="flagged()"
                  [tone]="flagged() ? 'warn' : 'neutral'"
                />
                <app-kpi-tile
                  noLink="shownBelow"
                  [label]="'assets.decision.revoke' | transloco"
                  [value]="r.counts.revoke"
                  [tone]="r.counts.revoke ? 'fail' : 'neutral'"
                />
                <app-kpi-tile
                  noLink="shownBelow"
                  [label]="'assets.decision.modify' | transloco"
                  [value]="r.counts.modify"
                  [tone]="r.counts.modify ? 'warn' : 'neutral'"
                />
                <app-kpi-tile
                  noLink="shownBelow"
                  [label]="'assets.reviewDetail.toCarryOut' | transloco"
                  [value]="carriedOut() + ' / ' + (r.counts.revoke + r.counts.modify)"
                  [tone]="r.counts.unremediated ? 'warn' : 'neutral'"
                />
              </div>

              @if (r.status === 'completed' && r.counts.revoke + r.counts.modify) {
                <app-card>
                  <div data-testid="revocations-card">
                    <h2 class="mb-1 font-display text-card font-bold text-fg">
                      {{ 'assets.reviewDetail.revocationsTitle' | transloco }}
                    </h2>
                    <p class="mb-3 text-ui text-fg-muted">
                      @if (r.counts.unremediated) {
                        {{
                          pluralKey('assets.reviewDetail.revocationsOpen', r.counts.unremediated)
                            | transloco: { count: r.counts.unremediated }
                        }}
                      } @else {
                        {{ 'assets.reviewDetail.revocationsDone' | transloco }}
                      }
                    </p>
                    @if (tasks().length) {
                      <ul class="flex flex-col divide-y divide-border">
                        @for (t of tasks(); track t.id) {
                          <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                            <app-entity-chip
                              [ref]="{
                                entity_type: 'task',
                                entity_id: t.id,
                                title: t.title,
                                url: t.url,
                                status: t.status,
                              }"
                            />
                            @if (t.assignee?.name; as name) {
                              <span class="text-meta text-fg-muted">{{ name }}</span>
                            }
                            @if (t.due_at) {
                              <span class="text-meta text-fg-subtle">{{
                                'assets.reviews.dueOn' | transloco: { date: (t.due_at | localDay) }
                              }}</span>
                            }
                          </li>
                        }
                      </ul>
                    }
                  </div>
                </app-card>
              }

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'assets.reviewDetail.about' | transloco }}
                </h2>
                <app-field-list [columns]="3">
                  <app-field-item labelKey="assets.fields.system">
                    @if (r.system_asset; as s) {
                      <app-entity-chip
                        [ref]="{
                          entity_type: 'asset',
                          entity_id: s.id,
                          code: s.code,
                          title: s.name,
                          url: s.url,
                        }"
                      />
                    } @else if (r.system_name) {
                      {{ r.system_name }}
                    }
                  </app-field-item>
                  <app-field-item labelKey="assets.fields.reviewer" [value]="r.reviewer?.name" />
                  <app-field-item labelKey="assets.fields.dueOn">
                    <span [class.font-semibold]="r.overdue" [class.text-warn-ink]="r.overdue">{{
                      r.due_on | localDay
                    }}</span>
                  </app-field-item>
                  <app-field-item labelKey="assets.fields.frequencyMonths">
                    @if (r.frequency_months; as months) {
                      {{ 'assets.reviews.everyMonths' | transloco: { months } }}
                    } @else {
                      {{ 'assets.reviewDetail.oneOff' | transloco }}
                    }
                  </app-field-item>
                  @if (r.started_at) {
                    <app-field-item
                      labelKey="assets.fields.startedAt"
                      [value]="r.started_at | localDate"
                    />
                  }
                  @if (r.previous_review_id || r.next_review_id) {
                    <app-field-item labelKey="assets.reviewDetail.series">
                      <span class="flex flex-col">
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
                      </span>
                    </app-field-item>
                  }
                  @if (r.scope) {
                    <app-field-item labelKey="assets.fields.scope" [wide]="true">
                      <div class="cf-prose text-body" [innerHTML]="r.scope | appMarkdown"></div>
                    </app-field-item>
                  }
                </app-field-list>
              </app-card>

              @if (r.status === 'completed') {
                <app-card>
                  <h2 class="mb-2 font-display text-card font-bold text-fg">
                    {{ 'assets.reviewDetail.attestation' | transloco }}
                  </h2>
                  <p class="text-meta text-fg-muted">
                    {{
                      'assets.reviewDetail.completedBy'
                        | transloco
                          : {
                              name: r.completed_by?.name ?? ('assets.common.unknown' | transloco),
                              date: (r.completed_at | localDate),
                            }
                    }}
                  </p>
                  <blockquote class="mt-2 border-l-2 border-accent pl-3 text-body text-fg">
                    {{ r.attestation }}
                  </blockquote>
                </app-card>
              }

              @if (!r.can_work && open()) {
                <app-alert tone="info">{{ 'assets.reviewDetail.readOnly' | transloco }}</app-alert>
              }

              <app-card>
                <app-review-items
                  [items]="r.items"
                  [editable]="open() && r.can_work"
                  [remediable]="r.can_work || r.can_manage"
                  [busy]="busy()"
                  (changed)="updateItem(r, $event)"
                  (added)="addItem(r, $event)"
                  (remove)="removeItem(r, $event)"
                  (importMembers)="importMembers(r)"
                  (importCsv)="csvOpen.set(true)"
                  (keepAll)="keepAll(r)"
                />
              </app-card>

              <app-why-it-matters scope="assets" page="review" />
            </div>

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
            [open]="csvOpen()"
            [title]="'assets.reviewItems.csvTitle' | transloco"
            [message]="'assets.reviewItems.csvMessage' | transloco"
            [label]="'assets.reviewItems.csvLabel' | transloco"
            [placeholder]="'assets.reviewItems.csvPlaceholder' | transloco"
            [confirmLabel]="'assets.reviewItems.csvImport' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [required]="true"
            [maxLength]="200000"
            [busy]="busy()"
            (confirmed)="importCsv(r, $event)"
            (cancelled)="csvOpen.set(false)"
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
  protected readonly pluralKey = pluralKey;
  private readonly api = inject(AssetsApi);
  private readonly standards = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  protected readonly ai = inject(AiAvailability);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly statusBadge = reviewStatusBadge;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly review = signal<AccessReviewDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly completeOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly csvOpen = signal(false);
  private readonly requirementRefs = signal<readonly string[]>([]);

  protected readonly open = computed(() => {
    const status = this.review()?.status;
    return status === 'planned' || status === 'in_progress';
  });
  protected readonly completable = computed(() => {
    const r = this.review();
    return !!r && canComplete(r);
  });
  protected readonly nextStep = computed(() => {
    const r = this.review();
    return r && this.open() ? reviewNextStep(r) : null;
  });
  protected readonly flagged = computed(
    () => (this.review()?.items ?? []).filter((i) => isFlaggedSubject(i.subject_status)).length,
  );
  protected readonly carriedOut = computed(() => {
    const r = this.review();
    return r ? r.counts.revoke + r.counts.modify - r.counts.unremediated : 0;
  });
  protected readonly tasks = computed(() => this.review()?.remediation_tasks ?? []);
  protected readonly systemLabel = computed(() => {
    const r = this.review();
    return r?.system_asset?.name ?? r?.system_name ?? '';
  });
  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canAudit = computed(() => this.permissions().includes('audit:read'));

  private request = new Subscription();
  private refsRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.refsRequest.unsubscribe();
    });
    providePageContext(() => {
      const r = this.review();
      return {
        module: 'assets',
        entityType: 'access_review',
        entityId: this.id(),
        view: 'detail',
        title: r ? `${r.code} ${r.title}` : null,
        requirements: this.requirementRefs(),
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.load(orgId, id, true);
        this.loadRefs(orgId, id);
      });
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
        // A revocation ticked off after completion also closes its task: re-read the tasks.
        if (change.patch.remediated !== undefined && r.status === 'completed') {
          this.reload();
        }
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

  /** Paste the system's account list (CSV / semicolon / tab, header optional, en or nb). */
  protected importCsv(r: AccessReviewDetail, text: string): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    const before = r.items.length;
    this.busy.set(true);
    this.api.importAccountsCsv(orgId, r.id, text).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.csvOpen.set(false);
        const count = Math.max(res.items.length - before, 0);
        this.notifications.success(pluralKey('assets.reviewItems.csvImported', count), { count });
        this.reload();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toastError(err);
      },
    });
  }

  /** Mark every undecided account as "keep" — except flagged holders (left, leaving). */
  protected keepAll(r: AccessReviewDetail): void {
    const orgId = this.orgId();
    const pending = r.items.filter(
      (i) => i.decision === 'pending' && !isFlaggedSubject(i.subject_status),
    );
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

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id(), false);
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

  private loadRefs(orgId: string | null, id: string): void {
    this.refsRequest.unsubscribe();
    this.requirementRefs.set([]);
    if (!orgId || !this.permissions().includes('standards:read')) {
      return;
    }
    this.refsRequest = this.standards
      .listLinks(orgId, { entity_type: 'access_review', entity_id: id })
      .pipe(catchError(() => of([])))
      .subscribe((links) =>
        this.requirementRefs.set(
          links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
        ),
      );
  }
}
