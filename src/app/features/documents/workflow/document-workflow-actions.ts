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
import {
  ApproveOptions,
  DocumentApprovers,
  DocumentDetail,
} from '../../../core/documents/document.models';
import { documentErrorKey, errorCodeOf } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { AudienceEditor } from '../campaigns/audience-editor';
import { AudienceEntry } from '../data/document-control.models';

/** Which workflow dialog is open. */
export type WorkflowDialog = 'submit' | 'approve' | 'requestChanges' | 'obsolete';
/** U27 "Hvem må lese og bekrefte?": nobody, everyone who can read it, or chosen people. */
export const READER_MODES = ['none', 'all', 'custom'] as const;
export type ReaderMode = (typeof READER_MODES)[number];
/** U27 "Når gjennomgås den på nytt?": the default and the offered intervals (months). */
export const DEFAULT_REVIEW_MONTHS = 12;
export const REVIEW_CHOICES: readonly number[] = [6, 12, 24, 36];

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
  imports: [
    TranslocoPipe,
    Button,
    DateInput,
    Icon,
    ConfirmDialog,
    PromptDialog,
    FormField,
    AudienceEditor,
  ],
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

    <app-confirm-dialog
      [open]="dialog() === 'approve'"
      [title]="'documents.workflow.approveTitle' | transloco"
      [message]="'documents.approval.approveBody' | transloco: { rev: reviewedRev() }"
      [confirmLabel]="'documents.approve' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy() === 'approve'"
      [confirmDisabled]="!approveValid()"
      [initialFocus]="'#' + ids.note"
      (confirmed)="approve(approveNote())"
      (cancelled)="close()"
    >
      <div class="mt-3 flex flex-col gap-3">
        <app-form-field
          [inputId]="ids.note"
          [label]="'documents.approval.noteLabel' | transloco"
          [required]="true"
        >
          <textarea
            [id]="ids.note"
            rows="2"
            maxlength="2000"
            aria-required="true"
            [value]="approveNote()"
            [placeholder]="'documents.approval.notePlaceholder' | transloco"
            (input)="approveNote.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field
          [inputId]="ids.readers"
          [label]="'documents.readConfirm.publish.who' | transloco"
        >
          <select
            [id]="ids.readers"
            (change)="readersMode.set($any($event.target).value)"
            data-testid="approve-readers"
          >
            @for (mode of readerModes; track mode) {
              <option [value]="mode" [selected]="mode === readersMode()">
                {{ 'documents.readConfirm.publish.modes.' + mode | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        @if (readersMode() === 'custom') {
          <app-audience-editor
            [value]="customAudience()"
            (valueChange)="customAudience.set($event)"
          />
        }
        @if (readersMode() !== 'none') {
          <app-form-field
            [inputId]="ids.readBy"
            [label]="'documents.readConfirm.publish.readBy' | transloco"
          >
            <app-date-input
              [inputId]="ids.readBy"
              [value]="readBy()"
              (valueChange)="readBy.set($event ?? '')"
              data-testid="approve-read-by"
            />
          </app-form-field>
        }
        <app-form-field
          [inputId]="ids.review"
          [label]="'documents.readConfirm.publish.review' | transloco"
        >
          <select
            [id]="ids.review"
            (change)="reviewMonths.set(+$any($event.target).value)"
            data-testid="approve-review"
          >
            @for (months of reviewChoices(); track months) {
              <option [value]="months" [selected]="months === reviewMonths()">
                {{ 'documents.readConfirm.publish.months' | transloco: { count: months } }}
              </option>
            }
          </select>
        </app-form-field>
      </div>
    </app-confirm-dialog>

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

  protected readonly ids = {
    approver: `doc-approver-${++nextId}`,
    note: `doc-approve-note-${nextId}`,
    readers: `doc-approve-readers-${nextId}`,
    readBy: `doc-approve-read-by-${nextId}`,
    review: `doc-approve-review-${nextId}`,
  };

  // U27: the publishing questions ("who must read and confirm", "when is it reviewed").
  protected readonly readerModes = READER_MODES;
  protected readonly approveNote = signal('');
  protected readonly readersMode = signal<ReaderMode>('none');
  protected readonly customAudience = signal<readonly AudienceEntry[]>([]);
  protected readonly readBy = signal('');
  protected readonly reviewMonths = signal(DEFAULT_REVIEW_MONTHS);
  protected readonly reviewChoices = computed(() => {
    const current = this.reviewMonths();
    return REVIEW_CHOICES.includes(current)
      ? REVIEW_CHOICES
      : [...REVIEW_CHOICES, current].sort((a, b) => a - b);
  });
  protected readonly approveValid = computed(
    () =>
      !!this.approveNote().trim() &&
      (this.readersMode() !== 'custom' || this.customAudience().length > 0),
  );
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
    if (dialog === 'approve') {
      const doc = this.document();
      this.approveNote.set('');
      this.readersMode.set(doc.acknowledgement?.required ? 'all' : 'none');
      this.customAudience.set([]);
      this.readBy.set('');
      this.reviewMonths.set(doc.review_interval_months || DEFAULT_REVIEW_MONTHS);
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
    if (!this.approveValid()) {
      return;
    }
    const mode = this.readersMode();
    const readers: readonly AudienceEntry[] =
      mode === 'all' ? [{ type: 'all' }] : mode === 'custom' ? this.customAudience() : [];
    const options: ApproveOptions = {
      readers,
      readBy: this.readBy() || null,
      reviewIntervalMonths: this.reviewMonths(),
    };
    this.run(
      'approve',
      (orgId, id) => this.api.approve(orgId, id, note, options),
      readers.length ? 'documents.readConfirm.publish.toast' : 'documents.approvedToast',
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
