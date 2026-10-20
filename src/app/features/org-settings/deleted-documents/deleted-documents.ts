import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DeletedDocument } from '../../../core/documents/document.models';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * Settings → Deleted documents (`org:manage`, enforced by the route guard and
 * the API). A read-only log of soft-deleted documents in the selected org,
 * newest first: code, title, when, by whom and the recorded reason. Reloads on
 * org switch.
 */
@Component({
  selector: 'app-deleted-documents',
  imports: [DatePipe, RouterLink, TranslocoPipe, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-8 pt-7 pb-12">
      <a
        routerLink="/settings"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'settings.deletedDocuments.back' | transloco }}
      </a>

      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'settings.deletedDocuments.title' | transloco }}
        </h1>
        <div class="mt-1.5 text-[14px] text-fg-muted">
          {{ 'settings.deletedDocuments.subtitle' | transloco }}
        </div>
      </div>

      <app-card [padded]="false">
        @if (loading()) {
          <div class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        } @else if (failed()) {
          <div role="alert" class="px-4 py-10 text-center text-[14px] text-fail">
            {{ 'settings.deletedDocuments.loadError' | transloco }}
          </div>
        } @else if (items().length === 0) {
          <div data-testid="deleted-empty" class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'settings.deletedDocuments.empty' | transloco }}
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-[13.5px]">
              <thead>
                <tr
                  class="border-b border-border text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
                >
                  <th class="px-4 py-2.5">
                    {{ 'settings.deletedDocuments.document' | transloco }}
                  </th>
                  <th class="px-4 py-2.5">
                    {{ 'settings.deletedDocuments.deletedAt' | transloco }}
                  </th>
                  <th class="px-4 py-2.5">
                    {{ 'settings.deletedDocuments.deletedBy' | transloco }}
                  </th>
                  <th class="px-4 py-2.5">{{ 'settings.deletedDocuments.reason' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (item of items(); track item.id) {
                  <tr data-testid="deleted-row" class="border-b border-border last:border-b-0">
                    <td class="px-4 py-3 align-top">
                      @if (item.doc_code) {
                        <div class="font-mono text-[12px] text-fg-subtle">{{ item.doc_code }}</div>
                      }
                      <div class="font-semibold text-fg">{{ item.title }}</div>
                    </td>
                    <td class="px-4 py-3 align-top whitespace-nowrap text-fg-muted">
                      {{ item.deleted_at | date: 'medium' }}
                    </td>
                    <td class="px-4 py-3 align-top text-fg">
                      {{
                        item.deleted_by_name ??
                          ('settings.deletedDocuments.unknownUser' | transloco)
                      }}
                    </td>
                    <td class="px-4 py-3 align-top whitespace-pre-line text-fg-muted">
                      {{
                        item.deleted_reason ?? ('settings.deletedDocuments.noReason' | transloco)
                      }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-card>
    </div>
  `,
})
export class DeletedDocuments {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly items = signal<readonly DeletedDocument[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.items.set([]);
      if (orgId) {
        this.load(orgId);
      }
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
