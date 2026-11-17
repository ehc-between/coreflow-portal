import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { MR_SCOPE } from '../management-review-display';

/**
 * The label row of a form field: the label, the `?` help inline right after it
 * (never on a line of its own) and any extra action projected after that (an
 * "ask about this field" button). Pair it with an `app-form-field` without a
 * label, using the same id:
 *
 *   <app-mr-field-label controlId="mr-title" [label]="'…' | transloco" page="form" field="title" />
 *   <app-form-field inputId="mr-title"><input id="mr-title" … /></app-form-field>
 *
 * With `sr-only` the label is kept for screen readers only (a card heading
 * already names the field), while the help stays visible.
 */
@Component({
  selector: 'app-mr-field-label',
  imports: [FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-1.5 flex min-h-7 flex-wrap items-center gap-1.5 empty:hidden' },
  template: `
    <label [attr.for]="controlId() || null" [class]="labelClass()" [id]="labelId() || null">{{
      label()
    }}</label>
    @if (field()) {
      <app-field-help
        [scope]="scope"
        [page]="page()"
        [field]="field()!"
        [requirements]="requirements()"
      />
    }
    <ng-content />
  `,
})
export class FieldLabel {
  /** Id of the control the label is for. */
  readonly controlId = input<string | null>(null);
  readonly label = input.required<string>();
  /** Id of the label itself (for `aria-labelledby` on groups). */
  readonly labelId = input<string | null>(null);
  /** Guidance page and field of the `?` help (no help without a field). */
  readonly page = input('form');
  readonly field = input<string | null>(null);
  /** Clause refs the field documents ("Dokumenterer: …"), else the guidance JSON. */
  readonly requirements = input<readonly string[] | null>(null);
  /** Hide the label visually (a heading already names the field). */
  readonly srOnly = input(false);

  protected readonly scope = MR_SCOPE;

  protected labelClass(): string {
    return this.srOnly() ? 'sr-only' : 'text-ui font-semibold text-fg-muted';
  }
}
