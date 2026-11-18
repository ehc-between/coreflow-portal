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
import { AuthService } from '../../../core/auth/auth.service';
import { DocumentApprovers, DocumentDetail } from '../../../core/documents/document.models';
import { documentErrorKey, errorCodeOf } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';

/** Which workflow dialog is open. */
export type WorkflowDialog = 'submit' | 'approve' | 'requestChanges' | 'obsolete';

let nextId = 0;

/**
 * Document-control actions on the detail page (the header's primary slot):
 *  - "Send til godkjenning" (draft → in_review, `documents:draft`): the author
 *    may name the approver; only that person is notified (any approver may still
 *    decide). Under segregation of duties the author is not offered.
 *  - "Godkjenn" with an approval note, and "Be om endringer" with a comment
 *    (`documents:approve`, while in review). When the caller wrote the revision
 *    and the organisation requires segregation of duties, approval is replaced by
 *    a short explanation: someone else must approve it.
 *  - "Gjør utgått" with a reason (`documents:approve`, approved documents only),
 *    opened from the page's "Mer" menu through {@link open}.
 *
 * Successful transitions emit the updated document via `changed`; a 409
 * `not_in_review` / `not_draft` asks the host to reload.
 */
@Component({
  selector: 'app-document-workflow-actions',
  imports: [TranslocoPipe, Button, Icon, ConfirmDialog, PromptDialog, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-center gap-2 empty:hidden' },
  template: `
    @if (canSubmit()) {
      <app-button [loading]="busy() === 'submit'" (click)="open('submit')" data-testid="submit">
        <app-icon name="send" [size]="15" />
        {{ 'documents.workflow.submit' | transloco }}
      </app-button>
    }
    @if (canReview()) {
      <app-button
        variant="secondary"
        (click)="open('requestChanges')"
        data-testid="request-changes"
      >
        {{ 'documents.requestChanges' | transloco }}
      </app-button>
      @if (selfApprovalBlocked()) {
        <span
          class="inline-flex max-w-[36ch] items-center gap-1.5 text-meta text-fg-muted"
          data-testid="self-approval-note"
        >
          <app-icon name="lock" [size]="14" class="flex-none" />
          {{ 'documents.approval.selfBlocked' | transloco }}
        </span>
      } @else {
        <app-button
          [loading]="busy() === 'approve'"
          (click)="open('approve')"
          data-testid="approve"
        >
          <app-icon name="check" [size]="15" />
          {{ 'documents.approve' | transloco }}
        </app-button>
      }
    }

    <app-confirm-dialog
      [open]="dialog() === 'submit'"
      [title]="'documents.workflow.submitTitle' | transloco"
      [message]="
        (approverId() ? 'documents.approval.submitNamed' : 'documents.workflow.submitBody')
          | transloco
      "
      [confirmLabel]="'documents.workflow.submit' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy() === 'submit'"
      [initialFocus]="'#' + ids.approver"
      (confirmed)="submit()"
      (cancelled)="close()"
    >
      <div class="mt-3 flex flex-col gap-2">
        <app-form-field
          [inputId]="ids.approver"
          [label]="'documents.approval.approver' | transloco"
        >
          <select
            [id]="ids.approver"
            [value]="approverId()"
            (change)="approverId.set($any($event.target).value)"
            [disabled]="approversLoading()"
            data-testid="approver-select"
          >
            <option value="">{{ 'documents.approval.anyApprover' | transloco }}</option>
            @for (person of approvers()?.approvers ?? []; track person.user_id) {
              <option [value]="person.user_id" [selected]="person.user_id === approverId()">
                {{ person.name }} ({{ person.email }})
              </option>
            }
          </select>
        </app-form-field>
        @if (approvers()?.segregation_required) {
          <p class="text-meta text-fg-subtle" data-testid="segregation-note">
            {{ 'documents.approval.segregationNote' | transloco }}
          </p>
        }
        @if (approversEmpty()) {
          <p class="text-meta font-semibold text-warn-ink" data-testid="no-approvers">
            {{ 'documents.approval.noApprovers' | transloco }}
          </p>
        }
      </div>
    </app-confirm-dialog>

    <app-prompt-dialog
      [open]="dialog() === 'approve'"
      [title]="'documents.workflow.approveTitle' | transloco"
      [message]="'documents.approval.approveBody' | transloco: { rev: reviewedRev() }"
      [label]="'documents.approval.noteLabel' | transloco"
      [placeholder]="'documents.approval.notePlaceholder' | transloco"
      [required]="true"
      [maxLength]="2000"
      [confirmLabel]="'documents.approve' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy() === 'approve'"
      (confirmed)="approve($event)"
      (cancelled)="close()"
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
      (cancelled)="close()"
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
      (cancelled)="close()"
    />
  `,
})
export class DocumentWorkflowActions {
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly document = input.required<DocumentDetail>();

  /** The document after a successful transition. */
  readonly changed = output<DocumentDetail>();
  /** The document changed under us (e.g. no longer in review): re-fetch it. */
  readonly reloadRequested = output<void>();

  protected readonly ids = { approver: `doc-approver-${++nextId}` };
  protected readonly dialog = signal<WorkflowDialog | null>(null);
  protected readonly busy = signal<WorkflowDialog | null>(null);

  /** People who may approve (loaded when the submit dialog opens). */
  protected readonly approvers = signal<DocumentApprovers | null>(null);
  protected readonly approversLoading = signal(false);
  protected readonly approverId = signal('');
  protected readonly approversEmpty = computed(() => {
    const list = this.approvers();
    return !!list && list.approvers.length === 0;
  });

  private readonly permissions = computed(
    () => this.selectedOrg.currentOrg()?.permissions ?? ([] as readonly string[]),
  );
  private readonly canDraft = computed(() => this.permissions().includes('documents:draft'));
  private readonly canApprove = computed(() => this.permissions().includes('documents:approve'));

  readonly canSubmit = computed(() => this.canDraft() && this.document().status === 'draft');
  readonly canReview = computed(() => this.canApprove() && this.document().status === 'in_review');
  /** Only an approved document can be retired; a draft is deleted instead. */
  readonly canObsolete = computed(() => this.canApprove() && this.document().status === 'approved');

  /** The revision under review (the draft when present). */
  private readonly reviewed = computed(() => {
    const doc = this.document();
    return doc.draft_revision ?? doc.current_revision ?? null;
  });
  protected readonly reviewedRev = computed(() => this.reviewed()?.rev ?? '—');

  /** The caller wrote the revision and authors may not approve their own work. */
  readonly selfApprovalBlocked = computed(() => {
    const me = this.auth.user()?.id;
    const rev = this.reviewed();
    return (
      this.document().segregation_required !== false &&
      !!me &&
      !!rev &&
      (rev.author_user_id === me || rev.submitted_by_user_id === me)
    );
  });

  /** Open a workflow dialog (the page's "Mer" menu opens "obsolete" this way). */
  open(dialog: WorkflowDialog): void {
    this.dialog.set(dialog);
    if (dialog === 'submit') {
      this.loadApprovers();
    }
  }

  protected close(): void {
    this.dialog.set(null);
  }

  protected submit(): void {
    const approver = this.approverId() || null;
    this.run(
      'submit',
      (orgId, id) => this.api.submit(orgId, id, approver),
      'documents.workflow.submittedToast',
    );
  }

  protected approve(note: string): void {
    this.run(
      'approve',
      (orgId, id) => this.api.approve(orgId, id, note),
      'documents.approvedToast',
    );
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

  private loadApprovers(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.approversLoading()) {
      return;
    }
    this.approversLoading.set(true);
    this.api.listApprovers(orgId, this.document().id).subscribe({
      next: (list) => {
        this.approvers.set(list);
        this.approversLoading.set(false);
        if (!list.approvers.some((a) => a.user_id === this.approverId())) {
          this.approverId.set('');
        }
      },
      // Older servers have no approver list: submitting still notifies every approver.
      error: () => {
        this.approvers.set(null);
        this.approversLoading.set(false);
      },
    });
  }

  private run(
    action: WorkflowDialog,
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
