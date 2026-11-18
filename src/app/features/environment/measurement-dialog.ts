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
import { Attachments } from '../../shared/attachments/attachments';
import { Button } from '../../shared/ui/button/button';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import {
  ENTITY_MEASUREMENT,
  MEASUREMENT_SOURCES,
  Measurement,
  MeasurementCreate,
} from './data/environment.models';
import {
  MeasurementFormValue,
  emptyMeasurementForm,
  toMeasurementCreate,
  validateMeasurementForm,
} from './data/form-models';
import { EnvField } from './environment-shared';

/**
 * Record (or correct) one measurement of an indicator: the period it covers (one
 * day to a year), the value in the indicator's unit, where the number comes from
 * (invoice, meter reading, estimate …), and an optional site and note. A saved
 * measurement can carry evidence files (the invoice, a photo of the meter).
 */
@Component({
  selector: 'app-env-measurement-dialog',
  imports: [TranslocoPipe, Attachments, Button, SlideOver, EnvField],
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
          <app-env-field
            labelKey="environment.fields.periodStart"
            inputId="cf-env-ms-start"
            page="metricDetail"
            help="period"
            [required]="true"
            [errorKey]="shown()['period_start']"
          >
            <input
              id="cf-env-ms-start"
              type="date"
              [value]="form().period_start"
              (change)="set('period_start', $any($event.target).value)"
              [attr.aria-invalid]="!!shown()['period_start']"
              data-testid="measurement-start"
            />
          </app-env-field>
          <app-env-field
            labelKey="environment.fields.periodEnd"
            inputId="cf-env-ms-end"
            [errorKey]="shown()['period_end']"
          >
            <input
              id="cf-env-ms-end"
              type="date"
              [value]="form().period_end"
              (change)="set('period_end', $any($event.target).value)"
              [attr.aria-invalid]="!!shown()['period_end']"
              data-testid="measurement-end"
            />
          </app-env-field>
        </div>
        <app-env-field
          labelKey="environment.fields.valueIn"
          [labelParams]="{ unit: unit() }"
          inputId="cf-env-ms-value"
          [required]="true"
          [errorKey]="shown()['value']"
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
        </app-env-field>
        <app-env-field
          labelKey="environment.fields.source"
          inputId="cf-env-ms-source"
          page="metricDetail"
          help="source"
        >
          <select
            id="cf-env-ms-source"
            (change)="set('source', $any($event.target).value)"
            data-testid="measurement-source"
          >
            <option value="" [selected]="!form().source">
              {{ 'environment.form.choose' | transloco }}
            </option>
            @for (s of sources; track s) {
              <option [value]="s" [selected]="form().source === s">
                {{ 'environment.sources.' + s | transloco }}
              </option>
            }
          </select>
        </app-env-field>
        <app-env-field labelKey="environment.fields.site" inputId="cf-env-ms-site">
          <input
            id="cf-env-ms-site"
            type="text"
            maxlength="128"
            [value]="form().site"
            (input)="set('site', $any($event.target).value)"
          />
        </app-env-field>
        <app-env-field labelKey="environment.fields.note" inputId="cf-env-ms-note">
          <textarea
            id="cf-env-ms-note"
            rows="3"
            maxlength="2000"
            [value]="form().note"
            (input)="set('note', $any($event.target).value)"
          ></textarea>
        </app-env-field>

        @if (measurement(); as m) {
          <section class="rounded-tile border border-border p-3" data-testid="measurement-evidence">
            <h3 class="mb-1 text-ui font-semibold text-fg">
              {{ 'environment.measurement.evidence' | transloco }}
            </h3>
            <p class="mb-2 text-meta text-fg-muted">
              {{ 'environment.measurement.evidenceHint' | transloco }}
            </p>
            <app-attachments
              [entityType]="measurementType"
              [entityId]="m.id"
              [canEdit]="m.can_edit"
              [compact]="true"
            />
          </section>
        } @else {
          <p class="text-meta text-fg-muted">
            {{ 'environment.measurement.evidenceAfterSave' | transloco }}
          </p>
        }

        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <app-button variant="secondary" [disabled]="busy()" (click)="cancelled.emit()">
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

  protected readonly sources = MEASUREMENT_SOURCES;
  protected readonly measurementType = ENTITY_MEASUREMENT;

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
                  source: m.source ?? '',
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
