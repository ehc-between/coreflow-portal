import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Card } from '../../../shared/ui/card/card';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { FeedbackApi } from '../data/feedback-api';
import { ComplaintDeviation } from '../data/feedback.models';

const LIMIT = 50;

/** The lifecycle tone value of a deviation's status category. */
export function complaintDeviationTone(category: string): string {
  return category === 'done' ? 'closed' : category;
}

/**
 * Complaints that were recorded as deviations (KLG-*), cross-listed under the
 * complaints so "all complaints" really is all of them (one home per concept: the
 * rows open the deviation, nothing is copied). Hidden when the user cannot read
 * deviations, the module is off, or there are none.
 */
@Component({
  selector: 'app-complaint-deviations',
  imports: [RouterLink, TranslocoPipe, Card, RecordRow, RecordRowHeader, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <section class="mt-6" [attr.aria-labelledby]="headingId" data-testid="complaint-deviations">
        <h2 [id]="headingId" class="font-display text-card font-bold text-fg">
          {{ 'feedback.complaintDeviations.title' | transloco: { count: total() } }}
        </h2>
        <p class="mt-1 mb-3 text-meta text-fg-muted">
          {{ 'feedback.complaintDeviations.intro' | transloco }}
        </p>
        <app-card [padded]="false">
          <div role="list">
            <app-record-row-header dateKind="due" [coverage]="false" />
            @for (d of items(); track d.id) {
              <app-record-row
                [code]="d.code"
                [title]="d.title"
                [subtitle]="d.type_name"
                [link]="['/deviations', d.id]"
                [owner]="d.owner?.name"
                [date]="d.due_at"
                dateKind="due"
                [overdue]="d.overdue"
              >
                <span coverage class="flex flex-wrap gap-1 text-meta">
                  @for (f of d.linked_feedback; track f.id) {
                    <a
                      [routerLink]="['/feedback/items', f.id]"
                      class="font-semibold text-accent hover:underline"
                      [attr.data-testid]="'linked-' + f.code"
                      >{{ 'feedback.complaintDeviations.linked' | transloco: { code: f.code } }}</a
                    >
                  }
                </span>
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="tone(d.status_category)"
                  [labelKey]="'feedback.complaintDeviations.status.' + d.status_category"
                />
              </app-record-row>
            }
          </div>
        </app-card>
        @if (total() > items().length) {
          <a
            routerLink="/deviations"
            class="mt-2 inline-block text-meta font-semibold text-accent hover:underline"
          >
            {{ 'feedback.complaintDeviations.more' | transloco: { count: total() } }}
          </a>
        }
      </section>
    }
  `,
})
export class ComplaintDeviations {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** The register's search text (also searches the deviations). */
  readonly q = input('');
  /** Only open / in-progress deviations (the register shows open records). */
  readonly open = input(false);

  private static nextId = 0;
  protected readonly headingId = `cf-fb-klg-${ComplaintDeviations.nextId++}`;
  protected readonly items = signal<readonly ComplaintDeviation[]>([]);
  protected readonly total = signal(0);
  protected readonly tone = complaintDeviationTone;

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const q = this.q();
      const open = this.open();
      untracked(() => this.load(orgId, q, open));
    });
  }

  private load(orgId: string | null, q: string, open: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.request = this.api
      .complaintDeviations(orgId, { q: q || undefined, open: open || undefined, limit: LIMIT })
      .subscribe({
        next: (res) => {
          this.items.set(res.available ? res.items : []);
          this.total.set(res.available ? res.total : 0);
        },
        error: () => {
          this.items.set([]);
          this.total.set(0);
        },
      });
  }
}
