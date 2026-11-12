import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Badge } from '../../../shared/ui/badge/badge';
import { SCREENING_CRITERIA, screeningResult } from '../data/privacy.models';

/**
 * The DPIA screening checklist: the nine EDPB criteria as checkboxes, with the
 * live result (two or more met = DPIA required). `rationale` shows the reasons
 * the assistant gave when it suggested the ticks.
 */
@Component({
  selector: 'app-privacy-screening-field',
  imports: [TranslocoPipe, FieldHelp, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-[13px] font-semibold text-fg-muted">
        {{ 'privacy.fields.screening' | transloco }}
      </legend>
      <ul class="grid grid-cols-1 gap-2 md:grid-cols-2">
        @for (c of criteria; track c) {
          <li class="rounded-tile border border-border p-2.5">
            <label class="flex items-start gap-2 text-[13px] text-fg">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                [checked]="!!value()[c]"
                [disabled]="disabled()"
                (change)="toggle(c, $any($event.target).checked)"
                [attr.data-testid]="'screening-' + c"
              />
              <span>
                <span class="font-semibold">{{
                  'privacy.criteria.' + c + '.label' | transloco
                }}</span>
                <span class="block text-[12px] text-fg-muted">
                  {{ 'privacy.criteria.' + c + '.hint' | transloco }}
                </span>
                @if (rationale()[c]; as why) {
                  <span class="mt-1 block text-[12px] text-accent">
                    {{ 'privacy.dpia.suggestedBecause' | transloco: { reason: why } }}
                  </span>
                }
              </span>
            </label>
          </li>
        }
      </ul>
      <p class="flex flex-wrap items-center gap-2 text-[13px] text-fg" aria-live="polite">
        {{ 'privacy.dpia.screeningMet' | transloco: { count: outcome().met.length } }}
        <app-badge [tone]="tone()" data-testid="screening-result">
          {{ 'privacy.options.screeningResult.' + outcome().result | transloco }}
        </app-badge>
      </p>
      <app-field-help scope="privacy" page="dpia" field="screening" />
    </fieldset>
  `,
})
export class ScreeningField {
  readonly value = input<Readonly<Record<string, boolean>>>({});
  readonly rationale = input<Readonly<Record<string, string>>>({});
  readonly disabled = input(false);
  readonly valueChange = output<Readonly<Record<string, boolean>>>();

  protected readonly criteria = SCREENING_CRITERIA;
  protected readonly outcome = computed(() => screeningResult(this.value()));
  protected readonly tone = computed(() => {
    const r = this.outcome().result;
    return r === 'required' ? 'warn' : r === 'recommended' ? 'info' : 'neutral';
  });

  protected toggle(criterion: string, checked: boolean): void {
    this.valueChange.emit({ ...this.value(), [criterion]: checked });
  }
}
