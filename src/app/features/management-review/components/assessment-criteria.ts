import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { AskPanelService } from '../../ask/ask-panel.service';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  ASSESSMENTS,
  Assessment,
  AssessmentCriteria,
  CRITERIA,
  Criterion,
  CriterionValue,
} from '../data/management-review.models';
import {
  assessmentKey,
  criterionHintKey,
  criterionKey,
  criterionRatingKey,
} from '../management-review-display';

/** The editable criteria of a review, keyed by criterion. */
export type CriteriaDraft = Readonly<Partial<Record<Criterion, CriterionValue>>>;

const WEAKEST: readonly Assessment[] = ['not_effective', 'partially_effective', 'effective'];

/** The overall result: the weakest rating once every required criterion is rated. */
export function deriveAssessment(
  required: readonly Criterion[],
  draft: CriteriaDraft,
): Assessment | null {
  const ratings = required.map((c) => draft[c]?.rating ?? null);
  if (ratings.length === 0 || ratings.some((r) => !r)) {
    return null;
  }
  return WEAKEST.find((w) => ratings.includes(w)) ?? null;
}

/** Badge colour of an assessment (green only when effective). */
const ASSESSMENT_TONE: Readonly<Record<Assessment, string>> = {
  effective: 'effective',
  partially_effective: 'partial',
  not_effective: 'non_compliant',
};

let nextId = 0;

/**
 * The conclusions ISO 9.3 asks for, one by one: is the management system still
 * suitable (fits the organisation), adequate (enough) and effective (works),
 * and for ISO 9001 also aligned with the strategic direction. Each gets a
 * rating and an optional note; the overall result is derived as the weakest.
 * The page keeps the draft and saves it with the other outputs.
 */
@Component({
  selector: 'app-mr-assessment-criteria',
  imports: [TranslocoPipe, Button, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-3" data-testid="mr-criteria">
      @for (c of shown(); track c) {
        @let value = draft()[c];
        <fieldset class="rounded-tile border border-border p-3">
          <legend class="px-1 text-ui font-semibold text-fg">
            {{ criterionKey(c) | transloco }}
          </legend>
          <p class="mb-2 text-meta text-fg-muted">{{ criterionHintKey(c) | transloco }}</p>
          @if (canEdit()) {
            <div
              class="flex flex-wrap gap-2"
              role="radiogroup"
              [attr.aria-label]="criterionKey(c) | transloco"
            >
              @for (a of assessments; track a) {
                <label
                  class="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-tile border px-3 text-ui text-fg has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-semibold"
                  [class.border-border]="value?.rating !== a"
                >
                  <input
                    type="radio"
                    [name]="uid + '-' + c"
                    [value]="a"
                    [checked]="value?.rating === a"
                    (change)="set(c, { rating: a, note: value?.note ?? null })"
                    [attr.data-testid]="'mr-criterion-' + c + '-' + a"
                  />
                  {{ ratingKey(a) | transloco }}
                </label>
              }
            </div>
            <label class="sr-only" [attr.for]="uid + '-note-' + c">{{
              'managementReview.criteria.noteFor'
                | transloco: { criterion: (criterionKey(c) | transloco) }
            }}</label>
            <textarea
              [id]="uid + '-note-' + c"
              rows="2"
              maxlength="5000"
              class="mt-2 w-full rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg outline-none focus:border-accent"
              [placeholder]="'managementReview.criteria.notePlaceholder' | transloco"
              [value]="value?.note ?? ''"
              (input)="
                set(c, { rating: value?.rating ?? null, note: $any($event.target).value || null })
              "
            ></textarea>
          } @else {
            <p class="flex flex-wrap items-center gap-2 text-body text-fg">
              @if (value?.rating; as rating) {
                <app-status-badge
                  meaning="compliance"
                  [value]="tone(rating)"
                  [labelKey]="ratingKey(rating)"
                />
              } @else {
                <span class="text-fg-muted">{{ 'common.empty.notSet' | transloco }}</span>
              }
            </p>
            @if (value?.note) {
              <p class="mt-1 text-body whitespace-pre-line text-fg">{{ value?.note }}</p>
            }
          }
        </fieldset>
      }

      <div
        class="flex flex-wrap items-center justify-between gap-2 rounded-tile bg-surface-2 px-3 py-2.5"
        data-testid="mr-criteria-overall"
      >
        <p class="flex flex-wrap items-center gap-2 text-ui text-fg">
          <span class="font-semibold"
            >{{ 'managementReview.fields.systemAssessment' | transloco }}:</span
          >
          @if (overall(); as o) {
            <app-status-badge
              meaning="compliance"
              [value]="tone(o)"
              [labelKey]="assessmentKey(o)"
            />
            <span class="text-meta text-fg-muted">{{
              'managementReview.criteria.derived' | transloco
            }}</span>
          } @else {
            <span class="text-meta text-fg-muted">{{
              'managementReview.criteria.notDerived' | transloco
            }}</span>
          }
        </p>
        @if (canEdit() && !ai.unavailable() && prompt()) {
          <app-button size="sm" variant="ghost" (click)="askHelp()">
            <app-icon name="spark" [size]="14" />
            {{ 'managementReview.ai.askAssessment' | transloco }}
          </app-button>
        }
      </div>
    </div>
  `,
})
export class AssessmentCriteriaView {
  protected readonly ai = inject(AiAvailability);
  private readonly ask = inject(AskPanelService);

  readonly criteria = input<AssessmentCriteria | null | undefined>(null);
  readonly draft = input<CriteriaDraft>({});
  readonly canEdit = input(false);
  /** The question for "Få hjelp til vurderingen" (translated). */
  readonly prompt = input<string | null>(null);
  readonly draftChange = output<{ criterion: Criterion; value: CriterionValue }>();

  protected readonly uid = `mr-crit-${++nextId}`;
  protected readonly assessments = ASSESSMENTS;
  protected readonly assessmentKey = assessmentKey;
  protected readonly criterionKey = criterionKey;
  protected readonly criterionHintKey = criterionHintKey;
  protected readonly ratingKey = criterionRatingKey;

  protected readonly shown = computed<readonly Criterion[]>(() => {
    const required = this.criteria()?.required ?? [];
    return required.length ? required : CRITERIA.filter((c) => c !== 'strategic_alignment');
  });
  protected readonly overall = computed(
    () =>
      deriveAssessment(this.shown(), this.draft()) ??
      (this.canEdit() ? null : (this.criteria()?.derived ?? null)),
  );

  protected tone(a: Assessment): string {
    return ASSESSMENT_TONE[a];
  }

  protected set(criterion: Criterion, value: CriterionValue): void {
    this.draftChange.emit({ criterion, value });
  }

  protected askHelp(): void {
    const prompt = this.prompt();
    if (prompt) {
      this.ask.showWith(prompt);
    }
  }
}
