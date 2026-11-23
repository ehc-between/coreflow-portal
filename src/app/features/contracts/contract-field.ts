import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { FormField, FormFieldSpan } from '../../shared/ui/form-field/form-field';

/**
 * A contract form field (docs/ux-guide.md §2.4): renders through `app-form-field`,
 * so the label sits on top in the label row with the `?` toggletip and the "ask"
 * icon after it, the control gets the shared 40 px styling, and `hint` / `error`
 * show as one muted line / the message under the control.
 *
 *   <app-contract-field [label]="…" inputId="cf-c-notice" helpField="notice_period_days"
 *                       [ask]="'contracts.ask.noticePeriod' | transloco">
 *     <input id="cf-c-notice" … />
 *   </app-contract-field>
 *
 * `span="full"` takes both columns of an `app-form-section` grid.
 */
@Component({
  selector: 'app-contract-field',
  imports: [AskAbout, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '[class.sm:col-span-2]': "span() === 'full'",
  },
  template: `
    <app-form-field
      [label]="label()"
      [inputId]="inputId()"
      [required]="required()"
      [hint]="hint()"
      [error]="error()"
    >
      @if (helpField()) {
        <app-field-help
          label-suffix
          scope="contracts"
          [page]="page()"
          [field]="helpField()!"
          [label]="label()"
        />
      }
      @if (ask()) {
        <app-ask-about
          label-suffix
          [prompt]="ask()"
          [field]="helpField() ?? inputId()"
          [fieldLabel]="label()"
          [requirements]="requirements()"
        />
      }
      <ng-content />
    </app-form-field>
  `,
})
export class ContractField {
  readonly label = input('');
  readonly inputId = input('');
  /** Guidance key (`pages.<page>.fields.<field>`) of the help text. */
  readonly helpField = input<string | null>(null);
  readonly page = input('form');
  /** Translated question for the assistant (shows the "ask" icon). */
  readonly ask = input<string | null>(null);
  readonly requirements = input<readonly string[] | null>(null);
  /** Marks the label required ("*"). */
  readonly required = input(false);
  /** One muted line under the control (already translated). */
  readonly hint = input<string | null | undefined>('');
  /** Validation message under the control (already translated). */
  readonly error = input<string | null | undefined>('');
  /** `full` spans both columns of an `app-form-section` grid. */
  readonly span = input<FormFieldSpan>('half');
}
