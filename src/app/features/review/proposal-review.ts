import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { PromptDialog } from '../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { DocumentControlApi } from '../documents/data/document-control-api';
import { DocumentType } from '../documents/data/document-control.models';
import { proposalRequirementText } from './proposal-label';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import {
  AccessGrant,
  DocumentVisibility,
  ProposalDetail,
  ProposalEdit,
} from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { DocumentAccessEditor } from '../documents/access/document-access-editor';
import { DocumentEditor } from '../documents/editor/document-editor';

/**
 * Per-proposal review page (`/review/:id`). Opens a pending draft in the same
 * rich editor used to edit a document — Type / Title / Document code fields plus
 * the embedded {@link DocumentEditor} (toolbar + embedded AI) loaded with the
 * proposal's `content_html`. A reviewer can edit and AI-revise, then Save draft
 * (PATCH), Approve & publish (POST approve with the edited body, then open the
 * created document), or Reject. Non-pending proposals render read-only.
 * Navigates back to the feed on org switch.
 */
@Component({
  selector: 'app-proposal-review',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    LocalDatePipe,
    PageHeader,
    PromptDialog,
    StatusBadge,
    ErrorState,
    LoadingState,
    Card,
    Button,
    FormField,
    Icon,
    DocumentEditor,
    DocumentAccessEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @if (loading()) {
        <app-loading-state [rows]="6" />
      } @else if (proposal(); as prop) {
        <app-page-header
          titleKey="review.reviewTitle"
          [breadcrumbs]="[
            { labelKey: 'nav.myWork', link: '/my-work' },
            { labelKey: 'review.title', link: '/review' },
            { label: prop.title },
          ]"
          backLink="/review"
          backLabelKey="review.backToFeed"
        >
          <ng-container meta>
            @if (prop.type_name) {
              <span>{{
                'documents.proposals.newOfType' | transloco: { type: prop.type_name }
              }}</span>
              <span aria-hidden="true">·</span>
            }
            @if (prop.created_by_name) {
              <span>{{
                'documents.proposals.proposedBy' | transloco: { name: prop.created_by_name }
              }}</span>
              <span aria-hidden="true">·</span>
            }
            <span>{{
              'review.submittedAt'
                | transloco: { date: (prop.submitted_at ?? prop.created_at | localDate) }
            }}</span>
            @if (!editable()) {
              <app-status-badge
                meaning="lifecycle"
                [value]="prop.status"
                [labelKey]="'documents.proposals.status.' + prop.status"
              />
            }
          </ng-container>
        </app-page-header>

        @if (requirementText(); as req) {
          <p
            class="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-meta text-fg-muted"
            [title]="prop.requirement_label?.title ?? ''"
            data-testid="proposal-requirement"
          >
            <app-icon name="link" [size]="12" />
            {{ 'documents.proposals.forRequirement' | transloco: { requirement: req } }}
          </p>
        }

        @if (!editable()) {
          <app-card>
            <p class="px-1 py-1 text-ui text-fg-muted">
              {{ 'review.notPending' | transloco }}
            </p>
            @if (prop.review_note) {
              <p class="mt-2 px-1 text-ui text-fg">
                {{ 'documents.proposals.reasonShown' | transloco: { reason: prop.review_note } }}
              </p>
            }
          </app-card>
        }

        <form class="mt-4 flex flex-col gap-4" [formGroup]="form">
          <app-card>
            <div class="flex flex-col gap-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <app-form-field inputId="prop-type" [label]="'documents.fields.type' | transloco">
                  @if (types().length) {
                    <select id="prop-type" formControlName="type">
                      @for (t of typeOptions(); track t.key) {
                        <option [value]="t.key">{{ t.name }}</option>
                      }
                    </select>
                  } @else {
                    <input id="prop-type" type="text" formControlName="type" autocomplete="off" />
                  }
                </app-form-field>
                <app-form-field
                  inputId="prop-code"
                  [label]="'documents.fields.codeOptional' | transloco"
                >
                  <input id="prop-code" type="text" formControlName="doc_code" autocomplete="off" />
                </app-form-field>
              </div>

              <app-form-field inputId="prop-title" [label]="'documents.fields.title' | transloco">
                <input id="prop-title" type="text" formControlName="title" autocomplete="off" />
              </app-form-field>
            </div>
          </app-card>

          <app-document-editor
            [content]="initialHtml()"
            [embedded]="true"
            (contentChange)="content.set($event)"
          />

          @if (editable()) {
            <app-card [padded]="false">
              <h2
                class="px-4 pt-3.5 pb-1 font-display text-card font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'documents.access.sectionTitle' | transloco }}
              </h2>
              <p class="px-4 pb-3 text-meta text-fg-subtle">
                {{ 'documents.access.sectionHint' | transloco }}
              </p>
              <div class="border-t border-border px-4 py-4">
                <app-document-access-editor
                  mode="local"
                  [owner]="owner()"
                  [visibility]="visibility()"
                  [grants]="grants()"
                  (ownerChange)="owner.set($event)"
                  (visibilityChange)="visibility.set($event)"
                  (grantsChange)="grants.set($event)"
                />
              </div>
            </app-card>

            <div
              class="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg py-3"
            >
              <app-button
                *appHasPermission="'documents:approve'"
                type="button"
                variant="ghost"
                [disabled]="rejecting()"
                (click)="rejectOpen.set(true)"
              >
                {{ 'review.reject' | transloco }}
              </app-button>
              <a routerLink="/review">
                <app-button type="button" variant="secondary">
                  {{ 'documents.cancel' | transloco }}
                </app-button>
              </a>
              <app-button
                *appHasPermission="'documents:draft'"
                type="button"
                variant="secondary"
                [loading]="saving()"
                (click)="saveDraft()"
              >
                {{ 'review.saveDraft' | transloco }}
              </app-button>
              <app-button
                *appHasPermission="'documents:approve'"
                type="button"
                [loading]="approving()"
                (click)="approve()"
              >
                <app-icon name="check" [size]="15" />
                {{ 'review.approveAndPublish' | transloco }}
              </app-button>
            </div>
          }
        </form>
      } @else if (notFound()) {
        <app-card>
          <div class="px-2 py-10 text-center text-body text-fg-muted">
            {{ 'review.notFound' | transloco }}
          </div>
        </app-card>
      } @else {
        <app-error-state (retry)="reload()" />
      }
    </div>

    <app-prompt-dialog
      [open]="rejectOpen()"
      [title]="'documents.proposals.rejectTitle' | transloco: { title: proposal()?.title ?? '' }"
      [message]="'documents.proposals.rejectBody' | transloco"
      [label]="'documents.proposals.rejectReason' | transloco"
      [placeholder]="'documents.proposals.rejectPlaceholder' | transloco"
      [required]="false"
      [maxLength]="2000"
      confirmVariant="danger"
      [confirmLabel]="'review.reject' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="rejecting()"
      (confirmed)="reject($event)"
      (cancelled)="rejectOpen.set(false)"
    />
  `,
})
export class ProposalReview {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly controlApi = inject(DocumentControlApi);
  private readonly language = inject(LanguageService);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly proposal = signal<ProposalDetail | null>(null);
  protected readonly initialHtml = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly approving = signal(false);
  protected readonly rejecting = signal(false);
  protected readonly rejectOpen = signal(false);
  protected readonly notFound = signal(false);
  /** The org's document types (the proposal's type is picked from them). */
  protected readonly types = signal<readonly DocumentType[]>([]);
  /** Active types, plus the proposal's own type when it is not among them. */
  protected readonly typeOptions = computed(() => {
    const types = this.types()
      .filter((t) => t.active)
      .map((t) => ({ key: t.key, name: t.name }));
    const prop = this.proposal();
    if (prop?.type && !types.some((t) => t.key === prop.type)) {
      types.push({ key: prop.type, name: prop.type_name ?? prop.type });
    }
    return types;
  });
  protected readonly requirementText = computed(() => {
    const prop = this.proposal();
    return prop ? proposalRequirementText(prop) : null;
  });

  /** Current editor HTML, streamed from the embedded editor. */
  protected readonly content = signal('');

  /** Access the reviewer sets for the document this proposal will publish. */
  protected readonly owner = signal(this.auth.user()?.id ?? '');
  protected readonly visibility = signal<DocumentVisibility>('organization');
  protected readonly grants = signal<readonly AccessGrant[]>([]);

  protected readonly editable = computed(() => this.proposal()?.status === 'pending');

  protected readonly form = this.fb.nonNullable.group({
    type: ['', [Validators.required]],
    title: ['', [Validators.required]],
    doc_code: [''],
  });

  private currentOrgId: string | null = null;

  constructor() {
    providePageContext(() => {
      const prop = this.proposal();
      return {
        module: 'documents',
        entityType: 'proposal',
        entityId: this.id(),
        view: 'detail',
        title: prop?.title ?? this.language.translate('review.reviewTitle'),
        requirements: prop?.requirement_ref ? [prop.requirement_ref] : [],
      };
    });
    effect(() => {
      const orgId = this.orgId();
      const id = this.id();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/review');
        return;
      }
      this.currentOrgId = orgId;
      if (orgId) {
        this.load(orgId, id);
        this.controlApi.listTypes(orgId).subscribe({
          next: (types) => this.types.set(types),
          error: () => this.types.set([]),
        });
      }
    });
  }

  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.load(orgId, this.id());
    }
  }

  protected saveDraft(): void {
    const orgId = this.orgId();
    if (!orgId || this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.updateProposal(orgId, this.id(), this.edit()).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.proposal.set(updated);
        this.notifications.success('review.savedToast');
      },
      error: () => this.saving.set(false),
    });
  }

  protected approve(): void {
    const orgId = this.orgId();
    if (!orgId || this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.approving.set(true);
    const visibility = this.visibility();
    const access = this.grants().map((g) => ({
      subject_type: g.subject_type,
      subject_id: g.subject_id,
      level: g.level,
    }));
    const body: ProposalEdit = {
      ...this.edit(),
      owner_user_id: this.owner() || undefined,
      visibility,
      access: visibility === 'restricted' && access.length ? access : undefined,
    };
    this.api.approveProposal(orgId, this.id(), body).subscribe({
      next: (result) => {
        this.approving.set(false);
        this.notifications.success('review.publishedToast');
        void this.router.navigate(['/documents', result.document_id]);
      },
      error: () => this.approving.set(false),
    });
  }

  protected reject(reason: string): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.rejecting.set(true);
    this.api.rejectProposal(orgId, this.id(), reason).subscribe({
      next: () => {
        this.rejecting.set(false);
        this.rejectOpen.set(false);
        this.notifications.info('review.rejectedToast');
        void this.router.navigateByUrl('/review');
      },
      error: () => this.rejecting.set(false),
    });
  }

  private busy(): boolean {
    return this.saving() || this.approving() || this.rejecting();
  }

  private edit(): ProposalEdit {
    const value = this.form.getRawValue();
    const docCode = value.doc_code.trim();
    return {
      content_html: this.content(),
      title: value.title.trim(),
      type: value.type.trim(),
      doc_code: docCode || undefined,
    };
  }

  private load(orgId: string, id: string): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.api.getProposal(orgId, id, this.language.active()).subscribe({
      next: (proposal) => {
        this.proposal.set(proposal);
        this.initialHtml.set(proposal.content_html);
        this.content.set(proposal.content_html);
        this.form.setValue({
          type: proposal.type,
          title: proposal.title,
          doc_code: proposal.doc_code ?? '',
        });
        if (proposal.status !== 'pending') {
          this.form.disable();
        }
        this.loading.set(false);
      },
      error: (error: { status?: number }) => {
        this.proposal.set(null);
        this.loading.set(false);
        this.notFound.set(error.status === 404 || error.status === 403);
      },
    });
  }
}
