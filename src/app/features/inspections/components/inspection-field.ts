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
  host: { class: 'block' },
  template: `
    <div class="mb-1.5 flex min-h-6 items-center gap-1.5">
      <label [attr.for]="inputId()" class="text-ui font-semibold text-fg-muted">
        {{ labelKey() | transloco }}
        @if (optional()) {
          <span class="font-normal text-fg-subtle">{{
            'inspections.form.optional' | transloco
          }}</span>
        }
      </label>
      @if (help(); as field) {
        <app-field-help scope="inspections" [page]="page()" [field]="field" />
      }
      <span class="ml-auto"><ng-content select="[label-extra]" /></span>
    </div>
    <app-form-field>
      <ng-content />
    </app-form-field>
    @if (hintKey(); as hint) {
      <p class="mt-1 text-meta text-fg-muted" [id]="inputId() + '-hint'">
        {{ hint | transloco: hintParams() }}
      </p>
    }
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
}
