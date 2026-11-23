import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One process-form field on the shared `app-form-field`: the label row (label,
 * "(valgfritt)", the "?" toggletip and `[label-extra]` such as "Spør om dette" at
 * the end), the control, and a one-line hint underneath.
 */
@Component({
  selector: 'app-process-field',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', '[class.sm:col-span-2]': "span() === 'full'" },
  template: `
    <app-form-field
      [label]="labelKey() | transloco"
      [inputId]="inputId()"
      [required]="required()"
      [hint]="hintKey() ? (hintKey()! | transloco) : ''"
      [error]="error()"
    >
      @if (optional()) {
        <span label-suffix class="text-ui leading-6 text-fg-subtle">{{
          'processes.form.optional' | transloco
        }}</span>
      }
      @if (help()) {
        <app-field-help
          label-suffix
          scope="processes"
          page="form"
          [field]="help()!"
          [label]="labelKey() | transloco"
        />
      }
      <span label-suffix class="ml-auto empty:hidden"><ng-content select="[label-extra]" /></span>
      <ng-content />
    </app-form-field>
  `,
})
export class ProcessField {
  readonly labelKey = input.required<string>();
  readonly inputId = input.required<string>();
  /** Guidance field key (`pages.form.fields.<help>`) for the "?" toggletip. */
  readonly help = input<string | null>(null);
  /** Always-visible one-line hint. */
  readonly hintKey = input<string | null>(null);
  readonly optional = input(false);
  readonly required = input(false);
  /** Validation message (already translated). */
  readonly error = input<string | null | undefined>('');
  /** `full` spans both columns of the section grid. */
  readonly span = input<'half' | 'full'>('half');
}
