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
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { blankToNull, dayToWire, decisionTone } from '../data/supplier-display';
import {
  APPROVAL_KINDS,
  DECISIONS,
  Decision,
  DecideEvaluationRequest,
  EvaluationKind,
  Recommendation,
} from '../data/supplier.models';

const FROM_RECOMMENDATION: Readonly<Record<Recommendation, Decision>> = {
  approve: 'approved',
  conditional: 'conditional',
  reject: 'rejected',
};

/** Whether the decision form can be sent (conditions are required for a conditional approval). */
export function decisionValid(decision: Decision | '', conditions: string): boolean {
  return !!decision && (decision !== 'conditional' || !!conditions.trim());
}

/**
 * Record the decision on a submitted evaluation: approve, approve with conditions
 * (conditions required) or reject, with notes and an optional next re-evaluation
 * date. The score's recommendation is preselected but only advisory.
 */
@Component({
  selector: 'app-evaluation-decide-dialog',
  imports: [TranslocoPipe, Alert, Badge, Button, FieldHelp, FormField, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'suppliers.decide.title' | transloco"
      [closeLabel]="'common.cancel' | transloco"
      (closed)="cancelled.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); confirm()">
        @if (recommendation(); as rec) {
          <p class="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
            {{ 'suppliers.decide.recommendation' | transloco }}
            <app-badge [tone]="tone(rec)">{{
              'suppliers.recommendation.' + rec | transloco
            }}</app-badge>
          </p>
        }
        <p class="text-[12.5px] text-fg-subtle">{{ 'suppliers.decide.advisory' | transloco }}</p>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 flex items-center gap-1 text-[13px] font-semibold text-fg-muted">
            {{ 'suppliers.decide.decision' | transloco }}
            <app-field-help scope="suppliers" page="evaluation" field="decision" />
          </legend>
          @for (d of decisions; track d) {
            <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
              <input
                type="radio"
                name="ev-decision"
                class="h-4 w-4"
                [value]="d"
                [checked]="decision() === d"
                (change)="decision.set(d)"
              />
              {{ 'suppliers.decision.' + d | transloco }}
            </label>
          }
        </fieldset>
        <app-alert tone="info">
          {{
            (setsStatus() ? 'suppliers.decide.setsStatus' : 'suppliers.decide.recordsOnly')
              | transloco
          }}
        </app-alert>
        @if (decision() === 'conditional') {
          <div>
            <app-form-field [label]="'suppliers.decide.conditions' | transloco" inputId="ev-cond">
              <textarea
                id="ev-cond"
                rows="3"
                maxlength="5000"
                required
                aria-describedby="ev-cond-hint"
                [value]="conditions()"
                (input)="conditions.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
            <p id="ev-cond-hint" class="mt-1 text-[12px] text-fg-subtle">
              {{ 'suppliers.decide.conditionsHint' | transloco }}
            </p>
          </div>
        }
        <app-form-field [label]="'suppliers.decide.notes' | transloco" inputId="ev-notes">
          <textarea
            id="ev-notes"
            rows="3"
            maxlength="5000"
            [value]="notes()"
            (input)="notes.set($any($event.target).value)"
          ></textarea>
        </app-form-field>
        @if (setsStatus() && decision() !== 'rejected') {
          <div>
            <app-form-field
              [label]="'suppliers.decide.nextEvaluation' | transloco"
              inputId="ev-next"
            >
              <input
                id="ev-next"
                type="date"
                aria-describedby="ev-next-hint"
                [value]="nextDay()"
                (input)="nextDay.set($any($event.target).value)"
              />
            </app-form-field>
            <p id="ev-next-hint" class="mt-1 text-[12px] text-fg-subtle">
              {{ 'suppliers.decide.nextEvaluationHint' | transloco }}
            </p>
          </div>
        }
        @if (error(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="cancelled.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()" [disabled]="!valid()">
            {{ 'suppliers.decide.confirm' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class EvaluationDecideDialog {
  readonly open = input(false);
  readonly kind = input.required<EvaluationKind>();
  readonly recommendation = input<Recommendation | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly confirmed = output<DecideEvaluationRequest>();
  readonly cancelled = output<void>();

  protected readonly decisions = DECISIONS;
  protected readonly tone = decisionTone;
  protected readonly decision = signal<Decision | ''>('');
  protected readonly notes = signal('');
  protected readonly conditions = signal('');
  protected readonly nextDay = signal('');
  protected readonly setsStatus = computed(() => APPROVAL_KINDS.includes(this.kind()));
  protected readonly valid = computed(() => decisionValid(this.decision(), this.conditions()));

  constructor() {
    effect(() => {
      if (this.open()) {
        const rec = this.recommendation();
        untracked(() => {
          this.decision.set(rec ? FROM_RECOMMENDATION[rec] : '');
          this.notes.set('');
          this.conditions.set('');
          this.nextDay.set('');
        });
      }
    });
  }

  protected confirm(): void {
    const decision = this.decision();
    if (!decision || !this.valid()) {
      return;
    }
    this.confirmed.emit({
      decision,
      notes: blankToNull(this.notes()),
      conditions: decision === 'conditional' ? blankToNull(this.conditions()) : null,
      next_evaluation_at:
        this.setsStatus() && decision !== 'rejected' ? dayToWire(this.nextDay()) : null,
    });
  }
}
