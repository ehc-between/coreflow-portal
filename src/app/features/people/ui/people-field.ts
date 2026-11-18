import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One People form field: the label (with a required marker or "valgfritt") and its
 * "?" help on the same row, the control (projected into `app-form-field`), a short
 * always-visible hint and the error message. `[label-extra]` content (e.g. "Spør")
 * sits at the end of the label row.
 */
@Component({
  selector: 'app-people-field',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-1.5 flex min-h-6 flex-wrap items-center gap-1.5">
      <label [attr.for]="inputId()" class="text-ui font-semibold text-fg-muted">
        {{ labelKey() | transloco }}
        @if (required()) {
          <span class="text-fail" aria-hidden="true">*</span>
          <span class="sr-only">{{ 'people.form.required' | transloco }}</span>
        }
      </label>
      @if (help()) {
        <app-field-help [scope]="'people'" [page]="page()" [field]="help()!" />
      }
      <span class="ml-auto"><ng-content select="[label-extra]" /></span>
    </div>
    <app-form-field>
      <ng-content />
    </app-form-field>
    @if (error()) {
      <p class="mt-1 text-meta text-fail" [id]="inputId() + '-err'" role="alert">
        {{ error()! | transloco }}
      </p>
    } @else if (hintKey()) {
      <p class="mt-1 text-meta text-fg-muted" [id]="inputId() + '-hint'">
        {{ hintKey()! | transloco: hintParams() }}
      </p>
    }
  `,
})
export class PeopleField {
  readonly labelKey = input.required<string>();
  readonly inputId = input.required<string>();
  /** Guidance page of the help (`pages.<page>.fields.<help>`). */
  readonly page = input('form');
  readonly help = input<string | null>(null);
  readonly hintKey = input<string | null>(null);
  readonly hintParams = input<Record<string, unknown> | undefined>(undefined);
  readonly required = input(false);
  /** i18n key of the error to show instead of the hint. */
  readonly error = input<string | null | undefined>(null);
}
