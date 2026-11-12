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
import { Measurement, MeasurementCreate } from './data/environment.models';
import {
  MeasurementFormValue,
  emptyMeasurementForm,
  toMeasurementCreate,
  validateMeasurementForm,
} from './data/form-models';

/**
 * Record (or correct) one measurement of a metric: the period it covers (one
 * day to a year), the value in the metric's unit, and an optional site and note.
 */
@Component({
  selector: 'app-env-measurement-dialog',
  imports: [TranslocoPipe, FieldHelp, Button, FormField, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="
        (measurement() ? 'environment.measurement.editTitle' : 'environment.measurement.title')
          | transloco
      "
      [subtitle]="metricName()"
      [closeLabel]="'environment.common.close' | transloco"
      (closed)="cancelled.emit()"
    >
      <form
        class="flex flex-col gap-4"
        (submit)="$event.preventDefault(); submit()"
        novalidate
        data-testid="measurement-form"
      >
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <app-form-field
              [label]="'environment.fields.periodStart' | transloco"
              inputId="cf-env-ms-start"
            >
              <input
                id="cf-env-ms-start"
                type="date"
                [value]="form().period_start"
                (change)="set('period_start', $any($event.target).value)"
                [attr.aria-invalid]="!!shown()['period_start']"
                data-testid="measurement-start"
              />
            </app-form-field>
            @if (shown()['period_start']; as key) {
              <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-form-field
              [label]="'environment.fields.periodEnd' | transloco"
              inputId="cf-env-ms-end"
            >
              <input
                id="cf-env-ms-end"
                type="date"
                [value]="form().period_end"
                (change)="set('period_end', $any($event.target).value)"
                [attr.aria-invalid]="!!shown()['period_end']"
                data-testid="measurement-end"
              />
            </app-form-field>
            @if (shown()['period_end']; as key) {
              <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
            }
          </div>
        </div>
        <app-field-help scope="environment" page="metricDetail" field="period" />
        <div>
          <app-form-field
            [label]="'environment.fields.valueIn' | transloco: { unit: unit() }"
            inputId="cf-env-ms-value"
          >
            <input
              id="cf-env-ms-value"
              type="text"
              inputmode="decimal"
              [value]="form().value"
              (input)="set('value', $any($event.target).value)"
              [attr.aria-invalid]="!!shown()['value']"
              data-testid="measurement-value"
            />
          </app-form-field>
          @if (shown()['value']; as key) {
            <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
          }
        </div>
        <app-form-field [label]="'environment.fields.site' | transloco" inputId="cf-env-ms-site">
          <input
            id="cf-env-ms-site"
            type="text"
            maxlength="128"
            [value]="form().site"
            (input)="set('site', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'environment.fields.note' | transloco" inputId="cf-env-ms-note">
          <textarea
            id="cf-env-ms-note"
            rows="3"
            maxlength="2000"
            [value]="form().note"
            (input)="set('note', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <app-button variant="ghost" [disabled]="busy()" (click)="cancelled.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button
            type="submit"
            [loading]="busy()"
            [disabled]="busy()"
            data-testid="measurement-save"
          >
            {{ 'common.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class EnvMeasurementDialog {
  readonly open = input(false);
  readonly busy = input(false);
  readonly unit = input('');
  readonly metricName = input('');
  /** The measurement being corrected, or null to record a new one. */
  readonly measurement = input<Measurement | null>(null);

  readonly saved = output<MeasurementCreate>();
  readonly cancelled = output<void>();

  protected readonly form = signal<MeasurementFormValue>(emptyMeasurementForm());
  private readonly attempted = signal(false);
  protected readonly errors = computed(() => validateMeasurementForm(this.form()));
  protected readonly shown = computed(() => {
    const errors = this.errors();
    return this.attempted()
      ? errors
      : Object.fromEntries(Object.entries(errors).filter(([k]) => k === 'period_end'));
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const m = this.measurement();
        untracked(() => {
          this.attempted.set(false);
          this.form.set(
            m
              ? {
                  period_start: m.period_start,
                  period_end: m.period_end,
                  value: String(m.value),
                  site: m.site ?? '',
                  note: m.note ?? '',
                }
              : emptyMeasurementForm(),
          );
        });
      }
    });
  }

  protected set<K extends keyof MeasurementFormValue>(
    key: K,
    value: MeasurementFormValue[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected submit(): void {
    this.attempted.set(true);
    if (this.busy() || Object.keys(this.errors()).length) {
      return;
    }
    this.saved.emit(toMeasurementCreate(this.form()));
  }
}
