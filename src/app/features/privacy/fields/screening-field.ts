import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { SCREENING_CRITERIA, screeningResult } from '../data/privacy.models';

/** The lifecycle word a screening result is coloured as. */
const RESULT_TONE: Readonly<Record<string, string>> = {
  required: 'due',
  recommended: 'received',
  not_required: 'archived',
};

/**
 * The DPIA screening checklist: the nine EDPB criteria as checkboxes, with the live
 * result (two or more met = DPIA required). Until the user ticks something (or the
 * stored screening has ticks) the result reads "not screened yet", never "not
 * required". Datatilsynet's list of processing that always needs a DPIA is named
 * under the list. `rationale` shows the reasons the assistant gave for its ticks.
 */
@Component({
  selector: 'app-privacy-screening-field',
  imports: [TranslocoPipe, FieldHelp, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-ui font-semibold text-fg-muted">
        {{ 'privacy.fields.screening' | transloco }}
      </legend>
      <ul class="grid grid-cols-1 gap-2 md:grid-cols-2">
        @for (c of criteria; track c) {
          <li class="rounded-tile border border-border p-2.5">
            <label class="flex items-start gap-2 text-ui text-fg">
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
                <span class="block text-meta text-fg-muted">
                  {{ 'privacy.criteria.' + c + '.hint' | transloco }}
                </span>
                @if (rationale()[c]; as why) {
                  <span class="mt-1 block text-meta text-accent">
                    {{ 'privacy.dpia.suggestedBecause' | transloco: { reason: why } }}
                  </span>
                }
              </span>
            </label>
          </li>
        }
      </ul>
      <p class="flex flex-wrap items-center gap-2 text-ui text-fg" aria-live="polite">
        @if (touched()) {
          {{ 'privacy.dpia.screeningMet' | transloco: { count: outcome().met.length } }}
          <app-status-badge
            meaning="lifecycle"
            [value]="resultWord()"
            [labelKey]="'privacy.options.screeningResult.' + outcome().result"
            data-testid="screening-result"
          />
        } @else {
          <span class="text-fg-muted" data-testid="screening-untouched">
            {{ 'privacy.dpia.notScreenedYet' | transloco }}
          </span>
        }
      </p>
      <p class="text-meta text-fg-muted">{{ 'privacy.dpia.authorityList' | transloco }}</p>
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
  protected readonly resultWord = computed(() => RESULT_TONE[this.outcome().result] ?? 'archived');
  /** A stored screening with ticks counts as screened; a blank one waits for the user. */
  private readonly interacted = signal(false);
  protected readonly touched = computed(
    () => this.interacted() || Object.values(this.value()).some(Boolean),
  );

  protected toggle(criterion: string, checked: boolean): void {
    this.interacted.set(true);
    this.valueChange.emit({ ...this.value(), [criterion]: checked });
  }
}
