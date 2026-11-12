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
import { FieldHelp } from '../../shared/guidance/field-help';
import { Button } from '../../shared/ui/button/button';
import { FormField } from '../../shared/ui/form-field/form-field';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import { DRILL_KINDS, DRILL_OUTCOMES, DrillCreate } from './data/environment.models';
import { utcToLocal } from './data/environment-display';
import {
  DrillFormValue,
  emptyDrillForm,
  toDrillCreate,
  validateDrillForm,
} from './data/form-models';

/**
 * Record a drill, tabletop exercise or real event for an emergency plan: when
 * it was held, how the response worked, findings and lessons learned, and
 * whether the plan needs revising. Saving completes the earliest open drill task.
 */
@Component({
  selector: 'app-env-drill-dialog',
  imports: [TranslocoPipe, FieldHelp, Button, FormField, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'environment.drill.title' | transloco"
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
        <div>
          <app-form-field [label]="'environment.fields.heldAt' | transloco" inputId="cf-env-d-held">
            <input
              id="cf-env-d-held"
              type="datetime-local"
              [value]="form().held_at"
              (change)="set('held_at', $any($event.target).value)"
              [attr.aria-invalid]="!!shown()['held_at']"
              data-testid="drill-held"
            />
          </app-form-field>
          @if (shown()['held_at']; as key) {
            <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
          }
        </div>
        <div>
          <app-form-field
            [label]="'environment.fields.drillKind' | transloco"
            inputId="cf-env-d-kind"
          >
            <select id="cf-env-d-kind" (change)="set('kind', $any($event.target).value)">
              @for (k of kinds; track k) {
                <option [value]="k" [selected]="form().kind === k">
                  {{ 'environment.drillKinds.' + k | transloco }}
                </option>
              }
            </select>
          </app-form-field>
        </div>
        <fieldset>
          <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
            {{ 'environment.fields.outcome' | transloco }}
          </legend>
          <div class="flex flex-col gap-1.5">
            @for (o of outcomes; track o) {
              <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
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
          @if (shown()['outcome']; as key) {
            <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
          }
          <app-field-help scope="environment" page="planDetail" field="outcome" />
        </fieldset>
        <div>
          <app-form-field
            [label]="'environment.fields.participants' | transloco"
            inputId="cf-env-d-participants"
          >
            <input
              id="cf-env-d-participants"
              type="number"
              min="0"
              inputmode="numeric"
              [value]="form().participants"
              (input)="set('participants', $any($event.target).value)"
              [attr.aria-invalid]="!!shown()['participants']"
            />
          </app-form-field>
          @if (shown()['participants']; as key) {
            <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
          }
        </div>
        <app-form-field
          [label]="'environment.fields.findings' | transloco"
          inputId="cf-env-d-findings"
        >
          <textarea
            id="cf-env-d-findings"
            rows="3"
            maxlength="20000"
            [value]="form().findings"
            (input)="set('findings', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field
          [label]="'environment.fields.lessonsLearned' | transloco"
          inputId="cf-env-d-lessons"
        >
          <textarea
            id="cf-env-d-lessons"
            rows="3"
            maxlength="20000"
            [value]="form().lessons_learned"
            (input)="set('lessons_learned', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <label class="flex items-center gap-2 text-[13.5px] text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="form().plan_revision_needed"
            (change)="set('plan_revision_needed', $any($event.target).checked)"
          />
          {{ 'environment.fields.planRevisionNeeded' | transloco }}
        </label>
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <app-button variant="ghost" [disabled]="busy()" (click)="cancelled.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()" [disabled]="busy()" data-testid="drill-save">
            {{ 'environment.drill.save' | transloco }}
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
