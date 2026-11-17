import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One process-form field: the label with its "?" help next to it, the control
 * (projected into `app-form-field`), and a short visible hint underneath, so
 * the most important explanation is always on screen. `[label-extra]` content
 * (for example "Spør om dette") sits at the end of the label row.
 */
@Component({
  selector: 'app-process-field',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-1.5 flex min-h-6 items-center gap-1.5">
      <label [attr.for]="inputId()" class="text-ui font-semibold text-fg-muted">
        {{ labelKey() | transloco }}
        @if (optional()) {
          <span class="font-normal text-fg-subtle">{{
            'processes.form.optional' | transloco
          }}</span>
        }
      </label>
      @if (help()) {
        <app-field-help
          scope="processes"
          page="form"
          [field]="help()!"
          [label]="labelKey() | transloco"
        />
      }
      <span class="ml-auto"><ng-content select="[label-extra]" /></span>
    </div>
    <app-form-field>
      <ng-content />
    </app-form-field>
    @if (hintKey()) {
      <p class="mt-1 text-meta text-fg-muted" [id]="inputId() + '-hint'">
        {{ hintKey()! | transloco }}
      </p>
    }
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
}
