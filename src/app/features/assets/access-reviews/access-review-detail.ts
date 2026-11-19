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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { AskPanelService } from '../../ask/ask-panel.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
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
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FieldItem } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
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
  'related',
  'activity',
  'comments',
  'attachments',
  'tasks',
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

/** The status sentence of a review: i18n key under `assets.reviewDetail.statusLine`, tone, params. */
export interface ReviewStatusLine {
  readonly key: string;
  readonly tone: StatusLineTone;
  readonly params: Record<string, unknown>;
}

/**
 * How the review stands, in one sentence (docs/ux-guide.md §2.7): how many accounts are
 * decided while it is open, whether the access changes are carried out once it is done.
 * Open work is a to-do (warn), never red.
 */
export function reviewStatusLine(r: AccessReviewDetail): ReviewStatusLine {
  const c = r.counts;
  const line = (key: string, tone: StatusLineTone, params: Record<string, unknown> = {}) => ({
    key: `assets.reviewDetail.statusLine.${key}`,
    tone,
    params,
  });
  if (r.status === 'cancelled') {
    return line('cancelled', 'neutral');
  }
  if (r.status === 'completed') {
    return c.unremediated > 0
      ? line(c.unremediated === 1 ? 'completedOpenOne' : 'completedOpen', 'warn', {
          count: c.unremediated,
        })
      : line('completed', 'pass');
  }
  if (c.total === 0) {
    return line('noAccounts', 'warn');
  }
  if (r.status === 'planned' && c.pending === c.total) {
    return line('planned', 'neutral', { total: c.total });
  }
  if (c.pending > 0) {
    return line('deciding', 'warn', { done: c.total - c.pending, total: c.total });
  }
  return line('ready', 'pass', { total: c.total });
}

/** Where the review's "Oppfølging" lines lead (sections of the Details tab). */
export interface ReviewMissingHandlers {
  readonly accounts: () => void;
  readonly revocations: () => void;
}

/** What the review still needs ("Oppfølging"): accounts, decisions, access changes to carry out. */
export function reviewMissing(
  r: AccessReviewDetail,
  handlers: ReviewMissingHandlers,
): RecordMissingItem[] {
  const items: RecordMissingItem[] = [];
  const c = r.counts;
  const open = r.status === 'planned' || r.status === 'in_progress';
  if (open && r.can_work) {
    if (c.total === 0) {
      items.push({
        key: 'accounts',
        labelKey: 'assets.reviewDetail.missing.accounts',
        action: handlers.accounts,
      });
    } else if (c.pending > 0) {
      items.push({
        key: 'decisions',
        labelKey: pluralKey('assets.reviewDetail.missing.decisions', c.pending),
        params: { count: c.pending },
        action: handlers.accounts,
      });
    }
  }
  if (r.status === 'completed' && c.unremediated > 0 && (r.can_work || r.can_manage)) {
    items.push({
      key: 'revocations',
      labelKey: pluralKey('assets.reviewDetail.missing.revocations', c.unremediated),
      params: { count: c.unremediated },
      action: handlers.revocations,
    });
  }
  return items;
}

