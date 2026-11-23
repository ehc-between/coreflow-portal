import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One inspections form field: the label with its "?" help right next to it (never
 * on a line of its own), the control (projected into `app-form-field` for the
 * shared styling), and an optional always-visible hint underneath. `[label-extra]`
 * (e.g. "Spør om dette") sits at the end of the label row.
 */
@Component({
  selector: 'app-inspection-field',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '[class.sm:col-span-2]': "span() === 'full'",
  },
  template: `
    <app-form-field
      [label]="labelKey() | transloco"
      [inputId]="inputId()"
      [required]="required()"
      [hint]="hintKey() ? (hintKey()! | transloco: hintParams()) : ''"
      [error]="errorKey() ? (errorKey()! | transloco) : ''"
    >
      <span label-suffix class="inline-flex items-center gap-1.5">
        @if (optional()) {
          <span class="text-ui font-normal text-fg-subtle">{{
            'inspections.form.optional' | transloco
          }}</span>
        }
        @if (help(); as field) {
          <app-field-help
            scope="inspections"
            [page]="page()"
            [field]="field"
            [label]="labelKey() | transloco"
          />
        }
      </span>
      <span label-suffix class="ml-auto empty:hidden"><ng-content select="[label-extra]" /></span>
      <ng-content />
    </app-form-field>
  `,
})
export class InspectionField {
  readonly labelKey = input.required<string>();
  readonly inputId = input.required<string>();
  /** Guidance page (`pages.<page>.fields.<help>`). */
  readonly page = input('form');
  /** Guidance field key for the "?" toggletip (and "Dokumenterer: …"). */
  readonly help = input<string | null>(null);
  /** Always-visible one-line hint. */
  readonly hintKey = input<string | null>(null);
  readonly hintParams = input<Record<string, unknown> | undefined>(undefined);
  readonly optional = input(false);
  /** Mark the label as required ("*"). */
  readonly required = input(false);
  /** i18n key of the error shown under the control. */
  readonly errorKey = input<string | null>(null);
  /** Grid span inside an `app-form-section`. */
  readonly span = input<'half' | 'full'>('half');
}
