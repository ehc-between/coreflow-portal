import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ProcessReview } from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';

/** Compliance-style value of a review outcome (suitable = met). */
export function outcomeValue(outcome: string): string {
  switch (outcome) {
    case 'suitable':
      return 'met';
    case 'needs_change':
      return 'partial';
    case 'not_effective':
      return 'not_met';
    default:
      return 'unknown';
  }
}

/**
 * The review history of a process (newest first): date, reviewer, outcome,
 * how many checklist points were confirmed, follow-up tasks and notes. These
 * records are the evidence that the process is checked and improved (Check and
 * Act in PDCA) and feed management review.
 */
@Component({
  selector: 'app-process-review-history',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    EmptyState,
    ErrorState,
    LoadingState,
    SlideOver,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'processes.reviewHistory.title' | transloco"
      [subtitle]="'processes.reviewHistory.subtitle' | transloco"
      [closeLabel]="'processes.actions.close' | transloco"
      [width]="560"
      (closed)="closed.emit()"
    >
      @if (open()) {
        @if (error()) {
          <app-error-state (retry)="load()" />
        } @else if (items() === null) {
          <app-loading-state [rows]="3" />
        } @else {
          @for (r of items(); track r.id) {
            <article class="mb-3 rounded-card border border-border p-4" data-testid="review-record">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-card font-bold text-fg">{{ r.reviewed_at | localDay }}</p>
                <app-status-badge
                  meaning="compliance"
                  [value]="outcome(r.outcome)"
                  [labelKey]="'processes.review.outcome.' + r.outcome"
                />
              </div>
              <p class="text-meta text-fg-muted">
                {{ 'processes.reviewHistory.by' | transloco: { name: r.reviewer?.name ?? '—' } }}
                @if (r.checklist.length) {
                  ·
                  {{
                    'processes.reviewHistory.checks'
                      | transloco: { ok: okCount(r), total: r.checklist.length }
                  }}
                }
              </p>
              @if (r.notes) {
                <p class="mt-2 text-ui whitespace-pre-line text-fg">{{ r.notes }}</p>
              }
              @if (notOk(r).length) {
                <ul class="mt-2 flex flex-col gap-0.5 text-meta text-fg-muted">
                  @for (c of notOk(r); track c.key) {
                    <li>
                      ✕ {{ 'processes.review.checks.' + c.key | transloco }}
                      @if (c.note) {
                        — {{ c.note }}
                      }
                    </li>
                  }
                </ul>
              }
              @if (r.actions.length) {
                <p class="mt-2 text-meta font-semibold text-fg-muted">
                  {{ 'processes.reviewHistory.actions' | transloco }}
                </p>
                <ul class="flex flex-col gap-0.5 text-ui">
                  @for (a of r.actions; track a.id) {
                    <li class="flex flex-wrap items-center gap-2">
                      @if (a.url) {
                        <a [routerLink]="a.url" class="text-accent hover:underline">{{
                          a.title
                        }}</a>
                      } @else {
                        <span>{{ a.title }}</span>
                      }
                      @if (a.status) {
                        <app-status-badge meaning="lifecycle" [value]="a.status" />
                      }
                    </li>
                  }
                </ul>
              }
            </article>
          } @empty {
            <app-empty-state
              icon="history"
              titleKey="processes.reviewHistory.emptyTitle"
              bodyKey="processes.reviewHistory.emptyBody"
              [compact]="true"
            />
          }
        }
      }
    </app-slide-over>
  `,
})
export class ReviewHistory {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly open = input(false);
  readonly processId = input.required<string>();
  readonly closed = output<void>();

  protected readonly items = signal<readonly ProcessReview[] | null>(null);
  protected readonly error = signal(false);

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.load());
      }
    });
  }

  load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.items.set(null);
    this.error.set(false);
    this.api.reviews(orgId, this.processId()).subscribe({
      next: (page) => this.items.set(page.items),
      error: () => this.error.set(true),
    });
  }

  protected outcome(value: string): string {
    return outcomeValue(value);
  }

  protected okCount(r: ProcessReview): number {
    return r.checklist.filter((c) => c.ok === true).length;
  }

  protected notOk(r: ProcessReview) {
    return r.checklist.filter((c) => c.ok === false);
  }
}