/**
 * An access review (`/assets/access-reviews/:id`) on the detail-page anatomy
 * (docs/ux-guide.md §2.7). Hovedinformasjon: how far the review has come ("3 av 5 kontoer
 * er avgjort"), which system it reviews (linked to the asset), who is responsible, the
 * deadline, the result so far (flagged accounts, accounts to remove or change) and, once
 * completed, the signed attestation (ISO 27001 A.5.15–A.5.18). The header shows only the
 * next step ("Start gjennomgangen" / "Fullfør og bekreft") and Rediger; importing
 * accounts, cancelling and deleting sit under "Mer". The Details tab holds the
 * revocations still to carry out with their tasks, the accounts and their decisions
 * (paste the system's account list as CSV, or import the members) and the scope. The
 * Oppfølging card says what is left, the requirements, the connections (with the
 * previous and next review of the series) and the dates.
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
    ConfirmDialog,
    EntityChip,
    EntityTasks,
    ErrorState,
    FieldItem,
    HelpStrip,
    Icon,
    LoadingState,
    MenuItem,
    PromptDialog,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    ReviewItems,
    StatusBadge,
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
          @let line = statusLine();
          <app-record-detail-layout
            [anatomy]="true"
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
            [missing]="missing()"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ r.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'assets.reviewDetail.type' | transloco }}</span>
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
            @if (r.can_manage && open() && nextStep()) {
              <app-button secondary variant="secondary" data-testid="review-edit" (click)="edit(r)">
                {{ 'assets.common.edit' | transloco }}
              </app-button>
            }
            @if (r.can_manage && open() && !nextStep()) {
              <app-button primary data-testid="review-edit" (click)="edit(r)">
                {{ 'assets.common.edit' | transloco }}
              </app-button>
            }
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

            <button appMenuItem ask type="button" (click)="askHelp()">
              <app-icon name="spark" [size]="15" />
              {{ 'assets.ai.reviewHelp' | transloco }}
            </button>

            <app-help-strip
              help
              scope="assets"
              page="review"
              lesson="access-reviews"
              [subject]="r.title"
            />

            <app-record-lead record-lead [fillLink]="r.can_manage && open() ? editLink() : null">
              <app-record-status-line status [tone]="line.tone" data-testid="review-status-line">
                {{ line.key | transloco: line.params }}
              </app-record-status-line>
              <app-field-item size="lead" labelKey="assets.reviewDetail.lead.system">
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
              <app-field-item
                size="lead"
                labelKey="assets.fields.reviewer"
                [value]="r.reviewer?.name"
              />
              @if (r.status === 'completed') {
                <app-field-item size="lead" labelKey="assets.reviewDetail.lead.completed">
                  @if (r.completed_at) {
                    {{
                      'assets.reviewDetail.lead.completedBy'
                        | transloco
                          : {
                              date: (r.completed_at | localDate: 'mediumDate'),
                              name: r.completed_by?.name ?? ('assets.common.unknown' | transloco),
                            }
                    }}
                  }
                </app-field-item>
              } @else if (r.status !== 'cancelled') {
                <app-field-item size="lead" labelKey="assets.fields.dueOn">
                  <span [class.font-semibold]="r.overdue" [class.text-warn-ink]="r.overdue">{{
                    r.due_on | localDay
                  }}</span>
                </app-field-item>
              }
              @if (r.counts.total) {
                <app-field-item size="lead" labelKey="assets.reviewDetail.lead.result">
                  <span data-testid="review-progress">{{ resultLine() }}</span>
                </app-field-item>
              }
              @if (r.status === 'completed') {
                <app-field-item
                  size="lead"
                  labelKey="assets.reviewDetail.attestation"
                  [wide]="true"
                >
                  @if (r.attestation) {
                    <blockquote class="border-l-2 border-accent pl-3 text-body text-fg">
                      {{ r.attestation }}
                    </blockquote>
                  }
                </app-field-item>
              }
            </app-record-lead>

            <div class="flex flex-col gap-8">
              @if (!r.can_work && open()) {
                <app-alert tone="info">{{ 'assets.reviewDetail.readOnly' | transloco }}</app-alert>
              }

              @if (r.status === 'completed' && (r.counts.unremediated || tasks().length)) {
                <section
                  id="review-revocations"
                  class="scroll-mt-20"
                  aria-labelledby="review-revocations-title"
                  data-testid="revocations-card"
                >
                  <h2
                    id="review-revocations-title"
                    class="mb-1 font-display text-card font-bold text-fg"
                  >
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
                    <ul
                      class="flex flex-col divide-y divide-border rounded-card border border-border bg-surface"
                    >
                      @for (t of tasks(); track t.id) {
                        <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-ui">
                          <app-entity-chip
                            [ref]="{
                              entity_type: 'task',
                              entity_id: t.id,
                              title: t.title,
                              url: t.url,
                              status: t.status,
                            }"
                            [statusText]="true"
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
                </section>
              }

              <section id="review-accounts" class="scroll-mt-20">
                @if (open() && !completable() && r.can_work) {
                  <p class="mb-2 text-ui text-fg-muted" data-testid="review-next-hint">
                    {{
                      (r.counts.total === 0
                        ? 'assets.reviewDetail.needItems'
                        : 'assets.reviewDetail.needDecisions'
                      ) | transloco: { pending: r.counts.pending }
                    }}
                  </p>
                }
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
              </section>

              <app-record-details
                [columns]="2"
                [fillLink]="r.can_manage && open() ? editLink() : null"
              >
                <app-field-item labelKey="assets.fields.scope" [wide]="true">
                  @if (r.scope) {
                    <div class="cf-prose text-body" [innerHTML]="r.scope | appMarkdown"></div>
                  }
                </app-field-item>
              </app-record-details>
            </div>

            <div tasks>
              <app-entity-tasks
                entityType="access_review"
                [entityId]="r.id"
                [canCreate]="r.can_manage"
                [entityLabel]="r.code + ' ' + r.title"
              />
            </div>

            @if (r.previous_review_id || r.next_review_id) {
              <div
                follow-up-connections
                class="mt-3 flex flex-col gap-1.5"
                data-testid="review-series"
              >
                @if (r.previous_review_id) {
                  <a
                    [routerLink]="['/assets/access-reviews', r.previous_review_id]"
                    class="inline-flex items-center gap-1.5 text-ui font-semibold text-accent hover:underline"
                  >
                    <app-icon name="shield" [size]="14" />
                    {{ 'assets.reviewDetail.previous' | transloco }}
                    <span aria-hidden="true">→</span>
                  </a>
                }
                @if (r.next_review_id) {
                  <a
                    [routerLink]="['/assets/access-reviews', r.next_review_id]"
                    class="inline-flex items-center gap-1.5 text-ui font-semibold text-accent hover:underline"
                  >
                    <app-icon name="shield" [size]="14" />
                    {{ 'assets.reviewDetail.next' | transloco }}
                    <span aria-hidden="true">→</span>
                  </a>
                }
              </div>
            }

            <app-record-meta follow-up-meta>
              <app-field-item layout="inline" labelKey="assets.fields.frequencyMonths">
                @if (r.frequency_months; as months) {
                  {{ 'assets.reviews.everyMonths' | transloco: { months } }}
                } @else {
                  {{ 'assets.reviewDetail.oneOff' | transloco }}
                }
              </app-field-item>
              @if (r.status === 'completed') {
                <app-field-item
                  layout="inline"
                  labelKey="assets.fields.dueOn"
                  [value]="r.due_on | localDay"
                />
              }
              <app-field-item
                layout="inline"
                labelKey="assets.fields.startedAt"
                [value]="r.started_at ? (r.started_at | localDate: 'mediumDate') : null"
              />
              <app-field-item
                layout="inline"
                labelKey="assets.detail.updated"
                [value]="r.updated_at | localDate"
              />
            </app-record-meta>

            <div aside-learn>
              <app-why-it-matters scope="assets" page="review" />
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

  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/assets/access-reviews',
    this.id(),
    'edit',
  ]);
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
  protected readonly statusLine = computed(() => {
    const r = this.review();
    return r ? reviewStatusLine(r) : { key: '', tone: 'neutral' as const, params: {} };
  });
  protected readonly flagged = computed(
    () => (this.review()?.items ?? []).filter((i) => isFlaggedSubject(i.subject_status)).length,
  );
  /** "1 flagget · 2 skal fjernes · 1 skal endres" (only the parts above zero). */
  protected readonly resultLine = computed(() => {
    const r = this.review();
    if (!r) {
      return '';
    }
    const t = (key: string, count: number) =>
      this.language.translate(pluralKey(`assets.reviewDetail.result.${key}`, count), { count });
    const parts = [
      t('accounts', r.counts.total),
      this.flagged() ? t('flagged', this.flagged()) : '',
      r.counts.revoke ? t('revoke', r.counts.revoke) : '',
      r.counts.modify ? t('modify', r.counts.modify) : '',
    ];
    if (!r.counts.revoke && !r.counts.modify && !r.counts.pending) {
      parts.push(this.language.translate('assets.reviewDetail.result.allKept'));
    }
    return parts.filter(Boolean).join(' · ');
  });
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const r = this.review();
    return r
      ? reviewMissing(r, {
          accounts: () => this.scrollTo('review-accounts'),
          revocations: () => this.scrollTo('review-revocations'),
        })
      : [];
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

  protected edit(r: AccessReviewDetail): void {
    void this.router.navigate(['/assets/access-reviews', r.id, 'edit']);
  }

  private scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
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
