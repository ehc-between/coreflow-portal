import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AttachmentDeletion } from '../../../core/attachments/attachment.models';
import { AttachmentsApi } from '../../../core/attachments/attachments-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';

const PAGE_SIZE = 50;

/**
 * Settings → File deletion log (`audit:read`, enforced by the route guard and
 * the API). A read-only, paged record of attachment files whose stored bytes
 * were permanently deleted (after an erasure, the retention grace period, a
 * quarantine or a rejected upload), newest first. The server never returns
 * filenames or storage keys, only a hash of the key, so the log itself holds
 * no personal data. Reloads on org switch.
 */
@Component({
  selector: 'app-attachment-deletions',
  imports: [LocalDatePipe, RouterLink, TranslocoPipe, Badge, Card, Icon, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/settings"
        class="mb-3 inline-flex items-center gap-1.5 text-ui font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'settings.attachmentDeletions.back' | transloco }}
      </a>

      <div class="mb-[18px]">
        <h1 class="font-display text-page font-bold text-fg">
          {{ 'settings.attachmentDeletions.title' | transloco }}
        </h1>
        <div class="mt-1.5 text-body text-fg-muted">
          {{ 'settings.attachmentDeletions.subtitle' | transloco }}
        </div>
      </div>

      <app-card [padded]="false">
        @if (loading()) {
          <div class="px-4 py-10 text-center text-body text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        } @else if (failed()) {
          <div role="alert" class="px-4 py-10 text-center text-body text-fail">
            {{ 'settings.attachmentDeletions.loadError' | transloco }}
          </div>
        } @else if (items().length === 0) {
          <div data-testid="deletions-empty" class="px-4 py-10 text-center text-body text-fg-muted">
            {{ 'settings.attachmentDeletions.empty' | transloco }}
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-ui">
              <thead>
                <tr
                  class="border-b border-border text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
                >
                  <th class="px-4 py-2.5">
                    {{ 'settings.attachmentDeletions.deletedAt' | transloco }}
                  </th>
                  <th class="px-4 py-2.5">
                    {{ 'settings.attachmentDeletions.reason' | transloco }}
                  </th>
                  <th class="px-4 py-2.5">
                    {{ 'settings.attachmentDeletions.record' | transloco }}
                  </th>
                  <th class="px-4 py-2.5 text-right">
                    {{ 'settings.attachmentDeletions.versions' | transloco }}
                  </th>
                  <th class="px-4 py-2.5">
                    {{ 'settings.attachmentDeletions.keyHash' | transloco }}
                  </th>
                  <th class="px-4 py-2.5">
                    {{ 'settings.attachmentDeletions.actor' | transloco }}
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (item of items(); track item.id) {
                  <tr data-testid="deletion-row" class="border-b border-border last:border-b-0">
                    <td class="px-4 py-3 align-top whitespace-nowrap text-fg-muted">
                      {{ item.deleted_at | localDate: 'medium' }}
                    </td>
                    <td class="px-4 py-3 align-top">
                      <app-badge [tone]="item.reason === 'quarantine' ? 'fail' : 'neutral'">
                        {{ 'settings.attachmentDeletions.reasons.' + item.reason | transloco }}
                      </app-badge>
                    </td>
                    <td class="px-4 py-3 align-top">
                      <div class="font-mono text-meta text-fg">{{ item.entity_type }}</div>
                      <div class="font-mono text-micro text-fg-subtle" [title]="item.entity_id">
                        {{ short(item.entity_id) }}
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right align-top text-fg tabular-nums">
                      {{ item.versions_deleted }}
                    </td>
                    <td
                      class="px-4 py-3 align-top font-mono text-meta text-fg-muted"
                      [title]="item.object_key_sha256"
                    >
                      {{ short(item.object_key_sha256) }}
                    </td>
                    <td class="px-4 py-3 align-top text-fg-muted">
                      @if (item.actor_user_id) {
                        <span class="font-mono text-meta" [title]="item.actor_user_id">{{
                          short(item.actor_user_id)
                        }}</span>
                      } @else {
                        {{ 'settings.attachmentDeletions.system' | transloco }}
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </app-card>

      <app-pager
        [offset]="offset()"
        [pageSize]="pageSize"
        [count]="items().length"
        [total]="total()"
        (pageChange)="goTo($event)"
      />
    </div>
  `,
})
export class AttachmentDeletions {
  private readonly api = inject(AttachmentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly items = signal<readonly AttachmentDeletion[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly offset = signal(0);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.items.set([]);
      this.total.set(null);
      this.offset.set(0);
      if (orgId) {
        this.load(orgId, 0);
      }
    });
  }

  /** First 12 characters of an id or hash (the full value is in the tooltip). */
  protected short(value: string): string {
    return value.length > 12 ? `${value.slice(0, 12)}…` : value;
  }

  protected goTo(offset: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId, offset);
    }
  }

  private load(orgId: string, offset: number): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.listDeletions(orgId, PAGE_SIZE, offset).subscribe({
      next: (page) => {
        // Ignore a late response for an org the user has switched away from.
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        this.items.set(page.items);
        this.total.set(page.total);
        this.offset.set(offset);
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
