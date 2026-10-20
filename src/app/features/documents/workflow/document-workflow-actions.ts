import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DocumentDetail } from '../../../core/documents/document.models';
import { documentErrorKey, errorCodeOf } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';

/** Which workflow dialog is open. */
type Dialog = 'submit' | 'approve' | 'requestChanges' | 'obsolete';

/**
 * Document-control actions for the detail header:
 *  - Submit for review (draft → in_review), gated `documents:draft`;
 *  - Request changes (with a required comment) and Approve, gated
 *    `documents:approve`, while the document is in review;
 *  - Obsolete (with a required reason), gated `documents:approve`.
 *
 * Every action confirms in a dialog first. Successful transitions emit the
 * updated document via `changed`; a 409 `not_in_review` (someone else moved it
 * on) asks the host to reload. Errors show specific messages in place.
 */
@Component({
  selector: 'app-document-workflow-actions',
  imports: [TranslocoPipe, Button, Icon, ConfirmDialog, PromptDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2">
      @if (canSubmit()) {
        <app-button [loading]="busy() === 'submit'" (click)="dialog.set('submit')">
          <app-icon name="upload" [size]="15" />
          {{ 'documents.workflow.submit' | transloco }}
        </app-button>
      }
      @if (canReview()) {
        <app-button variant="secondary" (click)="dialog.set('requestChanges')">
          {{ 'documents.requestChanges' | transloco }}
        </app-button>
        <app-button [loading]="busy() === 'approve'" (click)="dialog.set('approve')">
          <app-icon name="check" [size]="15" />
          {{ 'documents.approve' | transloco }}
        </app-button>
      }
      @if (canObsolete()) {
        <app-button variant="ghost" (click)="dialog.set('obsolete')">
          {{ 'documents.workflow.obsolete' | transloco }}
        </app-button>
      }
    </div>

    <app-confirm-dialog
      [open]="dialog() === 'submit'"
      [title]="'documents.workflow.submitTitle' | transloco"
      [message]="'documents.workflow.submitBody' | transloco"
      [confirmLabel]="'documents.workflow.submit' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy() === 'submit'"
      (confirmed)="submit()"
      (cancelled)="dialog.set(null)"
    />

    <app-confirm-dialog
      [open]="dialog() === 'approve'"
      [title]="'documents.workflow.approveTitle' | transloco"
      [message]="'documents.workflow.approveBody' | transloco: { rev: reviewedRev() }"
      [confirmLabel]="'documents.approve' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy() === 'approve'"
      (confirmed)="approve()"
      (cancelled)="dialog.set(null)"
    />

    <app-prompt-dialog
      [open]="dialog() === 'requestChanges'"
      [title]="'documents.workflow.requestChangesTitle' | transloco"
      [message]="'documents.workflow.requestChangesBody' | transloco"
      [label]="'documents.workflow.commentLabel' | transloco"
      [placeholder]="'documents.workflow.commentPlaceholder' | transloco"
      [required]="true"
      [confirmLabel]="'documents.workflow.sendBack' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy() === 'requestChanges'"
      (confirmed)="requestChanges($event)"
      (cancelled)="dialog.set(null)"
    />

    <app-prompt-dialog
      [open]="dialog() === 'obsolete'"
      [title]="'documents.workflow.obsoleteTitle' | transloco"
      [message]="'documents.workflow.obsoleteBody' | transloco"
      [label]="'documents.workflow.reasonLabel' | transloco"
      [placeholder]="'documents.workflow.obsoletePlaceholder' | transloco"
      [required]="true"
      confirmVariant="danger"
      [confirmLabel]="'documents.workflow.obsolete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy() === 'obsolete'"
      (confirmed)="obsolete($event)"
      (cancelled)="dialog.set(null)"
    />
  `,
})
export class DocumentWorkflowActions {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly document = input.required<DocumentDetail>();

  /** The document after a successful transition. */
  readonly changed = output<DocumentDetail>();
  /** The document changed under us (e.g. no longer in review): re-fetch it. */
  readonly reloadRequested = output<void>();

  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly busy = signal<Dialog | null>(null);

  private readonly permissions = computed(
    () => this.selectedOrg.currentOrg()?.permissions ?? ([] as readonly string[]),
  );
  private readonly canDraft = computed(() => this.permissions().includes('documents:draft'));
  private readonly canApprove = computed(() => this.permissions().includes('documents:approve'));

  protected readonly canSubmit = computed(
    () => this.canDraft() && this.document().status === 'draft',
  );
  protected readonly canReview = computed(
    () => this.canApprove() && this.document().status === 'in_review',
  );
  protected readonly canObsolete = computed(
    () => this.canApprove() && this.document().status !== 'obsolete',
  );

  /** The revision under review (the draft when present). */
  protected readonly reviewedRev = computed(() => {
    const doc = this.document();
    return (doc.draft_revision ?? doc.current_revision)?.rev ?? '—';
  });

  protected submit(): void {
    this.run(
      'submit',
      (orgId, id) => this.api.submit(orgId, id),
      'documents.workflow.submittedToast',
    );
  }

  protected approve(): void {
    this.run('approve', (orgId, id) => this.api.approve(orgId, id), 'documents.approvedToast');
  }

  protected requestChanges(comment: string): void {
    this.run(
      'requestChanges',
      (orgId, id) => this.api.requestChanges(orgId, id, comment),
      'documents.workflow.changesRequestedToast',
    );
  }

  protected obsolete(reason: string): void {
    this.run(
      'obsolete',
      (orgId, id) => this.api.obsolete(orgId, id, reason),
      'documents.workflow.obsoletedToast',
    );
  }

  private run(
    action: Dialog,
    call: (orgId: string, id: string) => ReturnType<DocumentsApi['submit']>,
    successKey: string,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(action);
    call(orgId, this.document().id).subscribe({
      next: (document) => {
        this.busy.set(null);
        this.dialog.set(null);
        this.notifications.success(successKey);
        this.changed.emit(document);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.dialog.set(null);
        this.notifications.error(documentErrorKey(error, action));
        const code = errorCodeOf(error);
        if (code === 'not_in_review' || code === 'not_draft') {
          this.reloadRequested.emit();
        }
      },
    });
  }
}
