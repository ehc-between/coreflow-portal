import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { blankToNull, todayIso } from '../data/continuity-display';
import { ExerciseCompleteRequest, OUTCOMES, Outcome } from '../data/continuity.models';
import { ContinuityDuration, ContinuityDurationInput } from '../shared/duration';
import { DateInput } from '../../../shared/ui/date-input/date-input';

/**
 * Record the result of an exercise: the date it was held (not in the future), the
 * outcome, the recovery time achieved (compared with the target), the results and
 * the lessons learned. When the achieved time misses the target the dialog says so
 * and proposes "partly successful" (the user can still choose). Completing it updates
 * the plan's last-exercised date and, for an ICT test, the service's test status.
 */
@Component({
  selector: 'app-exercise-complete-dialog',
  imports: [
    DateInput,
    TranslocoPipe,
    Alert,
    Button,
    ContinuityDuration,
    ContinuityDurationInput,
    FieldHelp,
    FormField,
    LocalDayPipe,
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
        <app-form-field
          [label]="'continuity.fields.conductedOn' | transloco"
          inputId="exc-date"
          [required]="true"
          [hint]="validDate() ? (conductedOn() | localDay: 'longDate') : ''"
          [error]="
            showErrors() && !validDate() ? ('continuity.exercises.dateRequired' | transloco) : ''
          "
        >
          <app-date-input
            inputId="exc-date"
            [required]="true"
            [max]="today"
            [invalid]="showErrors() && !validDate()"
            [value]="conductedOn()"
            (valueChange)="conductedOn.set($event ?? '')"
          />
        </app-form-field>
        @if (successCriteria(); as criteria) {
          <div class="rounded-tile border border-border bg-surface-2 px-3 py-2">
            <p class="text-meta font-semibold text-fg-muted">
              {{ 'continuity.fields.successCriteria' | transloco }}
            </p>
            <p class="mt-0.5 text-ui whitespace-pre-line text-fg">{{ criteria }}</p>
          </div>
        }
        <div class="flex flex-col gap-2">
          <app-form-field
            [label]="'continuity.fields.achievedRecovery' | transloco"
            inputId="exc-achieved"
          >
            <app-field-help
              label-suffix
              scope="continuity"
              page="exerciseDetail"
              field="achieved_recovery_minutes"
              [label]="'continuity.fields.achievedRecovery' | transloco"
            />
            <app-continuity-duration-input
              inputId="exc-achieved"
              [value]="achieved()"
              (valueChange)="setAchieved($event)"
            />
            @if (targetRto() !== null) {
              <p hint class="text-meta leading-snug text-fg-subtle">
                {{ 'continuity.exercises.targetRto' | transloco }}:
                <app-continuity-duration [minutes]="targetRto()" />
              </p>
            }
          </app-form-field>
          @if (missed()) {
            <p
              class="rounded-tile border border-warn/30 bg-warn-soft px-3 py-2 text-ui text-warn-ink"
              role="status"
              data-testid="target-missed"
            >
              {{ 'continuity.exercises.targetMissed' | transloco }}
            </p>
          }
        </div>
        <fieldset class="flex flex-col gap-1.5">
          <legend class="mb-1.5 flex min-h-6 items-center text-ui font-semibold text-fg-muted">
            {{ 'continuity.fields.outcome' | transloco }}
            <span class="ml-0.5 text-fail-ink" aria-hidden="true">*</span>
          </legend>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            @for (o of outcomes; track o) {
              <label
                class="flex min-h-10 cursor-pointer items-center gap-2 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg"
              >
                <input
                  type="radio"
                  name="exc-outcome"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [value]="o"
                  [checked]="outcome() === o"
                  (change)="outcome.set(o)"
                />
                {{ 'continuity.outcome.' + o | transloco }}
              </label>
            }
          </div>
          @if (showErrors() && !outcome()) {
            <p class="text-meta font-medium text-fail-ink" role="alert">
              {{ 'continuity.exercises.outcomeRequired' | transloco }}
            </p>
          }
        </fieldset>
        <app-form-field [label]="'continuity.fields.results' | transloco" inputId="exc-results">
          <textarea
            id="exc-results"
            rows="4"
            maxlength="20000"
            [value]="results()"
            (input)="results.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
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
          <app-field-help scope="continuity" page="exerciseDetail" field="lessons_learned" />
        </app-form-field>
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
  readonly successCriteria = input<string | null>(null);
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
  /** The achieved time is longer than the target. */
  protected readonly missed = computed(() => {
    const target = this.targetRto();
    const achieved = this.achieved();
    return target !== null && achieved !== null && achieved > target;
  });

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

  /** A missed target proposes "partly successful" unless the user chose otherwise. */
  protected setAchieved(minutes: number | null): void {
    this.achieved.set(minutes);
    if (this.missed() && (this.outcome() === '' || this.outcome() === 'successful')) {
      this.outcome.set('partially_successful');
    }
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
