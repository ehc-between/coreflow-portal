import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackActionKey } from '../data/feedback-display';
import { FEEDBACK_ERROR_CODES, feedbackErrorKey } from '../data/feedback-errors';
import {
  FEEDBACK_ACTIONS,
  FeedbackAction,
  FeedbackBulk,
  FeedbackBulkFailure,
  FeedbackBulkResult,
} from '../data/feedback.models';

/** The owner choice: keep (send nothing), none (null = unassign) or a user id. */
export const KEEP_OWNER = '';
export const NO_OWNER = 'none';

/** The bulk request for the chosen action and owner, or null when nothing is chosen. */
export function bulkBody(
  ids: readonly string[],
  action: FeedbackAction | '',
  owner: string,
): FeedbackBulk | null {
  if (!ids.length || (!action && owner === KEEP_OWNER)) {
    return null;
  }
  return {
    ids,
    ...(action ? { action } : {}),
    ...(owner === KEEP_OWNER ? {} : { owner_user_id: owner === NO_OWNER ? null : owner }),
  };
}

/** The message of one refused record (the code the single-record call would answer). */
export function bulkErrorKey(code: string): string {
  return (FEEDBACK_ERROR_CODES as readonly string[]).includes(code)
    ? `feedback.errors.${code}`
    : 'errors.generic';
}

const SELECT =
  'h-9 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg focus:border-accent focus:outline-none';

/**
 * The bar above the register while rows are selected: change the status of and / or
 * assign the selected records in one go. Each record is saved on its own, so the
 * ones the workflow refuses are listed with the reason and the rest still change.
 */
@Component({
  selector: 'app-feedback-bulk-bar',
  imports: [TranslocoPipe, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mb-3 flex flex-col gap-2 rounded-card border border-accent-border bg-accent-soft p-3 sm:flex-row sm:flex-wrap sm:items-center"
      role="region"
      [attr.aria-label]="'feedback.bulk.label' | transloco"
      data-testid="bulk-bar"
    >
      <p class="text-ui font-semibold text-fg sm:mr-2" aria-live="polite">
        {{ 'feedback.bulk.selected' | transloco: { count: ids().length } }}
      </p>
      <label class="sr-only" for="cf-fb-bulk-action">{{
        'feedback.bulk.action' | transloco
      }}</label>
      <select
        id="cf-fb-bulk-action"
        [class]="select"
        (change)="action.set($any($event.target).value)"
        data-testid="bulk-action"
      >
        <option value="" [selected]="!action()">
          {{ 'feedback.bulk.keepStatus' | transloco }}
        </option>
        @for (a of actions; track a) {
          <option [value]="a" [selected]="action() === a">{{ actionKey(a) | transloco }}</option>
        }
      </select>
      <label class="sr-only" for="cf-fb-bulk-owner">{{ 'feedback.bulk.owner' | transloco }}</label>
      <select
        id="cf-fb-bulk-owner"
        [class]="select"
        (change)="owner.set($any($event.target).value)"
        data-testid="bulk-owner"
      >
        <option [value]="keep" [selected]="owner() === keep">
          {{ 'feedback.bulk.keepOwner' | transloco }}
        </option>
        <option [value]="none" [selected]="owner() === none">
          {{ 'feedback.bulk.noOwner' | transloco }}
        </option>
        @for (u of users(); track u.id) {
          <option [value]="u.id" [selected]="owner() === u.id">{{ u.label }}</option>
        }
      </select>
      <div class="flex flex-wrap gap-2">
        <app-button
          size="sm"
          [disabled]="!body()"
          [loading]="busy()"
          (click)="apply()"
          data-testid="bulk-apply"
        >
          {{ 'feedback.bulk.apply' | transloco: { count: ids().length } }}
        </app-button>
        <app-button size="sm" variant="ghost" (click)="cleared.emit()" data-testid="bulk-clear">
          {{ 'feedback.bulk.clear' | transloco }}
        </app-button>
      </div>
      @if (failed().length) {
        <ul class="w-full text-meta text-warn-ink" data-testid="bulk-failed">
          @for (f of failed(); track f.id) {
            <li>
              {{
                'feedback.bulk.failedRow'
                  | transloco: { code: f.code || '—', reason: (errorKey(f.error) | transloco) }
              }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class FeedbackBulkBar {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly ids = input.required<readonly string[]>();
  readonly users = input<readonly { readonly id: string; readonly label: string }[]>([]);
  /** Records were changed (the page reloads its list and band). */
  readonly applied = output<FeedbackBulkResult>();
  readonly cleared = output<void>();

  protected readonly select = SELECT;
  protected readonly actions = FEEDBACK_ACTIONS;
  protected readonly actionKey = feedbackActionKey;
  protected readonly keep = KEEP_OWNER;
  protected readonly none = NO_OWNER;

  protected readonly action = signal<FeedbackAction | ''>('');
  protected readonly owner = signal<string>(KEEP_OWNER);
  protected readonly busy = signal(false);
  protected readonly failed = signal<readonly FeedbackBulkFailure[]>([]);

  protected readonly body = computed(() => bulkBody(this.ids(), this.action(), this.owner()));

  protected errorKey(code: string): string {
    return bulkErrorKey(code);
  }

  protected apply(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const body = this.body();
    if (!orgId || !body || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.failed.set([]);
    this.api.bulk(orgId, body).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.failed.set(result.failed);
        if (result.updated.length) {
          this.notifications.success('feedback.bulk.done', { count: result.updated.length });
        }
        if (result.failed.length) {
          this.notifications.warning('feedback.bulk.someFailed', { count: result.failed.length });
        }
        this.action.set('');
        this.owner.set(KEEP_OWNER);
        this.applied.emit(result);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }
}
