import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { blankToNull, todayIso } from '../data/continuity-display';
import { ExerciseCompleteRequest, OUTCOMES, Outcome } from '../data/continuity.models';
import { ContinuityDuration, ContinuityDurationInput } from '../shared/duration';

/**
 * Record the result of an exercise: the date it was held (not in the future), the
 * outcome, the recovery time achieved (compared with the target RTO), the results
 * and the lessons learned. Completing it updates the plan's last-exercised date and,
 * for an ICT test, the service's test status.
 */
@Component({
  selector: 'app-exercise-complete-dialog',
  imports: [
    TranslocoPipe,
    Alert,
    Button,
    ContinuityDuration,
    ContinuityDurationInput,
    FieldHelp,
    FormField,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'continuity.exercises.completeTitle' | transloco"
      [closeLabel]="'continuity.common.close' | transloco"
      (closed)="cancelled.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()" novalidate>
        <app-form-field [label]="'continuity.fields.conductedOn' | transloco" inputId="exc-date">
          <input
            id="exc-date"
            type="date"
            required
            [max]="today"
            [attr.aria-invalid]="showErrors() && !validDate()"
            [value]="conductedOn()"
            (input)="conductedOn.set($any($event.target).value)"
          />
        </app-form-field>
        @if (showErrors() && !validDate()) {
          <p class="text-[12px] text-fail" role="alert">
            {{ 'continuity.exercises.dateRequired' | transloco }}
          </p>
        }
        <fieldset>
          <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
            {{ 'continuity.fields.outcome' | transloco }}
          </legend>
          <div class="flex flex-col gap-1.5">
            @for (o of outcomes; track o) {
              <label class="flex items-center gap-2 text-[13.5px] text-fg">
                <input
                  type="radio"
                  name="exc-outcome"
                  class="h-4 w-4"
                  [value]="o"
                  [checked]="outcome() === o"
                  (change)="outcome.set(o)"
                />
                {{ 'continuity.outcome.' + o | transloco }}
              </label>
            }
          </div>
          @if (showErrors() && !outcome()) {
            <p class="mt-1 text-[12px] text-fail" role="alert">
              {{ 'continuity.exercises.outcomeRequired' | transloco }}
            </p>
          }
        </fieldset>
        <div>
          <div class="flex items-center gap-1">
            <app-field-help
              scope="continuity"
              page="exerciseDetail"
              field="achieved_recovery_minutes"
            />
          </div>
          <app-form-field
            [label]="'continuity.fields.achievedRecovery' | transloco"
            inputId="exc-achieved"
          >
            <app-continuity-duration-input
              inputId="exc-achieved"
              [value]="achieved()"
              (valueChange)="achieved.set($event)"
            />
          </app-form-field>
          @if (targetRto() !== null) {
            <p class="mt-1 text-[12px] text-fg-subtle">
              {{ 'continuity.exercises.targetRto' | transloco }}:
              <app-continuity-duration [minutes]="targetRto()" />
            </p>
          }
        </div>
        <app-form-field [label]="'continuity.fields.results' | transloco" inputId="exc-results">
          <textarea
            id="exc-results"
            rows="4"
            maxlength="20000"
            [value]="results()"
            (input)="results.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
        <div>
          <div class="flex items-center gap-1">
            <app-field-help scope="continuity" page="exerciseDetail" field="lessons_learned" />
          </div>
          <app-form-field
            [label]="'continuity.fields.lessonsLearned' | transloco"
            inputId="exc-lessons"
          >
            <textarea
              id="exc-lessons"
              rows="4"
              maxlength="20000"
              [value]="lessons()"
              (input)="lessons.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
        </div>
        @if (error(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="cancelled.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()">
            {{ 'continuity.exercises.complete' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class ExerciseCompleteDialog {
  readonly open = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly targetRto = input<number | null>(null);
  readonly confirmed = output<ExerciseCompleteRequest>();
  readonly cancelled = output<void>();

  protected readonly outcomes = OUTCOMES;
  protected readonly today = todayIso();
  protected readonly conductedOn = signal(this.today);
  protected readonly outcome = signal<Outcome | ''>('');
  protected readonly achieved = signal<number | null>(null);
  protected readonly results = signal('');
  protected readonly lessons = signal('');
  protected readonly showErrors = signal(false);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.conductedOn.set(todayIso());
        this.outcome.set('');
        this.achieved.set(null);
        this.results.set('');
        this.lessons.set('');
        this.showErrors.set(false);
      }
    });
  }

  protected validDate(): boolean {
    const day = this.conductedOn();
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= todayIso();
  }

  protected submit(): void {
    const outcome = this.outcome();
    if (!this.validDate() || !outcome) {
      this.showErrors.set(true);
      return;
    }
    this.confirmed.emit({
      conducted_on: this.conductedOn(),
      outcome,
      achieved_recovery_minutes: this.achieved(),
      results: blankToNull(this.results()),
      lessons_learned: blankToNull(this.lessons()),
    });
  }
}
