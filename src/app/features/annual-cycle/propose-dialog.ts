import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { bcp47ForLang } from '../../core/i18n/locale';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ReqPills } from '../../shared/requirement-links/req-pills';
import { pluralKey } from '../../shared/i18n/plural';
import { Button } from '../../shared/ui/button/button';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { AnnualCycleApi } from './data/annual-cycle-api';
import { monthHeading, proposalMonths } from './data/annual-cycle.logic';
import { Proposal, RECURRENCES, Recurrence } from './data/annual-cycle.models';
import { FormField } from '../../shared/ui/form-field/form-field';

interface Row {
  readonly key: string;
  readonly title: string;
  readonly rationale: string;
  readonly planned: boolean;
  readonly refs: readonly string[];
  readonly owner: string | null;
  selected: boolean;
  month: string;
  recurrence: Recurrence;
}

/**
 * "Foreslå årshjul" (IA v2 §5.3): the rule-based proposal as a checklist (month and
 * how often per duty) → `POST /annual-cycle/accept`. With `onlyKey`, only that duty is
 * pre-ticked (the "Planlegg" button of a not-planned row).
 */
@Component({
  selector: 'app-annual-propose-dialog',
  imports: [TranslocoPipe, Button, LoadingState, ReqPills, SlideOver, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [width]="560"
      [title]="'annual.dialog.title' | transloco: { year: proposal()?.year ?? year() ?? '' }"
      [subtitle]="'annual.dialog.subtitle' | transloco"
      [closeLabel]="'annual.dialog.close' | transloco"
      (closed)="closed.emit()"
    >
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="flex-1 overflow-y-auto px-5 py-4">
          @if (loading()) {
            <app-loading-state [rows]="5" />
          } @else if (failed()) {
            <p class="text-body text-fg-muted" role="alert">
              {{ 'annual.dialog.error' | transloco }}
            </p>
            <app-button class="mt-3 inline-block" variant="secondary" size="sm" (click)="load()">
              {{ 'annual.retry' | transloco }}
            </app-button>
          } @else if (rows().length === 0) {
            <p class="text-body text-fg-muted">{{ 'annual.dialog.none' | transloco }}</p>
          } @else {
            <p class="mb-4 text-body text-fg-muted">{{ 'annual.dialog.intro' | transloco }}</p>
            <ul class="flex flex-col gap-2" data-testid="proposal-list">
              @for (row of rows(); track row.key) {
                <li
                  class="rounded-tile border border-border bg-surface p-3"
                  [class.border-accent]="row.selected"
                >
                  <label class="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      class="mt-1 size-4 flex-none accent-[var(--color-accent)]"
                      [checked]="row.selected"
                      (change)="toggle(row)"
                      [attr.data-testid]="'proposal-' + row.key"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block font-semibold text-fg">{{ row.title }}</span>
                      <span class="block text-meta text-fg-muted">
                        {{ row.rationale }}
                        @if (row.planned) {
                          · {{ 'annual.dialog.planned' | transloco }}
                        }
                      </span>
                      <app-req-pills [refs]="row.refs" />
                    </span>
                  </label>
                  @if (row.selected) {
                    <div
                      class="mt-3 grid grid-cols-1 items-start gap-x-3 gap-y-3 pl-7 sm:grid-cols-2"
                    >
                      <app-form-field
                        [label]="'annual.dialog.month' | transloco"
                        [inputId]="'pm-month-' + row.key"
                      >
                        <select
                          [id]="'pm-month-' + row.key"
                          [value]="row.month"
                          (change)="setMonth(row, $event)"
                        >
                          @for (m of months(); track m) {
                            <option [value]="m" [selected]="m === row.month">
                              {{ monthName(m) }}
                            </option>
                          }
                        </select>
                      </app-form-field>
                      <app-form-field
                        [label]="'annual.dialog.recurrence' | transloco"
                        [inputId]="'pm-rec-' + row.key"
                      >
                        <select [id]="'pm-rec-' + row.key" (change)="setRecurrence(row, $event)">
                          @for (r of recurrences; track r) {
                            <option [value]="r" [selected]="r === row.recurrence">
                              {{ 'annual.recurrence.' + r | transloco }}
                            </option>
                          }
                        </select>
                      </app-form-field>
                      <span class="text-meta text-fg-subtle sm:col-span-2">{{
                        'annual.dialog.ownerYou' | transloco
                      }}</span>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <app-button variant="secondary" (click)="closed.emit()">
            {{ 'annual.dialog.cancel' | transloco }}
          </app-button>
          <app-button
            [disabled]="selectedCount() === 0 || loading()"
            [loading]="saving()"
            (click)="accept()"
            data-testid="proposal-accept"
          >
            {{ 'annual.dialog.accept' | transloco: { count: selectedCount() } }}
          </app-button>
        </div>
      </div>
    </app-slide-over>
  `,
})
export class ProposeDialog {
  private readonly api = inject(AnnualCycleApi);
  private readonly org = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly open = input(false);
  /** The year to propose for (null: the backend decides). */
  readonly year = input<number | null>(null);
  /** Pre-tick only this duty (from a "Planlegg" row). */
  readonly onlyKey = input<string | null>(null);
  readonly closed = output<void>();
  readonly accepted = output<number>();

  protected readonly recurrences = RECURRENCES;
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly proposal = signal<Proposal | null>(null);
  protected readonly rows = signal<Row[]>([]);
  private readonly version = signal(0);

  protected readonly selectedCount = computed(() => {
    this.version();
    return this.rows().filter((r) => r.selected).length;
  });
  protected readonly months = computed(() => {
    const year = this.proposal()?.year;
    return year ? proposalMonths(year, new Date()) : [];
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.load());
      }
    });
  }

  protected monthName(month: string): string {
    return monthHeading(month, bcp47ForLang(this.language.active()), Number(month.slice(0, 4)));
  }

  load(): void {
    const orgId = this.org.currentOrgId();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.failed.set(false);
    this.api.propose(orgId, this.year() ?? undefined).subscribe({
      next: (proposal) => {
        const only = this.onlyKey();
        this.proposal.set(proposal);
        this.rows.set(
          proposal.items.map((item) => ({
            key: item.key,
            title: item.title,
            rationale: item.rationale,
            planned: item.planned,
            refs: item.requirement_refs,
            owner: item.owner_user_id,
            selected: only ? item.key === only : item.selected,
            month: item.month,
            recurrence: item.recurrence,
          })),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  protected toggle(row: Row): void {
    row.selected = !row.selected;
    this.rows.set([...this.rows()]);
    this.version.update((v) => v + 1);
  }

  protected setMonth(row: Row, event: Event): void {
    row.month = (event.target as HTMLSelectElement).value;
  }

  protected setRecurrence(row: Row, event: Event): void {
    row.recurrence = (event.target as HTMLSelectElement).value as Recurrence;
  }

  protected accept(): void {
    const orgId = this.org.currentOrgId();
    const chosen = this.rows().filter((r) => r.selected);
    if (!orgId || chosen.length === 0) {
      return;
    }
    this.saving.set(true);
    this.api
      .accept(
        orgId,
        chosen.map((r) => ({
          key: r.key,
          month: r.month,
          recurrence: r.recurrence,
          owner_user_id: r.owner,
        })),
      )
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          const count = result.created.length;
          this.notifications.success(pluralKey('annual.dialog.accepted', count), { count });
          this.accepted.emit(count);
        },
        error: () => {
          this.saving.set(false);
          this.notifications.error('annual.dialog.acceptFailed');
        },
      });
  }
}
