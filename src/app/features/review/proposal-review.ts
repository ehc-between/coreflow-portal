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
import { AuthService } from '../../core/auth/auth.service';
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
import { Badge } from '../../shared/ui/badge/badge';
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
    Card,
    Badge,
    Button,
    FormField,
    Icon,
    DocumentEditor,
    DocumentAccessEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-8 pt-7 pb-12">
      <a
        routerLink="/review"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'review.backToFeed' | transloco }}
      </a>

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (proposal(); as prop) {
        <div class="mb-[18px] flex items-start justify-between gap-4">
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'review.reviewTitle' | transloco }}
          </h1>
          @if (!editable()) {
            <app-badge tone="neutral">{{ prop.status }}</app-badge>
          }
        </div>

        @if (!editable()) {
          <app-card>
            <p class="px-1 py-1 text-[13.5px] text-fg-muted">
              {{ 'review.notPending' | transloco }}
            </p>
          </app-card>
        }

        <form class="mt-4 flex flex-col gap-4" [formGroup]="form">
          <app-card>
            <div class="flex flex-col gap-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <app-form-field inputId="prop-type" [label]="'documents.fields.type' | transloco">
                  <input id="prop-type" type="text" formControlName="type" autocomplete="off" />
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
                class="px-4 pt-3.5 pb-1 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'documents.access.sectionTitle' | transloco }}
              </h2>
              <p class="px-4 pb-3 text-[12.5px] text-fg-subtle">
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

            <div class="flex items-center gap-2">
              <app-button
                *appHasPermission="'documents:approve'"
                type="button"
                [loading]="approving()"
                (click)="approve()"
              >
                <app-icon name="check" [size]="15" />
                {{ 'review.approveAndPublish' | transloco }}
              </app-button>
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
                variant="ghost"
                [disabled]="rejecting()"
                (click)="reject()"
              >
                {{ 'review.reject' | transloco }}
              </app-button>
              <a routerLink="/review">
                <app-button type="button" variant="ghost">
                  {{ 'documents.cancel' | transloco }}
                </app-button>
              </a>
            </div>
          }
        </form>
      } @else {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'review.notFound' | transloco }}
          </div>
        </app-card>
      }
    </div>
  `,
})
export class ProposalReview {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly proposal = signal<ProposalDetail | null>(null);
  protected readonly initialHtml = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly approving = signal(false);
  protected readonly rejecting = signal(false);

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
      }
    });
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

  protected reject(): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.rejecting.set(true);
    this.api.rejectProposal(orgId, this.id()).subscribe({
      next: () => {
        this.rejecting.set(false);
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
    this.api.getProposal(orgId, id).subscribe({
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
      error: () => {
        this.proposal.set(null);
        this.loading.set(false);
      },
    });
  }
}
