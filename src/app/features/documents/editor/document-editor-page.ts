import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { DocumentControlApi } from '../data/document-control-api';
import { DocumentType } from '../data/document-control.models';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { DocumentDetail as DocumentDetailModel } from '../../../core/documents/document.models';
import { documentErrorKey } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Card } from '../../../shared/ui/card/card';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { documentTypeName, statusLabelKey } from '../document-status';
import { DocumentEditor } from './document-editor';

/**
 * Editor route for a document (`/documents/:id/edit`, gated `documents:draft`
 * upstream). Loads the working draft (else the approved revision) into
 * {@link DocumentEditor}. Save asks for a change reason — required once an
 * approved revision exists — then saves a new draft revision and returns to the
 * read view. Navigates back to the detail view on org switch.
 */
@Component({
  selector: 'app-document-editor-page',
  imports: [
    StatusBadge,
    TranslocoPipe,
    DocumentEditor,
    DocumentsPageGuide,
    PageHeader,
    Card,
    ErrorState,
    LoadingState,
    PromptDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @if (loading()) {
        <app-loading-state [rows]="6" />
      } @else if (document(); as doc) {
        <app-page-header
          [title]="doc.title"
          [breadcrumbs]="[
            { labelKey: 'modules.names.documents', link: '/documents' },
            { label: doc.doc_code || doc.title, link: ['/documents', doc.id] },
            { labelKey: 'documents.page.editor.crumb' },
          ]"
          [backLink]="['/documents', doc.id]"
          backLabelKey="documents.editor.backToDocument"
        >
          <ng-container meta>
            <span class="font-mono">{{ doc.doc_code }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ typeName() }}</span>
            <span aria-hidden="true">·</span>
            <app-status-badge
              meaning="lifecycle"
              [value]="doc.status"
              [labelKey]="statusLabelKey(doc.status)"
            />
          </ng-container>
        </app-page-header>
        <app-documents-page-guide page="editor" />

        @if (doc.status === 'in_review') {
          <p
            role="status"
            class="mb-4 rounded-tile border border-warn/30 bg-warn-soft px-4 py-3 text-ui font-medium text-warn"
          >
            {{ 'documents.editor.inReviewWarning' | transloco }}
          </p>
        }

        <app-document-editor
          [content]="initialHtml()"
          [saving]="saving()"
          (save)="onSave($event)"
          (cancelEdit)="back()"
        />

        <app-prompt-dialog
          [open]="pendingHtml() !== null"
          [title]="'documents.workflow.changeReasonTitle' | transloco"
          [message]="
            (reasonRequired()
              ? 'documents.workflow.changeReasonBodyRequired'
              : 'documents.workflow.changeReasonBodyOptional'
            ) | transloco
          "
          [label]="'documents.workflow.changeReasonLabel' | transloco"
          [placeholder]="'documents.workflow.changeReasonPlaceholder' | transloco"
          [required]="reasonRequired()"
          [confirmLabel]="'documents.editor.save' | transloco"
          [cancelLabel]="'common.cancel' | transloco"
          [busy]="saving()"
          (confirmed)="saveWithReason($event)"
          (cancelled)="pendingHtml.set(null)"
        />
      } @else if (notFound()) {
        <app-card>
          <div class="px-2 py-10 text-center text-body text-fg-muted">
            {{ 'documents.notFound' | transloco }}
          </div>
        </app-card>
      } @else {
        <app-error-state (retry)="reload()" />
      }
    </div>
  `,
})
export class DocumentEditorPage {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly controlApi = inject(DocumentControlApi);
  private readonly language = inject(LanguageService);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly statusLabelKey = statusLabelKey;

  protected readonly document = signal<DocumentDetailModel | null>(null);
  protected readonly initialHtml = signal('');
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  private readonly types = signal<readonly DocumentType[]>([]);
  protected readonly typeName = computed(() => {
    const doc = this.document();
    return doc ? documentTypeName(doc, this.types()) : '';
  });
  protected readonly saving = signal(false);
  /** Edited HTML waiting on the change-reason dialog; null when it's closed. */
  protected readonly pendingHtml = signal<string | null>(null);

  /** A change reason is mandatory once the document has an approved revision. */
  protected readonly reasonRequired = computed(() => !!this.document()?.current_revision);

  private currentOrgId: string | null = null;

  constructor() {
    // The assistant knows which document is being edited.
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document',
      entityId: this.id(),
      view: 'edit',
      title: this.document()?.title ?? this.language.translate('documents.edit'),
    }));
    effect(() => {
      const orgId = this.orgId();
      const id = this.id();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigate(['/documents', id]);
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

  /** Editor Save: collect the change reason before saving. */
  protected onSave(html: string): void {
    if (!this.saving()) {
      this.pendingHtml.set(html);
    }
  }

  protected saveWithReason(reason: string): void {
    const orgId = this.orgId();
    const html = this.pendingHtml();
    if (!orgId || html === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.addRevision(orgId, this.id(), html, reason).subscribe({
      next: () => {
        this.saving.set(false);
        this.pendingHtml.set(null);
        this.notifications.success('documents.editor.savedToast');
        void this.router.navigate(['/documents', this.id()]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(documentErrorKey(error, 'saveRevision'));
      },
    });
  }

  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.load(orgId, this.id());
    }
  }

  protected back(): void {
    void this.router.navigate(['/documents', this.id()]);
  }

  private load(orgId: string, id: string): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.api.get(orgId, id).subscribe({
      next: (document) => {
        this.document.set(document);
        // Continue the working draft when there is one; else start from approved.
        this.initialHtml.set((document.draft_revision ?? document.current_revision)?.content ?? '');
        this.loading.set(false);
      },
      error: (error: { status?: number }) => {
        this.document.set(null);
        this.loading.set(false);
        this.notFound.set(error.status === 404 || error.status === 403);
      },
    });
  }
}
