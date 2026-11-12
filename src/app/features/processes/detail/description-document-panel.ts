import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { processErrorKey } from '../data/process-errors';
import { ProcessReferences } from '../data/process-references';
import { ProcessDetail } from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';

/**
 * The process description document: a controlled document (document control's
 * review, approval and revisions) that describes the process. Shows the linked
 * document and its status, or offers to create a pre-filled draft (needs
 * `documents:draft` too) or attach an existing document; it can be detached.
 * Emits the updated process after every change.
 */
@Component({
  selector: 'app-description-document-panel',
  imports: [RouterLink, TranslocoPipe, FieldHelp, Badge, Button, Card, ConfirmDialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = process();
    <app-card>
      <h2 class="mb-1 text-[15px] font-bold text-fg">
        {{ 'processes.document.title' | transloco }}
      </h2>
      <app-field-help scope="processes" page="detail" field="descriptionDocument" />
      @if (p.description_document; as doc) {
        <div
          class="mt-3 flex flex-wrap items-center justify-between gap-2"
          data-testid="doc-linked"
        >
          @if (doc.accessible) {
            <a
              [routerLink]="doc.url ?? ['/documents', doc.id]"
              class="min-w-0 flex-1 text-[13.5px] font-semibold text-accent hover:underline"
            >
              <span class="font-mono text-[12px] text-fg-subtle">{{ doc.doc_code }}</span>
              {{ doc.title }}
            </a>
            @if (doc.status) {
              <app-badge [tone]="doc.status === 'approved' ? 'pass' : 'info'">{{
                'processes.document.status.' + doc.status | transloco
              }}</app-badge>
            }
          } @else {
            <span class="text-[13px] text-fg-muted">
              {{ 'processes.document.restricted' | transloco }}
            </span>
          }
        </div>
        @if (doc.accessible && doc.status !== 'approved') {
          <p class="mt-2 text-[12.5px] text-fg-muted">
            {{ 'processes.document.notApproved' | transloco }}
          </p>
        }
        @if (p.can_edit) {
          <div class="mt-3">
            <app-button variant="ghost" size="sm" (click)="confirmDetach.set(true)">
              <app-icon name="x" [size]="14" />
              {{ 'processes.document.detach' | transloco }}
            </app-button>
          </div>
        }
      } @else {
        <p class="mt-2 text-[13px] text-fg-muted">{{ 'processes.document.none' | transloco }}</p>
        @if (p.can_edit) {
          <div class="mt-3 flex flex-col gap-3">
            @if (canDraft()) {
              <div>
                <app-button
                  size="sm"
                  [loading]="busy()"
                  [disabled]="busy()"
                  (click)="create()"
                  data-testid="doc-create"
                >
                  <app-icon name="documents" [size]="14" />
                  {{ 'processes.document.create' | transloco }}
                </app-button>
                <p class="mt-1 text-[12px] text-fg-subtle">
                  {{ 'processes.document.createHint' | transloco }}
                </p>
              </div>
            }
            @if (references.canReadDocuments()) {
              <div class="flex flex-wrap items-end gap-2">
                <label
                  class="flex min-w-[200px] flex-1 flex-col gap-1 text-[12.5px] font-semibold text-fg-muted"
                >
                  {{ 'processes.document.attachLabel' | transloco }}
                  <select
                    class="h-9 rounded-[9px] border border-border bg-bg px-2 text-[13px] font-normal text-fg"
                    [value]="selected()"
                    (change)="selected.set($any($event.target).value)"
                    data-testid="doc-select"
                  >
                    <option value="">{{ 'processes.document.choose' | transloco }}</option>
                    @for (d of references.documents(); track d.id) {
                      <option [value]="d.id">{{ d.doc_code }} · {{ d.title }}</option>
                    }
                  </select>
                </label>
                <app-button
                  variant="secondary"
                  size="sm"
                  [disabled]="!selected() || busy()"
                  (click)="attach()"
                  data-testid="doc-attach"
                >
                  {{ 'processes.document.attach' | transloco }}
                </app-button>
              </div>
            }
          </div>
        }
      }
    </app-card>

    <app-confirm-dialog
      [open]="confirmDetach()"
      [title]="'processes.document.detachTitle' | transloco"
      [message]="'processes.document.detachMessage' | transloco"
      [confirmLabel]="'processes.document.detach' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="detach()"
      (cancelled)="confirmDetach.set(false)"
    />
  `,
})
export class DescriptionDocumentPanel {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly references = inject(ProcessReferences);

  readonly process = input.required<ProcessDetail>();
  readonly changed = output<ProcessDetail>();

  protected readonly busy = signal(false);
  protected readonly selected = signal('');
  protected readonly confirmDetach = signal(false);

  protected readonly canDraft = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('documents:draft') ?? false,
  );

  constructor() {
    this.references.ensureDocuments();
  }

  protected create(): void {
    this.run(
      (orgId, id) => this.api.createDescriptionDocument(orgId, id),
      'processes.notices.documentCreated',
    );
  }

  protected attach(): void {
    const documentId = this.selected();
    if (!documentId) {
      return;
    }
    this.run(
      (orgId, id) => this.api.attachDescriptionDocument(orgId, id, documentId),
      'processes.notices.documentAttached',
    );
  }

  protected detach(): void {
    this.run(
      (orgId, id) => this.api.detachDescriptionDocument(orgId, id),
      'processes.notices.documentDetached',
    );
  }

  private run(
    call: (orgId: string, id: string) => ReturnType<ProcessesApi['get']>,
    notice: string,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    call(orgId, this.process().id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.confirmDetach.set(false);
        this.selected.set('');
        this.notifications.success(notice);
        this.changed.emit(updated);
      },
      error: (error) => {
        this.busy.set(false);
        this.confirmDetach.set(false);
        this.notifications.error(processErrorKey(error));
      },
    });
  }
}
