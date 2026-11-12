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
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import {
  ChangeStepField,
  blankToNull,
  canEditChangeField,
  dayToTimestamp,
  missingStepFields,
} from '../data/asset-display';
import {
  ChangeDetail,
  REVIEW_OUTCOMES,
  RISK_LEVELS,
  UpdateChangeRequest,
} from '../data/asset.models';

const LABELS: Readonly<Record<ChangeStepField, string>> = {
  description: 'description',
  reason: 'reason',
  impact_assessment: 'impactAssessment',
  risk_level: 'riskLevel',
  implementation_plan: 'implementationPlan',
  implemented_at: 'implementedAt',
  review_outcome: 'reviewOutcome',
};

/** The PATCH body of the step values the user filled in (blank ones are left out). */
export function stepPatch(values: Readonly<Record<string, string>>): UpdateChangeRequest {
  const out: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(values)) {
    if (field === 'implemented_at') {
      const ts = dayToTimestamp(raw);
      if (ts) {
        out[field] = ts;
      }
    } else {
      const value = blankToNull(raw);
      if (value) {
        out[field] = value;
      }
    }
  }
  return out as UpdateChangeRequest;
}

/**
 * "What the next step needs": the change-request fields the next forward
 * transition requires (submit needs a description and reason, approval needs the
 * impact assessment, risk level and implementation plan, completing needs the
 * implementation date, closing needs the review outcome), editable in place. The
 * workflow reads these from the change itself, so they are saved before the step.
 */
@Component({
  selector: 'app-change-step',
  imports: [TranslocoPipe, Button, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing().length) {
      <section
        class="rounded-card border border-warn/40 bg-warn-soft/40 p-4"
        [attr.aria-label]="'assets.changeStep.title' | transloco"
        data-testid="change-step"
      >
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'assets.changeStep.title' | transloco }}
        </h2>
        <p class="mt-1 mb-3 text-[13px] text-fg-muted">
          {{ 'assets.changeStep.intro.' + change().status | transloco }}
        </p>
        @if (editable()) {
          <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); save()" novalidate>
            @for (field of missing(); track field) {
              <div>
                <app-field-help scope="assets" page="changeForm" [field]="field" />
                <app-form-field
                  [label]="'assets.fields.' + labels[field] | transloco"
                  [inputId]="'step-' + field"
                >
                  @switch (field) {
                    @case ('risk_level') {
                      <select
                        [id]="'step-' + field"
                        (change)="set(field, $any($event.target).value)"
                      >
                        <option value="" [selected]="!values()[field]">
                          {{ 'assets.common.choose' | transloco }}
                        </option>
                        @for (r of risks; track r) {
                          <option [value]="r" [selected]="values()[field] === r">
                            {{ 'assets.criticality.' + r | transloco }}
                          </option>
                        }
                      </select>
                    }
                    @case ('review_outcome') {
                      <select
                        [id]="'step-' + field"
                        (change)="set(field, $any($event.target).value)"
                      >
                        <option value="" [selected]="!values()[field]">
                          {{ 'assets.common.choose' | transloco }}
                        </option>
                        @for (o of outcomes; track o) {
                          <option [value]="o" [selected]="values()[field] === o">
                            {{ 'assets.reviewOutcome.' + o | transloco }}
                          </option>
                        }
                      </select>
                    }
                    @case ('implemented_at') {
                      <input
                        [id]="'step-' + field"
                        type="date"
                        [value]="values()[field] ?? ''"
                        (input)="set(field, $any($event.target).value)"
                      />
                    }
                    @default {
                      <textarea
                        [id]="'step-' + field"
                        rows="3"
                        maxlength="10000"
                        [placeholder]="
                          'assets.changeForm.placeholders.' + labels[field] | transloco
                        "
                        [value]="values()[field] ?? ''"
                        (input)="set(field, $any($event.target).value)"
                      ></textarea>
                    }
                  }
                </app-form-field>
              </div>
            }
            <div class="flex justify-end">
              <app-button type="submit" size="sm" [loading]="busy()" [disabled]="!filled()">
                {{ 'assets.changeStep.save' | transloco }}
              </app-button>
            </div>
          </form>
        } @else {
          <ul class="list-disc pl-5 text-[13px] text-fg">
            @for (field of missing(); track field) {
              <li>{{ 'assets.fields.' + labels[field] | transloco }}</li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class ChangeStep {
  readonly change = input.required<ChangeDetail>();
  readonly canWrite = input(false);
  readonly busy = input(false);
  readonly saved = output<UpdateChangeRequest>();

  protected readonly labels = LABELS;
  protected readonly risks = RISK_LEVELS;
  protected readonly outcomes = REVIEW_OUTCOMES;
  protected readonly values = signal<Readonly<Record<string, string>>>({});

  protected readonly missing = computed(() =>
    this.change().pending_approval ? [] : missingStepFields(this.change()),
  );
  protected readonly editable = computed(
    () => this.canWrite() && this.missing().every((f) => canEditChangeField(this.change(), f)),
  );
  protected readonly filled = computed(() => Object.keys(stepPatch(this.values())).length > 0);

  constructor() {
    effect(() => {
      this.change();
      untracked(() => this.values.set({}));
    });
  }

  protected set(field: string, value: string): void {
    this.values.update((v) => ({ ...v, [field]: value }));
  }

  protected save(): void {
    const patch = stepPatch(this.values());
    if (Object.keys(patch).length) {
      this.saved.emit(patch);
    }
  }
}
