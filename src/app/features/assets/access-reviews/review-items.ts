import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { pluralKey } from '../../../shared/i18n/plural';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  blankToNull,
  decisionBadge,
  isFlaggedSubject,
  subjectStatusBadge,
} from '../data/asset-display';
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
    decided: items.length - by('pending'),
    flagged: items.filter((i) => isFlaggedSubject(i.subject_status)).length,
  };
}

/** Flagged accounts first (people who have left), then the rest in their order. */
export function sortItems(items: readonly ReviewItem[]): readonly ReviewItem[] {
  return [...items].sort((a, b) => {
    const fa = isFlaggedSubject(a.subject_status) ? 0 : 1;
    const fb = isFlaggedSubject(b.subject_status) ? 0 : 1;
    return fa - fb || a.position - b.position;
  });
}

export interface ItemChange {
  readonly item: ReviewItem;
  readonly patch: ReviewItemUpdate;
}

/**
 * The accounts of an access review: who has access, which account and level, how the
 * holder stands in People (left, leaving, no longer a member: flagged and sorted
 * first, with "Fjern" suggested), and the reviewer's decision (keep, revoke or change)
 * with a note. Revoked or changed access is ticked off once carried out, also after
 * the review is completed. Editable while the review is open and the caller may work
 * it; otherwise read-only.
 */
