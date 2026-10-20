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
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';

/** Codes after which our copy of the document is stale: ask the host to re-fetch. */
const STALE_CODES = new Set(['has_approved_revision', 'reason_required']);

/**
 * "Delete document" card for the detail sidebar. The backend decides who may
 * delete what: the action shows only when the document reports `can_delete`.
 * Deleting confirms in a dialog — or asks for a required reason when
 * `delete_requires_reason` (an obsolete document). Approved documents that are
 * not obsolete can't be deleted; managers (`canManage`) see a hint to make the
 * document obsolete first instead. Emits `deleted` after a 204, and
 * `reloadRequested` when an error shows our copy is out of date.
 */
@Component({
  selector: 'app-document-delete-action',
  imports: [TranslocoPipe, Button, Card, Icon, ConfirmDialog, PromptDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canDelete() || blocked()) {
      <app-card>
        <h2 class="font-display text-[15px] font-bold tracking-[-0.02em] text-fg">
          {{ 'documents.delete.title' | transloco }}
        </h2>
        @if (canDelete()) {
          <p class="mt-1 mb-3 text-[13px] leading-snug text-fg-muted">
            {{
              (requiresReason() ? 'documents.delete.hintObsolete' : 'documents.delete.hint')
                | transloco
            }}
          </p>
          <app-button variant="danger" [loading]="busy()" (click)="open.set(true)">
            <app-icon name="trash" [size]="15" />
            {{ 'documents.delete.action' | transloco }}
          </app-button>
        } @else {
          <p data-testid="delete-blocked" class="mt-1 text-[13px] leading-snug text-fg-muted">
            {{ 'documents.delete.blockedHint' | transloco }}
          </p>
        }
      </app-card>
    }

    <app-confirm-dialog
      [open]="open() && !requiresReason()"
      [title]="'documents.delete.confirmTitle' | transloco: { code: document().doc_code }"
      [message]="'documents.delete.confirmBody' | transloco"
      [confirmLabel]="'documents.delete.action' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="danger"
      [busy]="busy()"
      (confirmed)="remove(null)"
      (cancelled)="open.set(false)"
    />

    <app-prompt-dialog
      [open]="open() && requiresReason()"
      [title]="'documents.delete.confirmTitle' | transloco: { code: document().doc_code }"
      [message]="'documents.delete.reasonBody' | transloco"
      [label]="'documents.delete.reasonLabel' | transloco"
      [placeholder]="'documents.delete.reasonPlaceholder' | transloco"
      [required]="true"
      confirmVariant="danger"
      [confirmLabel]="'documents.delete.action' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove($event)"
      (cancelled)="open.set(false)"
    />
  `,
})
export class DocumentDeleteAction {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly document = input.required<DocumentDetail>();
  /** Owner / approver: may see why an approved document can't be deleted. */
  readonly canManage = input(false);

  /** The document was deleted. */
  readonly deleted = output<void>();
  /** The document changed under us: re-fetch it. */
  readonly reloadRequested = output<void>();

  protected readonly open = signal(false);
  protected readonly busy = signal(false);

  protected readonly canDelete = computed(() => this.document().can_delete === true);
  protected readonly requiresReason = computed(
    () => this.document().delete_requires_reason === true,
  );
  /** An approved, still-current document: it has to be made obsolete first. */
  protected readonly blocked = computed(() => {
    const doc = this.document();
    return (
      this.canManage() && !this.canDelete() && doc.status !== 'obsolete' && !!doc.current_revision
    );
  });

  protected remove(reason: string | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, this.document().id, reason).subscribe({
      next: () => {
        this.busy.set(false);
        this.open.set(false);
        this.notifications.success('documents.delete.deletedToast');
        this.deleted.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.open.set(false);
        this.notifications.error(documentErrorKey(error, 'delete'));
        const code = errorCodeOf(error);
        if (code && STALE_CODES.has(code)) {
          this.reloadRequested.emit();
        }
      },
    });
  }
}
