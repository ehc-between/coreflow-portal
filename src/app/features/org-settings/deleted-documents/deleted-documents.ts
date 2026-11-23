import { HttpContext } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { DeletedDocument } from '../../../core/documents/document.models';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';

/** `POST v1/orgs/{org}/documents/{id}/restore` (org:manage): 204; 404 when not deleted. */
@Injectable({ providedIn: 'root' })
export class DocumentRestoreApi {
  private readonly api = inject(ApiService);

  restore(orgId: string, documentId: string): Observable<void> {
    return this.api.post<void>(`v1/orgs/${orgId}/documents/${documentId}/restore`, null, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }
}

/**
 * Settings → Deleted documents (`org:manage`, enforced by the route guard and
 * the API): soft-deleted documents in the selected org, newest first, with
 * code, title, when, by whom and the recorded reason. An admin can restore a
 * document after confirming; it returns to the register with its history.
 */
@Component({
  selector: 'app-deleted-documents',
  imports: [
    LocalDatePipe,
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    ErrorState,
    LoadingState,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="settings.deletedDocuments.title"
        descriptionKey="settings.deletedDocuments.subtitle"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'settings.deletedDocuments.title' },
        ]"
      />

      <app-card [padded]="false">
        @if (loading()) {
          <app-loading-state [rows]="4" />
        } @else if (failed()) {
          <app-error-state bodyKey="settings.deletedDocuments.loadError" (retry)="reload()" />
        } @else if (items().length === 0) {
          <div data-testid="deleted-empty">
            <app-empty-state
              icon="trash"
              titleKey="settings.deletedDocuments.empty"
              bodyKey="settings.deletedDocuments.emptyBody"
              ctaKey="settings.deletedDocuments.openDocuments"
              ctaLink="/documents"
              ctaVariant="secondary"
              [compact]="true"
            />
          </div>
        } @else {
          <ul>
            @for (item of items(); track item.id) {
              <li
                data-testid="deleted-row"
                class="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-start"
              >
                <div class="min-w-0">
                  @if (item.doc_code) {
                    <div class="font-mono text-meta text-fg-subtle">{{ item.doc_code }}</div>
                  }
                  <div class="font-semibold text-fg">{{ item.title }}</div>
                </div>
                <div class="text-meta text-fg-muted">
                  {{ item.deleted_at | localDate }}
                  <div class="text-fg">
                    {{
                      item.deleted_by_name ?? ('settings.deletedDocuments.unknownUser' | transloco)
                    }}
                  </div>
                </div>
                <div class="text-ui whitespace-pre-line text-fg-muted">
                  {{ item.deleted_reason ?? ('settings.deletedDocuments.noReason' | transloco) }}
                </div>
                <div class="md:text-right">
                  <app-button
                    variant="secondary"
                    size="sm"
                    data-testid="deleted-restore"
                    [attr.aria-label]="
                      'settings.deletedDocuments.restoreLabel' | transloco: { title: item.title }
                    "
                    (click)="pending.set(item)"
                  >
                    {{ 'settings.deletedDocuments.restore' | transloco }}
                  </app-button>
                </div>
              </li>
            }
          </ul>
        }
      </app-card>
      <p class="mt-3 text-meta text-fg-subtle">
        {{ 'settings.deletedDocuments.restoreNote' | transloco }}
        <a
          routerLink="/settings/audit-log"
          [queryParams]="{ entity_type: 'document' }"
          class="font-semibold text-accent hover:underline"
          >{{ 'settings.deletedDocuments.auditLink' | transloco }}</a
        >
      </p>
    </div>

    <app-confirm-dialog
      [open]="pending() !== null"
      [busy]="restoring()"
      confirmVariant="primary"
      [title]="'settings.deletedDocuments.restoreTitle' | transloco"
      [message]="
        'settings.deletedDocuments.restoreConfirm' | transloco: { title: pending()?.title ?? '' }
      "
      [confirmLabel]="'settings.deletedDocuments.restore' | transloco"
      [cancelLabel]="'settings.cancel' | transloco"
      (confirmed)="restore()"
      (cancelled)="pending.set(null)"
    />
  `,
})
export class DeletedDocuments {
  private readonly api = inject(DocumentsApi);
  private readonly restoreApi = inject(DocumentRestoreApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly items = signal<readonly DeletedDocument[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly pending = signal<DeletedDocument | null>(null);
  protected readonly restoring = signal(false);

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document',
      view: 'list',
      title: this.language.translate('settings.deletedDocuments.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.items.set([]);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) this.load(orgId);
  }

  protected restore(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const item = this.pending();
    if (!orgId || !item || this.restoring()) return;
    this.restoring.set(true);
    this.restoreApi.restore(orgId, item.id).subscribe({
      next: () => {
        this.restoring.set(false);
        this.pending.set(null);
        this.items.update((list) => list.filter((d) => d.id !== item.id));
        this.notifications.success('settings.deletedDocuments.restoredToast', {
          title: item.title,
        });
      },
      error: () => {
        this.restoring.set(false);
        this.pending.set(null);
        this.notifications.error('settings.deletedDocuments.restoreFailed');
        this.load(orgId);
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.listDeleted(orgId).subscribe({
      next: (items) => {
        // Ignore a late response for an org the user has switched away from.
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }
}