@Component({
  selector: 'app-review-items',
  imports: [TranslocoPipe, LocalDatePipe, Button, EntityChip, FieldHelp, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'assets.reviewItems.title' | transloco }}
        </h2>
        <app-field-help scope="assets" page="review" field="decision" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        @if (items().length) {
          <label class="inline-flex items-center gap-1.5 text-meta text-fg-muted">
            <input
              type="checkbox"
              [checked]="pendingOnly()"
              (change)="pendingOnly.set($any($event.target).checked)"
            />
            {{ 'assets.reviewItems.pendingOnly' | transloco }}
          </label>
        }
        @if (editable()) {
          @if (pendingCount() && unflaggedPending()) {
            <app-button variant="ghost" size="sm" [disabled]="busy()" (click)="keepAll.emit()">
              {{ 'assets.reviewItems.keepAll' | transloco: { count: unflaggedPending() } }}
            </app-button>
          }
          <app-button
            size="sm"
            variant="secondary"
            [disabled]="busy()"
            (click)="adding.set(!adding())"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'assets.reviewItems.add' | transloco }}
          </app-button>
        }
      </div>
    </div>

    @if (flaggedCount() && editable()) {
      <p
        class="mb-3 rounded-tile border border-warn/30 bg-warn-soft px-3 py-2 text-ui text-fg"
        role="note"
        data-testid="flagged-note"
      >
        {{
          pluralKey('assets.reviewItems.flaggedNote', flaggedCount())
            | transloco: { count: flaggedCount() }
        }}
      </p>
    }

    @if (adding()) {
      <form
        class="mb-3 grid grid-cols-1 gap-2 rounded-tile border border-border p-3 sm:grid-cols-4"
        (submit)="$event.preventDefault(); submitNew()"
        novalidate
        data-testid="add-item"
      >
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          <span
            >{{ 'assets.fields.subjectName' | transloco }}
            <span class="text-fail-ink" aria-hidden="true">*</span></span
          >
          <input
            type="text"
            maxlength="255"
            required
            aria-required="true"
            class="h-9 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            [attr.aria-invalid]="newError() || null"
            [value]="newName()"
            (input)="newName.set($any($event.target).value)"
          />
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'assets.fields.account' | transloco }}
          <input
            type="text"
            maxlength="255"
            class="h-9 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
            [value]="newAccount()"
            (input)="newAccount.set($any($event.target).value)"
          />
        </label>
        <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
          {{ 'assets.fields.accessLevel' | transloco }}
          <input
            type="text"
            maxlength="255"
            class="h-9 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
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
          <p class="text-meta text-fail-ink sm:col-span-4" role="alert">
            {{ 'assets.reviewItems.nameRequired' | transloco }}
          </p>
        }
      </form>
    }

    @if (visible().length === 0) {
      <div class="py-4 text-ui text-fg-subtle">
        <p>
          {{
            (items().length ? 'assets.reviewItems.noPending' : 'assets.reviewItems.none')
              | transloco
          }}
        </p>
        @if (!items().length && editable()) {
          <div class="mt-3 flex flex-wrap gap-2">
            <app-button
              size="sm"
              variant="secondary"
              [disabled]="busy()"
              (click)="importCsv.emit()"
            >
              {{ 'assets.reviewItems.importCsv' | transloco }}
            </app-button>
            <app-button
              size="sm"
              variant="ghost"
              [disabled]="busy()"
              (click)="importMembers.emit()"
            >
              {{ 'assets.reviewItems.importMembers' | transloco }}
            </app-button>
          </div>
        }
      </div>
    } @else {
      <ul class="flex flex-col divide-y divide-border" data-testid="review-items">
        @for (item of visible(); track item.id) {
          <li
            class="flex flex-col gap-2 py-3 lg:flex-row lg:items-start lg:gap-4"
            [attr.data-flagged]="flagged(item) || null"
          >
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-body font-semibold text-fg">
                {{ item.subject_name }}
                @if (item.subject_status && item.subject_status !== 'current') {
                  <app-status-badge
                    [meaning]="subjectBadge(item.subject_status).meaning"
                    [value]="subjectBadge(item.subject_status).value"
                    [labelKey]="'assets.subjectStatus.' + item.subject_status"
                  />
                }
              </p>
              <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-subtle">
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
                @if (item.subject_employee; as e) {
                  <app-entity-chip
                    [ref]="{
                      entity_type: 'employee',
                      entity_id: e.id,
                      code: e.code,
                      title: e.name,
                      url: e.url,
                    }"
                  />
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
              @if (item.suggested_decision === 'revoke' && item.decision === 'pending') {
                <p class="mt-1 text-meta text-warn-ink">
                  {{ 'assets.reviewItems.suggestRevoke' | transloco }}
                </p>
              }
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
                      class="min-h-8 rounded-tile border px-3 py-1 text-meta font-semibold"
                      [class.border-accent]="item.decision === choice"
                      [class.bg-accent-soft]="item.decision === choice"
                      [class.text-accent]="item.decision === choice"
                      [class.border-border]="item.decision !== choice"
                      [class.text-fg-muted]="item.decision !== choice"
                      [class.ring-1]="
                        item.decision === 'pending' && item.suggested_decision === choice
                      "
                      [class.ring-warn]="
                        item.decision === 'pending' && item.suggested_decision === choice
                      "
                      [attr.aria-checked]="item.decision === choice"
                      [disabled]="busy()"
                      (click)="decide(item, choice)"
                    >
                      {{ 'assets.decision.' + choice | transloco }}
                    </button>
                  }
                  <button
                    type="button"
                    class="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg"
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
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                  [placeholder]="
                    (item.decision === 'keep' || item.decision === 'pending'
                      ? 'assets.reviewItems.notePlaceholder'
                      : 'assets.reviewItems.noteChangePlaceholder'
                    ) | transloco
                  "
                  [value]="item.note ?? ''"
                  (change)="saveNote(item, $any($event.target).value)"
                />
              } @else {
                <div class="flex flex-wrap items-center gap-2">
                  <app-status-badge
                    [meaning]="decisionBadge(item.decision).meaning"
                    [value]="decisionBadge(item.decision).value"
                    [labelKey]="'assets.decision.' + item.decision"
                  />
                </div>
                @if (item.note) {
                  <p class="text-meta text-fg-muted">{{ item.note }}</p>
                }
              }
              @if (item.decision === 'revoke' || item.decision === 'modify') {
                @if (editable() || remediable()) {
                  <label class="inline-flex items-center gap-1.5 text-meta text-fg">
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
                @if (item.remediated_at) {
                  <span class="text-meta text-fg-subtle">
                    {{
                      'assets.reviewItems.remediatedOn'
                        | transloco
                          : {
                              date: (item.remediated_at | localDate),
                              name: item.remediated_by?.name ?? '',
                            }
                    }}
                  </span>
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
  protected readonly pluralKey = pluralKey;
  readonly items = input.required<readonly ReviewItem[]>();
  /** Decisions can be recorded (review open, caller may work it). */
  readonly editable = input(false);
  /** Revocations can be ticked off as carried out (also after completion). */
  readonly remediable = input(false);
  readonly busy = input(false);
  readonly changed = output<ItemChange>();
  readonly added = output<ReviewItemInput>();
  readonly remove = output<ReviewItem>();
  readonly importMembers = output<void>();
  readonly importCsv = output<void>();
  readonly keepAll = output<void>();

  protected readonly choices = REVIEW_CHOICES;
  protected readonly decisionBadge = decisionBadge;
  protected readonly subjectBadge = subjectStatusBadge;
  protected readonly pendingOnly = signal(false);
  protected readonly adding = signal(false);
  protected readonly newName = signal('');
  protected readonly newAccount = signal('');
  protected readonly newLevel = signal('');
  protected readonly newError = signal(false);

  protected readonly pendingCount = computed(
    () => this.items().filter((i) => i.decision === 'pending').length,
  );
  /** Undecided accounts that are not flagged: "Behold alle" never keeps a leaver's access. */
  protected readonly unflaggedPending = computed(
    () =>
      this.items().filter((i) => i.decision === 'pending' && !isFlaggedSubject(i.subject_status))
        .length,
  );
  protected readonly flaggedCount = computed(
    () =>
      this.items().filter((i) => i.decision === 'pending' && isFlaggedSubject(i.subject_status))
        .length,
  );
  protected readonly visible = computed(() => {
    const items = sortItems(this.items());
    return this.pendingOnly() ? items.filter((i) => i.decision === 'pending') : items;
  });

  protected flagged(item: ReviewItem): boolean {
    return isFlaggedSubject(item.subject_status);
  }

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
