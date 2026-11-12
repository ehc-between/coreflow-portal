import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { blankToNull, decisionTone } from '../data/asset-display';
import {
  Decision,
  ReviewCounts,
  ReviewItem,
  ReviewItemInput,
  ReviewItemUpdate,
} from '../data/asset.models';

/** The decisions a reviewer can pick (pending is the starting point). */
export const REVIEW_CHOICES: readonly Exclude<Decision, 'pending'>[] = ['keep', 'revoke', 'modify'];

/** Counts of a list of review items (mirrors the backend's `counts`). */
export function countItems(items: readonly ReviewItem[]): ReviewCounts {
  const by = (d: Decision) => items.filter((i) => i.decision === d).length;
  return {
    total: items.length,
    pending: by('pending'),
    keep: by('keep'),
    revoke: by('revoke'),
    modify: by('modify'),
    unremediated: items.filter(
      (i) => (i.decision === 'revoke' || i.decision === 'modify') && !i.remediated_at,
    ).length,
  };
}

export interface ItemChange {
  readonly item: ReviewItem;
  readonly patch: ReviewItemUpdate;
}

/**
 * The accounts of an access review: who has access, which account and level, and
 * the reviewer's decision (keep, revoke or modify) with a note. Revoked or changed
 * access can be marked as done. Editable while the review is open and the caller
 * may work it; otherwise read-only.
 */
