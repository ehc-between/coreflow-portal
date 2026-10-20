import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
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
import { documentErrorKey } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * "Read and understood" strip shown under a document's approved revision when the owner
 * requires acknowledgement. Readers confirm (via a dialog) that they have read
 * the current approved revision; once done it shows when they confirmed.
 * Renders nothing when acknowledgement isn't required or nothing is approved.
 */
@Component({
  selector: 'app-document-acknowledge',
  imports: [LocalDatePipe, TranslocoPipe, Button, ConfirmDialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (applies()) {
      @if (acknowledgedAt(); as at) {
        <div
          role="status"
          class="mt-4 flex items-center gap-2.5 rounded-tile border border-pass/30 bg-pass-soft px-4 py-3 text-[13.5px] text-pass"
        >
          <app-icon name="checkcircle" [size]="17" />
          <span>{{
            'documents.ack.done' | transloco: { rev: rev(), date: (at | localDate: 'medium') }
          }}</span>
        </div>
      } @else {
        <div
          class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-tile border border-accent-border bg-accent-soft px-4 py-3"
        >
          <div class="min-w-0">
            <div class="text-[13.5px] font-semibold text-fg">
              {{ 'documents.ack.promptTitle' | transloco }}
            </div>
            <div class="text-[12.5px] text-fg-muted">
              {{ 'documents.ack.promptBody' | transloco: { rev: rev() } }}
            </div>
          </div>
          <app-button [loading]="saving()" (click)="confirmOpen.set(true)">
            <app-icon name="check" [size]="15" />
            {{ 'documents.ack.button' | transloco }}
          </app-button>
        </div>
      }

      <app-confirm-dialog
        [open]="confirmOpen()"
        [title]="'documents.ack.confirmTitle' | transloco"
        [message]="'documents.ack.confirmBody' | transloco: { title: document().title, rev: rev() }"
        [confirmLabel]="'documents.ack.button' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        confirmVariant="primary"
        [busy]="saving()"
        (confirmed)="acknowledge()"
        (cancelled)="confirmOpen.set(false)"
      />
    }
  `,
})
export class DocumentAcknowledge {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly document = input.required<DocumentDetail>();

  readonly changed = output<DocumentDetail>();

  protected readonly confirmOpen = signal(false);
  protected readonly saving = signal(false);

  protected readonly applies = computed(() => {
    const doc = this.document();
    // Any live document with an approved revision: drafters and approvers may be
    // looking at it while a newer draft is in progress.
    return doc.status !== 'obsolete' && !!doc.current_revision && !!doc.acknowledgement?.required;
  });

  protected readonly acknowledgedAt = computed(
    () => this.document().acknowledgement?.acknowledged_at ?? null,
  );

  protected readonly rev = computed(() => this.document().current_revision?.rev ?? '');

  protected acknowledge(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.acknowledge(orgId, this.document().id).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.confirmOpen.set(false);
        this.notifications.success('documents.ack.savedToast');
        this.changed.emit(withAcknowledgement(this.document(), response));
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.confirmOpen.set(false);
        this.notifications.error(documentErrorKey(error, 'acknowledge'));
      },
    });
  }
}

/**
 * The document after acknowledging: the server's copy when it sent the full
 * document with a timestamp, else the current one marked acknowledged now.
 */
export function withAcknowledgement(
  current: DocumentDetail,
  response: DocumentDetail | null | undefined,
  now: Date = new Date(),
): DocumentDetail {
  if (response?.id && response.acknowledgement?.acknowledged_at) {
    return response;
  }
  return {
    ...current,
    acknowledgement: { required: true, acknowledged_at: now.toISOString() },
  };
}
