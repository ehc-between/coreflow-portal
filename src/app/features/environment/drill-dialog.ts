import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../shared/ui/button/button';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { DRILL_KINDS, DRILL_OUTCOMES, DrillCreate } from './data/environment.models';
import { utcToLocal } from './data/environment-display';
import {
  DrillFormValue,
  drillHeadCount,
  emptyDrillForm,
  toDrillCreate,
  validateDrillForm,
} from './data/form-models';
import { EnvField } from './environment-shared';
import { EnvPeoplePicker } from './people-picker';

/**
 * Record a drill, tabletop exercise or real event for an emergency plan: the type
 * first (the title and the save button follow it), when it happened, how well the
 * response worked, who took part (members of the organisation plus a number of
 * others), findings, lessons learned, and whether the plan must be revised (which
 * creates a revision task for the plan owner). Saving completes the earliest open
 * drill task.
 */
@Component({
  selector: 'app-env-drill-dialog',
  imports: [TranslocoPipe, Button, SlideOver, EnvField, EnvPeoplePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'environment.drill.titles.' + form().kind | transloco"
      [subtitle]="planTitle()"
      [closeLabel]="'environment.common.close' | transloco"
      (closed)="cancelled.emit()"
    >
      <form
        class="flex flex-col gap-4"
        (submit)="$event.preventDefault(); submit()"
        novalidate
        data-testid="drill-form"
      >
        <app-env-field
          labelKey="environment.fields.drillKind"
          inputId="cf-env-d-kind"
          page="planDetail"
          help="kind"
          [legend]="true"
        >
          <div
            class="grid grid-cols-1 gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-labelledby="cf-env-d-kind-label"
          >
            @for (k of kinds; track k) {
              <label
                class="flex cursor-pointer items-center gap-2 rounded-tile border px-3 py-2 text-ui"
                [class]="
                  form().kind === k
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-border text-fg'
                "
              >
                <input
                  type="radio"
                  name="cf-env-d-kind"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [value]="k"
                  [checked]="form().kind === k"
                  (change)="set('kind', k)"
                  [attr.data-testid]="'drill-kind-' + k"
                />
                {{ 'environment.drillKinds.' + k | transloco }}
              </label>
            }
          </div>
        </app-env-field>

        <app-env-field
          [labelKey]="
            form().kind === 'real_event'
              ? 'environment.fields.happenedAt'
              : 'environment.fields.heldAt'
          "
          inputId="cf-env-d-held"
          [required]="true"
          [errorKey]="shown()['held_at']"
        >
          <input
            id="cf-env-d-held"
            type="datetime-local"
            [value]="form().held_at"
            (change)="set('held_at', $any($event.target).value)"
            [attr.aria-invalid]="!!shown()['held_at']"
            data-testid="drill-held"
          />
        </app-env-field>

        <app-env-field
          labelKey="environment.fields.outcome"
          inputId="cf-env-d-outcome"
          page="planDetail"
          help="outcome"
          [required]="true"
          [legend]="true"
          [errorKey]="shown()['outcome']"
        >
          <div
            class="flex flex-col gap-1.5"
            role="radiogroup"
            aria-labelledby="cf-env-d-outcome-label"
          >
            @for (o of outcomes; track o) {
              <label class="inline-flex items-center gap-2 text-body text-fg">
                <input
                  type="radio"
                  name="cf-env-d-outcome"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [value]="o"
                  [checked]="form().outcome === o"
                  (change)="set('outcome', o)"
                  [attr.data-testid]="'drill-outcome-' + o"
                />
                {{ 'environment.outcomes.' + o | transloco }}
              </label>
            }
          </div>
        </app-env-field>

        <app-env-field
          labelKey="environment.fields.participants"
          inputId="cf-env-d-people"
          page="planDetail"
          help="participants"
          hintKey="environment.drill.participantsHint"
        >
          <app-env-people-picker
            inputId="cf-env-d-people"
            describedBy="cf-env-d-people-hint"
            [value]="form().participant_user_ids"
            (valueChange)="set('participant_user_ids', $event)"
          />
        </app-env-field>
        <app-env-field
          labelKey="environment.fields.otherParticipants"
          inputId="cf-env-d-others"
          [errorKey]="shown()['others']"
        >
          <input
            id="cf-env-d-others"
            type="number"
            min="0"
            inputmode="numeric"
            [value]="form().others"
            (input)="set('others', $any($event.target).value)"
            [attr.aria-invalid]="!!shown()['others']"
          />
        </app-env-field>
        @if (headCount(); as n) {
          <p class="-mt-2 text-meta text-fg-muted">
            {{ 'environment.drill.headCount' | transloco: { count: n } }}
          </p>
        }

        <app-env-field
          labelKey="environment.fields.findings"
          inputId="cf-env-d-findings"
          page="planDetail"
          help="findings"
        >
          <textarea
            id="cf-env-d-findings"
            rows="3"
            maxlength="20000"
            [value]="form().findings"
            (input)="set('findings', $any($event.target).value)"
          ></textarea>
        </app-env-field>
        <app-env-field labelKey="environment.fields.lessonsLearned" inputId="cf-env-d-lessons">
          <textarea
            id="cf-env-d-lessons"
            rows="3"
            maxlength="20000"
            [value]="form().lessons_learned"
            (input)="set('lessons_learned', $any($event.target).value)"
          ></textarea>
        </app-env-field>
        <label class="flex items-start gap-2 text-body text-fg">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            [checked]="form().plan_revision_needed"
            (change)="set('plan_revision_needed', $any($event.target).checked)"
            data-testid="drill-revision"
          />
          <span>
            {{ 'environment.fields.planRevisionNeeded' | transloco }}
            <span class="block text-meta text-fg-muted">{{
              'environment.drill.revisionHint' | transloco
            }}</span>
          </span>
        </label>
        @if (form().kind === 'real_event') {
          <p
            class="rounded-tile border border-info/30 bg-info-soft px-3 py-2 text-meta text-info-ink"
          >
            {{ 'environment.drill.realEventHint' | transloco }}
          </p>
        }

        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <app-button variant="secondary" [disabled]="busy()" (click)="cancelled.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()" [disabled]="busy()" data-testid="drill-save">
            {{ 'environment.drill.save.' + form().kind | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class EnvDrillDialog {
  readonly open = input(false);
  readonly busy = input(false);
  readonly planTitle = input('');

  readonly saved = output<DrillCreate>();
  readonly cancelled = output<void>();

  protected readonly kinds = DRILL_KINDS;
  protected readonly outcomes = DRILL_OUTCOMES;

  protected readonly form = signal<DrillFormValue>(emptyDrillForm());
  private readonly attempted = signal(false);
  protected readonly errors = computed(() => validateDrillForm(this.form()));
  protected readonly shown = computed(() => (this.attempted() ? this.errors() : {}));
  protected readonly headCount = computed(() => drillHeadCount(this.form()));

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.attempted.set(false);
          this.form.set(emptyDrillForm(utcToLocal(new Date().toISOString().slice(0, 19))));
        });
      }
    });
  }

  protected set<K extends keyof DrillFormValue>(key: K, value: DrillFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected submit(): void {
    this.attempted.set(true);
    if (this.busy() || Object.keys(this.errors()).length) {
      return;
    }
    this.saved.emit(toDrillCreate(this.form()));
  }
}