@Component({
  selector: 'app-review-items',
  imports: [TranslocoPipe, LocalDatePipe, Badge, Button, FieldHelp, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'assets.reviewItems.title' | transloco }}
        </h2>
        <app-field-help scope="assets" page="review" field="decision" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="inline-flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          <input
            type="checkbox"
            [checked]="pendingOnly()"
            (change)="pendingOnly.set($any($event.target).checked)"
          />
          {{ 'assets.reviewItems.pendingOnly' | transloco }}
        </label>
        @if (editable()) {
          @if (pendingCount()) {
            <app-button variant="ghost" size="sm" [disabled]="busy()" (click)="keepAll.emit()">
              {{ 'assets.reviewItems.keepAll' | transloco: { count: pendingCount() } }}
            </app-button>
          }
          <app-button
            variant="secondary"
            size="sm"
            [disabled]="busy()"
            (click)="importMembers.emit()"
          >
            {{ 'assets.reviewItems.importMembers' | transloco }}
          </app-button>
          <app-button size="sm" [disabled]="busy()" (click)="adding.set(!adding())">
            <app-icon name="plus" [size]="14" />
            {{ 'assets.reviewItems.add' | transloco }}
          </app-button>
        }
      </div>
    </div>

    @if (adding()) {
      <form
        class="mb-3 grid grid-cols-1 gap-2 rounded-tile border border-border p-3 sm:grid-cols-4"
        (submit)="$event.preventDefault(); submitNew()"
        novalidate
        data-testid="add-item"
      >
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'assets.fields.subjectName' | transloco }}
          <input
            type="text"
            maxlength="255"
            required
            class="h-9 rounded-[8px] border border-border bg-bg px-2 text-[13px] font-normal text-fg"
            [attr.aria-invalid]="newError() || null"
            [value]="newName()"
            (input)="newName.set($any($event.target).value)"
          />
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'assets.fields.account' | transloco }}
          <input
            type="text"
            maxlength="255"
            class="h-9 rounded-[8px] border border-border bg-bg px-2 text-[13px] font-normal text-fg"
            [value]="newAccount()"
            (input)="newAccount.set($any($event.target).value)"
          />
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'assets.fields.accessLevel' | transloco }}
          <input
            type="text"
            maxlength="255"
            class="h-9 rounded-[8px] border border-border bg-bg px-2 text-[13px] font-normal text-fg"
            [placeholder]="'assets.reviewItems.accessLevelPlaceholder' | transloco"
            [value]="newLevel()"
            (input)="newLevel.set($any($event.target).value)"
          />
        </label>
        <div class="flex items-end gap-2">
          <app-button type="submit" size="sm" [disabled]="busy()">
            {{ 'assets.reviewItems.addConfirm' | transloco }}
          </app-button>
          <app-button variant="ghost" size="sm" (click)="adding.set(false)">
            {{ 'common.cancel' | transloco }}
          </app-button>
        </div>
        @if (newError()) {
          <p class="text-[12px] text-fail sm:col-span-4" role="alert">
            {{ 'assets.reviewItems.nameRequired' | transloco }}
          </p>
        }
      </form>
    }

    @if (visible().length === 0) {
      <p class="py-4 text-[13px] text-fg-subtle">
        {{
          (items().length ? 'assets.reviewItems.noPending' : 'assets.reviewItems.none') | transloco
        }}
      </p>
    } @else {
      <ul class="flex flex-col divide-y divide-border" data-testid="review-items">
        @for (item of visible(); track item.id) {
          <li class="flex flex-col gap-2 py-3 lg:flex-row lg:items-start lg:gap-4">
            <div class="min-w-0 flex-1">
              <p class="text-[13.5px] font-semibold text-fg">{{ item.subject_name }}</p>
              <p class="flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                @if (item.account) {
                  <span>{{
                    'assets.reviewItems.accountLine' | transloco: { account: item.account }
                  }}</span>
                }
                @if (item.access_level) {
                  <span>{{
                    'assets.reviewItems.levelLine' | transloco: { level: item.access_level }
                  }}</span>
                }
                @if (item.decided_at && item.decided_by?.name) {
                  <span>
                    {{
                      'assets.reviewItems.decidedBy'
                        | transloco
                          : {
                              name: item.decided_by?.name,
                              date: (item.decided_at | localDate: 'short'),
                            }
                    }}
                  </span>
                }
              </p>
            </div>
            <div class="flex flex-col gap-2 lg:w-[420px]">
              @if (editable()) {
                <div
                  class="flex flex-wrap gap-1"
                  role="radiogroup"
                  [attr.aria-label]="
                    'assets.reviewItems.decisionFor' | transloco: { name: item.subject_name }
                  "
                >
                  @for (choice of choices; track choice) {
                    <button
                      type="button"
                      role="radio"
                      class="rounded-tile border px-3 py-1 text-[12.5px] font-semibold"
                      [class.border-accent]="item.decision === choice"
                      [class.bg-accent-soft]="item.decision === choice"
                      [class.text-accent]="item.decision === choice"
                      [class.border-border]="item.decision !== choice"
                      [class.text-fg-muted]="item.decision !== choice"
                      [attr.aria-checked]="item.decision === choice"
                      [disabled]="busy()"
                      (click)="decide(item, choice)"
                    >
                      {{ 'assets.decision.' + choice | transloco }}
                    </button>
                  }
                  <button
                    type="button"
                    class="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg"
                    [attr.aria-label]="
                      'assets.reviewItems.remove' | transloco: { name: item.subject_name }
                    "
                    [disabled]="busy()"
                    (click)="remove.emit(item)"
                  >
                    <app-icon name="trash" [size]="13" />
                  </button>
                </div>
                <label class="sr-only" [attr.for]="'note-' + item.id">
                  {{ 'assets.reviewItems.noteFor' | transloco: { name: item.subject_name } }}
                </label>
                <input
                  [id]="'note-' + item.id"
                  type="text"
                  maxlength="5000"
                  class="h-9 rounded-[8px] border border-border bg-bg px-2 text-[13px] text-fg"
                  [placeholder]="
                    (item.decision === 'keep' || item.decision === 'pending'
                      ? 'assets.reviewItems.notePlaceholder'
                      : 'assets.reviewItems.noteChangePlaceholder'
                    ) | transloco
                  "
                  [value]="item.note ?? ''"
                  (change)="saveNote(item, $any($event.target).value)"
                />
                @if (item.decision === 'revoke' || item.decision === 'modify') {
                  <label class="inline-flex items-center gap-1.5 text-[12.5px] text-fg">
                    <input
                      type="checkbox"
                      [checked]="!!item.remediated_at"
                      [disabled]="busy()"
                      (change)="
                        changed.emit({ item, patch: { remediated: $any($event.target).checked } })
                      "
                    />
                    {{ 'assets.reviewItems.remediated' | transloco }}
                  </label>
                }
              } @else {
                <div class="flex flex-wrap items-center gap-2">
                  <app-badge [tone]="tone(item.decision)">
                    {{ 'assets.decision.' + item.decision | transloco }}
                  </app-badge>
                  @if (item.remediated_at) {
                    <span class="text-[12px] text-fg-subtle">
                      {{
                        'assets.reviewItems.remediatedOn'
                          | transloco: { date: (item.remediated_at | localDate) }
                      }}
                    </span>
                  }
                </div>
                @if (item.note) {
                  <p class="text-[12.5px] text-fg-muted">{{ item.note }}</p>
                }
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class ReviewItems {
  readonly items = input.required<readonly ReviewItem[]>();
  readonly editable = input(false);
  readonly busy = input(false);
  readonly changed = output<ItemChange>();
  readonly added = output<ReviewItemInput>();
  readonly remove = output<ReviewItem>();
  readonly importMembers = output<void>();
  readonly keepAll = output<void>();

  protected readonly choices = REVIEW_CHOICES;
  protected readonly tone = decisionTone;
  protected readonly pendingOnly = signal(false);
  protected readonly adding = signal(false);
  protected readonly newName = signal('');
  protected readonly newAccount = signal('');
  protected readonly newLevel = signal('');
  protected readonly newError = signal(false);

  protected readonly pendingCount = computed(
    () => this.items().filter((i) => i.decision === 'pending').length,
  );
  protected readonly visible = computed(() =>
    this.pendingOnly() ? this.items().filter((i) => i.decision === 'pending') : this.items(),
  );

  protected decide(item: ReviewItem, decision: Decision): void {
    if (item.decision !== decision) {
      this.changed.emit({ item, patch: { decision } });
    }
  }

  protected saveNote(item: ReviewItem, value: string): void {
    const note = blankToNull(value);
    if (note !== (item.note ?? null)) {
      this.changed.emit({ item, patch: { note } });
    }
  }

  protected submitNew(): void {
    const name = this.newName().trim();
    if (!name) {
      this.newError.set(true);
      return;
    }
    this.newError.set(false);
    this.added.emit({
      subject_name: name,
      account: blankToNull(this.newAccount()),
      access_level: blankToNull(this.newLevel()),
    });
    this.newName.set('');
    this.newAccount.set('');
    this.newLevel.set('');
  }
}
