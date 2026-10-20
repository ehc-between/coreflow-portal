import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Proposal } from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * "Needs your review" work-feed, scoped to the currently selected org. Lists the
 * org's pending proposals (drafts queued by Ask CoreFlow or others). The primary
 * path opens each proposal in the full review editor (`/review/:id`) to view,
 * edit, AI-revise and approve/publish; a quick Reject stays inline. Reloads on
 * org switch.
 */
@Component({
  selector: 'app-review',
  imports: [LocalDatePipe, RouterLink, TranslocoPipe, Card, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[860px] px-8 pt-7 pb-12">
      <div class="mb-[18px]">
        <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          {{ 'review.title' | transloco }}
        </h1>
        <div class="mt-1.5 text-[14px] text-fg-muted">{{ 'review.subtitle' | transloco }}</div>
      </div>

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (proposals().length === 0) {
        <app-card>
          <div class="flex flex-col items-center gap-3 py-12 text-center">
            <span
              class="flex h-12 w-12 items-center justify-center rounded-card border border-pass/30 bg-pass-soft text-pass"
            >
              <app-icon name="checkcircle" [size]="22" />
            </span>
            <p class="text-[14px] text-fg-muted">{{ 'review.empty' | transloco }}</p>
          </div>
        </app-card>
      } @else {
        <div class="flex flex-col gap-3">
          @for (proposal of proposals(); track proposal.id) {
            <app-card>
              <div class="flex items-start gap-3">
                <span
                  class="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-tile bg-accent-soft text-accent"
                >
                  <app-icon name="documents" [size]="17" />
                </span>
                <a [routerLink]="['/review', proposal.id]" class="group min-w-0 flex-1">
                  <h2
                    class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg group-hover:text-accent"
                  >
                    {{ proposal.title }}
                  </h2>
                  @if (proposal.summary) {
                    <p class="mt-1 text-[13.5px] leading-relaxed text-fg-muted">
                      {{ proposal.summary }}
                    </p>
                  }
                  <p class="mt-1.5 text-[12px] text-fg-subtle">
                    {{
                      'review.queuedAt'
                        | transloco: { date: (proposal.created_at | localDate: 'medium') }
                    }}
                  </p>
                </a>
                <div class="flex flex-none items-center gap-2">
                  <app-button
                    variant="ghost"
                    [disabled]="busyId() === proposal.id"
                    (click)="reject(proposal)"
                  >
                    {{ 'review.reject' | transloco }}
                  </app-button>
                  <a [routerLink]="['/review', proposal.id]">
                    <app-button>
                      <app-icon name="procedures" [size]="15" />
                      {{ 'review.open' | transloco }}
                    </app-button>
                  </a>
                </div>
              </div>
            </app-card>
          }
        </div>
      }
    </div>
  `,
})
export class Review {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly proposals = signal<readonly Proposal[]>([]);
  protected readonly loading = signal(false);
  protected readonly busyId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      this.proposals.set([]);
      this.busyId.set(null);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected reject(proposal: Proposal): void {
    const orgId = this.orgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(proposal.id);
    this.api.rejectProposal(orgId, proposal.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.remove(proposal.id);
        this.notifications.info('review.rejectedToast');
      },
      error: () => this.busyId.set(null),
    });
  }

  private remove(id: string): void {
    this.proposals.update((list) => list.filter((p) => p.id !== id));
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.api.listProposals(orgId).subscribe({
      next: (proposals) => {
        this.proposals.set(proposals);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
