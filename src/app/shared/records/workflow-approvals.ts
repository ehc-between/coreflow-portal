import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { localize } from '../../core/records/localized';
import { LocalizedText, PendingApproval } from '../../core/records/record.models';
import { recordsErrorMessage } from '../../core/records/records-errors';
import { RecordsApi } from '../../core/records/records-api';
import { RelativeTimePipe } from '../relative-time/relative-time';
import { Button } from '../ui/button/button';

/**
 * The workflow approvals waiting for the current user (`GET /workflow-approvals`),
 * across every record they can read, with approve / reject in place. Built for
 * My Work and dashboards; renders nothing while the list is empty.
 */
@Component({
  selector: 'app-workflow-approvals',
  imports: [RouterLink, TranslocoPipe, Button, RelativeTimePipe],
  providers: [provideTranslocoScope('records')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section [attr.aria-label]="'records.approvals.title' | transloco">
        <h2 class="mb-2 font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
          {{ 'records.approvals.title' | transloco }}
        </h2>
        <ul
          class="flex flex-col divide-y divide-border rounded-card border border-border bg-surface"
        >
          @for (item of items(); track item.approval.id) {
            <li class="flex flex-wrap items-center gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                @if (item.entity.url) {
                  <a
                    [routerLink]="item.entity.url"
                    class="block truncate font-semibold text-accent hover:underline"
                  >
                    @if (item.entity.code) {
                      <span class="font-mono text-[12px] text-fg-subtle">{{
                        item.entity.code
                      }}</span>
                    }
                    {{ item.entity.title }}
                  </a>
                } @else {
                  <span class="block truncate font-semibold text-fg">{{ item.entity.title }}</span>
                }
                <span class="block text-[12px] text-fg-muted">
                  {{
                    'records.approvals.line'
                      | transloco
                        : {
                            transition: label(item.transition_label),
                            name: item.approval.requested_by_name ?? '',
                            when: item.approval.created_at | relativeTime: lang(),
                          }
                  }}
                </span>
              </div>
              <div class="flex gap-2">
                <app-button size="sm" [disabled]="busyId() !== null" (click)="decide(item, true)">
                  {{ 'records.panel.approve' | transloco }}
                </app-button>
                <app-button
                  size="sm"
                  variant="secondary"
                  [disabled]="busyId() !== null"
                  (click)="decide(item, false)"
                >
                  {{ 'records.panel.reject' | transloco }}
                </app-button>
              </div>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class WorkflowApprovals {
  private readonly api = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly decided = output<PendingApproval>();

  protected readonly lang = this.language.active;
  protected readonly items = signal<readonly PendingApproval[]>([]);
  protected readonly busyId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected label(value: LocalizedText): string {
    return localize(value, this.lang());
  }

  protected decide(item: PendingApproval, approve: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(item.approval.id);
    this.api.decide(orgId, item.approval.id, { approve }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.items.update((list) => list.filter((i) => i.approval.id !== item.approval.id));
        this.notifications.success(
          approve ? 'records.panel.approvedToast' : 'records.panel.rejectedToast',
        );
        this.decided.emit(item);
      },
      error: (error: unknown) => {
        this.busyId.set(null);
        const message = recordsErrorMessage(error);
        if (message) {
          this.notifications.error(message.key, message.params);
        }
      },
    });
  }

  private load(orgId: string | null): void {
    this.items.set([]);
    if (!orgId) {
      return;
    }
    this.api.listMyApprovals(orgId).subscribe({
      next: (res) => this.items.set(res.items),
      error: () => this.items.set([]),
    });
  }
}
