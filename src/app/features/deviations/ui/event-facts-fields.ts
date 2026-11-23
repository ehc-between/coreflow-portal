import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../../shared/ask/ask-about';
import { eventTimesErrorKey, nowLocal } from '../deviation-display';
import { DeviationFormRow } from './form-row';

/**
 * The facts of what happened (audit findings 7, 23, 24): when it happened, when it
 * was detected (the clock of authority deadlines starts here), where, and what was
 * done straight away to limit the harm (ISO 10.2 a, "react to the nonconformity").
 * Times are `datetime-local` values in the viewer's time zone; the host converts
 * them to naive UTC. Shared by the create and edit forms.
 */
@Component({
  selector: 'app-deviation-event-facts',
  imports: [TranslocoPipe, AskAbout, DeviationFormRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <app-deviation-form-row
      labelKey="deviations.facts.occurredAt"
      [inputId]="idPrefix() + '-occurred'"
      [page]="page()"
      help="occurred_at"
    >
      <input
        [id]="idPrefix() + '-occurred'"
        type="datetime-local"
        [max]="max"
        [value]="occurred()"
        (change)="occurred.set($any($event.target).value)"
      />
    </app-deviation-form-row>
    <app-deviation-form-row
      labelKey="deviations.facts.detectedAt"
      [inputId]="idPrefix() + '-detected'"
      [page]="page()"
      help="detected_at"
      hintKey="deviations.facts.detectedHint"
    >
      <input
        [id]="idPrefix() + '-detected'"
        type="datetime-local"
        [max]="max"
        [value]="detected()"
        (change)="detected.set($any($event.target).value)"
      />
    </app-deviation-form-row>
    @if (timeError(); as key) {
      <p
        class="-mt-3 text-meta sm:col-span-2 font-medium text-fail-ink"
        role="alert"
        data-testid="facts-error"
      >
        {{ key | transloco }}
      </p>
    }
    <app-deviation-form-row
      span="full"
      labelKey="deviations.facts.location"
      [inputId]="idPrefix() + '-location'"
      [page]="page()"
      help="location"
    >
      <input
        [id]="idPrefix() + '-location'"
        type="text"
        maxlength="255"
        autocomplete="off"
        [placeholder]="'deviations.facts.locationPlaceholder' | transloco"
        [value]="location()"
        (input)="location.set($any($event.target).value)"
      />
    </app-deviation-form-row>
    <app-deviation-form-row
      span="full"
      labelKey="deviations.facts.immediateAction"
      [inputId]="idPrefix() + '-immediate'"
      [page]="page()"
      help="immediate_action"
      hintKey="deviations.facts.immediateHint"
      [requirements]="['hs:10.2']"
    >
      <app-ask-about
        ask
        field="immediate_action"
        [fieldLabel]="'deviations.facts.immediateAction' | transloco"
        [requirements]="['hs:10.2']"
      />
      <textarea
        [id]="idPrefix() + '-immediate'"
        rows="2"
        maxlength="5000"
        [value]="immediateAction()"
        (input)="immediateAction.set($any($event.target).value)"
      ></textarea>
    </app-deviation-form-row>
  `,
})
export class DeviationEventFacts {
  readonly idPrefix = input('dev');
  readonly page = input('new');
  /** `datetime-local` values (local time). */
  readonly occurred = model('');
  readonly detected = model('');
  readonly location = model('');
  readonly immediateAction = model('');

  protected readonly max = nowLocal();
  /** The API's event-time rule, explained before saving. */
  protected readonly timeError = computed(() =>
    eventTimesErrorKey(this.occurred(), this.detected()),
  );
}
