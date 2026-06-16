import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DocumentDetail as DocumentDetailModel } from '../../../core/documents/document.models';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { statusLabelKey, statusTone } from '../document-status';
import { DocumentEditor } from './document-editor';

/**
 * Editor route for a document (`/documents/:id/edit`, gated `documents:draft`
 * upstream). Loads the current revision HTML into {@link DocumentEditor}, saves
 * a new revision on Save, then returns to the read view. Navigates back to the
 * detail view on org switch.
 */
@Component({
  selector: 'app-document-editor-page',
  imports: [TranslocoPipe, DocumentEditor, Card, Badge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-8 pt-7 pb-12">
      <button
        type="button"
        (click)="back()"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'documents.editor.backToDocument' | transloco }}
      </button>

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (document(); as doc) {
        <div class="mb-4 flex items-center gap-2">
          <span class="font-mono text-[12.5px] text-fg-subtle">{{ doc.doc_code }}</span>
          <app-badge tone="neutral">{{ doc.type }}</app-badge>
          <app-badge [tone]="statusTone(doc.status)">{{
            statusLabelKey(doc.status) | transloco
          }}</app-badge>
          <h1 class="font-display text-[20px] font-bold tracking-[-0.02em] text-fg">
            {{ doc.title }}
          </h1>
        </div>

        <app-document-editor
          [content]="initialHtml()"
          [saving]="saving()"
          (save)="onSave($event)"
          (cancelEdit)="back()"
        />
      } @else {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'documents.notFound' | transloco }}
          </div>
        </app-card>
      }
    </div>
  `,
})
export class DocumentEditorPage {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly statusTone = statusTone;
  protected readonly statusLabelKey = statusLabelKey;

  protected readonly document = signal<DocumentDetailModel | null>(null);
  protected readonly initialHtml = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  private currentOrgId: string | null = null;

  constructor() {
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
      }
    });
  }

  protected onSave(html: string): void {
    const orgId = this.orgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.addRevision(orgId, this.id(), html).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.success('documents.editor.savedToast');
        void this.router.navigate(['/documents', this.id()]);
      },
      error: () => this.saving.set(false),
    });
  }

  protected back(): void {
    void this.router.navigate(['/documents', this.id()]);
  }

  private load(orgId: string, id: string): void {
    this.loading.set(true);
    this.api.get(orgId, id).subscribe({
      next: (document) => {
        this.document.set(document);
        this.initialHtml.set(document.current_revision?.content ?? '');
        this.loading.set(false);
      },
      error: () => {
        this.document.set(null);
        this.loading.set(false);
      },
    });
  }
}
