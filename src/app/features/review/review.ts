import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { DocumentSummary, Proposal } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents-api';
import { reviewState } from '../../core/documents/review-state';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { proposalRequirementText } from './proposal-label';

/**
 * "Til godkjenning" work feed, scoped to the selected org. Two lists:
 *  - documents sent for approval (`in_review`) — each card opens the document,
 *    where the approver approves or asks for changes;
 *  - proposed drafts (written with KI or by others) — each card opens the review
 *    editor; "Avvis" asks for confirmation and an optional reason.
 * Each card shows what it is (code, type), who proposed it and when. When nothing
 * waits, the empty state points to documents whose periodic review is due.
 * Reloads on org switch.
 */
@Component({
  selector: 'app-review',
  imports: [
    LocalDatePipe,
    RouterLink,
    TranslocoPipe,
    Card,
    Button,
    ErrorState,
    Icon,
    LoadingState,
    PageHeader,
    PromptDialog,
  ],
  viewProviders: [provideSharedScope('tasks', 'documents')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[860px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="review.title"
        descriptionKey="review.subtitle"
        [breadcrumbs]="[{ labelKey: 'nav.myWork', link: '/my-work' }, { labelKey: 'review.title' }]"
      >
        <a
          intro
          routerLink="/my-work"
          [queryParams]="{ tab: 'review' }"
          class="mt-2 inline-flex items-center gap-1.5 text-ui font-semibold text-accent hover:underline"
          data-testid="review-in-my-work"
        >
          <app-icon name="inbox" [size]="14" />
          {{ 'tasks.myWork.reviewHint' | transloco }}
        </a>
      </app-page-header>

      @if (loading()) {
        <app-loading-state [rows]="4" />
      } @else if (failed()) {
        <app-error-state (retry)="reload()" />
      } @else if (empty()) {
        <app-card>
          <div
            class="flex flex-col items-center gap-3 py-10 text-center"
            data-testid="review-empty"
          >
            <span
              class="flex h-12 w-12 items-center justify-center rounded-card border border-pass/30 bg-pass-soft text-pass"
            >
              <app-icon name="checkcircle" [size]="22" />
            </span>
            <p class="text-card font-semibold text-fg">{{ 'review.empty' | transloco }}</p>
            @if (reviewsDue() > 0) {
              <p class="max-w-[48ch] text-ui text-fg-muted">
                {{ 'documents.proposals.reviewsDue' | transloco: { count: reviewsDue() } }}
              </p>
              <a
                routerLink="/documents"
                [queryParams]="{ review: 'due' }"
                data-testid="review-due-link"
              >
                <app-button variant="secondary">
                  {{ 'documents.proposals.openReviewsDue' | transloco }}
                </app-button>
              </a>
            } @else {
              <p class="max-w-[48ch] text-ui text-fg-muted">
                {{ 'documents.proposals.emptyNext' | transloco }}
              </p>
              <a routerLink="/documents">
                <app-button variant="secondary">
                  {{ 'documents.proposals.openDocuments' | transloco }}
                </app-button>
              </a>
            }
          </div>
        </app-card>
      } @else {
        @if (documents().length > 0) {
          <h2 class="mb-2 text-meta font-semibold text-fg-muted">
            {{ 'review.documentsHeading' | transloco: { count: documents().length } }}
          </h2>
          <ul class="mb-6 flex flex-col gap-3" data-testid="review-documents">
            @for (doc of documents(); track doc.id) {
              <li>
                <a
                  [routerLink]="['/documents', doc.id]"
                  class="group flex items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-card hover:border-accent-border focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <span
                    class="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-tile bg-accent-soft text-accent"
                  >
                    <app-icon name="documents" [size]="17" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-meta text-fg-subtle">
                      <span class="font-mono">{{ doc.doc_code }}</span>
                      @if (doc.type_name) {
                        · {{ doc.type_name }}
                      }
                    </span>
                    <span
                      class="block font-display text-card font-bold text-fg group-hover:text-accent"
                      >{{ doc.title }}</span
                    >
                    <span class="mt-1 block text-meta text-fg-muted">
                      @if (doc.owner_name) {
                        {{ 'documents.proposals.owner' | transloco: { name: doc.owner_name } }} ·
                      }
                      {{
                        'documents.proposals.updatedAt'
                          | transloco: { date: (doc.updated_at | localDate) }
                      }}
                    </span>
                  </span>
                  <span
                    class="mt-1 hidden flex-none items-center gap-1 text-ui font-semibold text-accent sm:inline-flex"
                    aria-hidden="true"
                  >
                    {{ 'review.reviewDocument' | transloco }}
                    <app-icon name="arrow" [size]="14" />
                  </span>
                </a>
              </li>
            }
          </ul>
        }

        @if (proposals().length > 0) {
          <h2 class="mb-2 text-meta font-semibold text-fg-muted">
            {{ 'review.proposalsHeading' | transloco: { count: proposals().length } }}
          </h2>
          <ul class="flex flex-col gap-3" data-testid="review-proposals">
            @for (proposal of proposals(); track proposal.id) {
              <li
                class="rounded-card border border-border bg-surface shadow-card hover:border-accent-border"
              >
                <a
                  [routerLink]="['/review', proposal.id]"
                  class="group flex items-start gap-3 p-4 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <span
                    class="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-tile bg-accent-soft text-accent"
                  >
                    <app-icon name="spark" [size]="17" />
                  </span>
                  <span class="min-w-0 flex-1">
                    @if (proposal.type_name) {
                      <span class="block text-meta text-fg-subtle">{{
                        'documents.proposals.newOfType' | transloco: { type: proposal.type_name }
                      }}</span>
                    }
                    <span
                      class="block font-display text-card font-bold text-fg group-hover:text-accent"
                      >{{ proposal.title }}</span
                    >
                    @if (proposal.summary) {
                      <span class="mt-1 block text-ui leading-relaxed text-fg-muted">{{
                        proposal.summary
                      }}</span>
                    }
                    @if (requirementText(proposal); as req) {
                      <span
                        class="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-meta text-fg-muted"
                        [title]="proposal.requirement_label?.title ?? ''"
                      >
                        <app-icon name="link" [size]="12" />
                        {{ 'documents.proposals.forRequirement' | transloco: { requirement: req } }}
                      </span>
                    }
                    <span class="mt-1.5 block text-meta text-fg-subtle">
                      @if (proposal.created_by_name) {
                        {{
                          'documents.proposals.proposedBy'
                            | transloco: { name: proposal.created_by_name }
                        }}
                        ·
                      }
                      {{
                        'review.submittedAt'
                          | transloco
                            : {
                                date: (proposal.submitted_at ?? proposal.created_at | localDate),
                              }
                      }}
                    </span>
                  </span>
                </a>
                <div class="flex justify-end gap-2 border-t border-border px-4 py-2.5">
                  <app-button
                    variant="ghost"
                    size="sm"
                    [disabled]="busyId() === proposal.id"
                    (click)="rejecting.set(proposal)"
                    [attr.data-testid]="'reject-' + proposal.id"
                  >
                    {{ 'review.reject' | transloco }}
                  </app-button>
                  <a [routerLink]="['/review', proposal.id]" tabindex="-1">
                    <app-button size="sm">
                      <app-icon name="pencil" [size]="14" />
                      {{ 'review.open' | transloco }}
                    </app-button>
                  </a>
                </div>
              </li>
            }
          </ul>
        }
      }
    </div>

    <app-prompt-dialog
      [open]="rejecting() !== null"
      [title]="'documents.proposals.rejectTitle' | transloco: { title: rejecting()?.title ?? '' }"
      [message]="'documents.proposals.rejectBody' | transloco"
      [label]="'documents.proposals.rejectReason' | transloco"
      [placeholder]="'documents.proposals.rejectPlaceholder' | transloco"
      [required]="false"
      [maxLength]="2000"
      confirmVariant="danger"
      [confirmLabel]="'review.reject' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busyId() !== null"
      (confirmed)="reject($event)"
      (cancelled)="rejecting.set(null)"
    />
  `,
})
export class Review {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly proposals = signal<readonly Proposal[]>([]);
  /** Documents sent for approval (status `in_review`). */
  protected readonly documents = signal<readonly DocumentSummary[]>([]);
  /** Approved documents whose periodic review is due or overdue (for the empty state). */
  protected readonly reviewsDue = signal(0);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly empty = computed(
    () => this.proposals().length === 0 && this.documents().length === 0,
  );
  protected readonly busyId = signal<string | null>(null);
  /** The proposal the reject dialog is open for. */
  protected readonly rejecting = signal<Proposal | null>(null);

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      view: 'list',
      title: this.language.translate('review.title'),
    }));
    effect(() => {
      const orgId = this.orgId();
      this.proposals.set([]);
      this.documents.set([]);
      this.busyId.set(null);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected requirementText(proposal: Proposal): string | null {
    return proposalRequirementText(proposal);
  }

  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.load(orgId);
    }
  }

  protected reject(reason: string): void {
    const orgId = this.orgId();
    const proposal = this.rejecting();
    if (!orgId || !proposal || this.busyId()) {
      return;
    }
    this.busyId.set(proposal.id);
    this.api.rejectProposal(orgId, proposal.id, reason).subscribe({
      next: () => {
        this.busyId.set(null);
        this.rejecting.set(null);
        this.proposals.update((list) => list.filter((p) => p.id !== proposal.id));
        this.notifications.info('review.rejectedToast');
      },
      error: () => this.busyId.set(null),
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.failed.set(false);
    let failures = 0;
    const fallback = <T>(value: T) =>
      catchError<T, Observable<T>>(() => {
        failures += 1;
        return of(value);
      });
    // Either feed failing still shows the other.
    forkJoin({
      proposals: this.api
        .listProposals(orgId, this.language.active())
        .pipe(fallback([] as Proposal[])),
      documents: this.api.list(orgId).pipe(fallback([] as DocumentSummary[])),
    }).subscribe(({ proposals, documents }) => {
      this.proposals.set(proposals);
      this.documents.set(documents.filter((d) => d.status === 'in_review'));
      this.reviewsDue.set(documents.filter((d) => reviewState(d) !== null).length);
      this.failed.set(failures === 2);
      this.loading.set(false);
    });
  }
}
