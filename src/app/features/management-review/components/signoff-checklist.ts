import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  ReviewDetail,
  SUBMIT_REQUIREMENTS,
  SubmitRequirement,
} from '../data/management-review.models';
import { missingKey } from '../management-review-display';

interface CheckItem {
  readonly key: SubmitRequirement;
  readonly done: boolean;
  readonly labelKey: string;
  readonly params: Record<string, unknown>;
}

/** The sign-off checklist rows of a review, in the order the work is done (pure, for tests). */
export function checklist(r: ReviewDetail): CheckItem[] {
  const missing = new Set<string>(r.submit_check?.missing ?? r.missing_for_submit);
  const check = r.submit_check;
  const params: Record<SubmitRequirement, Record<string, unknown>> = {
    inputs_reviewed: { done: check?.inputs_done ?? 0, total: check?.inputs_total ?? 0 },
    meeting_completed: {},
    minutes_approved: {},
    top_management_present: {
      present: check?.attendance?.top_management_present ?? 0,
      total: check?.attendance?.top_management_total ?? 0,
    },
    assessment_criteria: {},
    conclusions: {},
  };
  return SUBMIT_REQUIREMENTS.map((key) => ({
    key,
    done: !missing.has(key),
    labelKey: `${missingKey(key)}.${missing.has(key) ? 'todo' : 'done'}`,
    params: params[key],
  }));
}

/**
 * "Before you can send for sign-off": what ISO 9.3 needs before top management
 * signs — inputs reviewed, the meeting held with approved minutes and top
 * management present, every 9.3 conclusion rated, and the conclusions written.
 * Each open item is a link to the place that fixes it (`go`).
 */
@Component({
  selector: 'app-mr-signoff-checklist',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="flex flex-col gap-1.5" data-testid="missing-for-submit">
      @for (item of items(); track item.key) {
        <li class="flex items-start gap-2.5 text-body">
          <span
            class="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border"
            [class]="
              item.done
                ? 'border-pass bg-pass text-white'
                : 'border-warn bg-warn-soft text-warn-ink'
            "
            aria-hidden="true"
          >
            <app-icon [name]="item.done ? 'check' : 'alert'" [size]="11" />
          </span>
          <span class="sr-only">{{
            (item.done ? 'managementReview.signoff.done' : 'managementReview.signoff.todo')
              | transloco
          }}</span>
          @if (item.done || !interactive()) {
            <span [class]="item.done ? 'text-fg-muted' : 'text-fg'">{{
              item.labelKey | transloco: item.params
            }}</span>
          } @else {
            <button
              type="button"
              class="text-left font-semibold text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              (click)="go.emit(item.key)"
              [attr.data-testid]="'missing-' + item.key"
            >
              {{ item.labelKey | transloco: item.params }}
            </button>
          }
        </li>
      }
    </ol>
  `,
})
export class SignoffChecklist {
  readonly review = input.required<ReviewDetail>();
  /** Open items are links to the place that fixes them. */
  readonly interactive = input(true);
  readonly go = output<SubmitRequirement>();

  protected readonly items = computed(() => checklist(this.review()));
}
