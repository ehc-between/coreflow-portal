import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField, type FormFieldSpan } from '../../../shared/ui/form-field/form-field';

/**
 * One labelled form control of the M01 forms on the shared form anatomy
 * (docs/ux-guide.md §2.4): label row (label, "*", `?` help from guidance
 * `pages.<page>.fields.<help>`) → control → one muted hint line under it.
 * `span="full"` takes both columns of an `app-form-section` grid.
 *
 *   <app-context-form-row labelKey="context.fields.title" inputId="f-title"
 *       page="policies-form" help="title" [required]="true" hintKey="context.form.hints.title">
 *     <input id="f-title" … />
 *   </app-context-form-row>
 */
@Component({
  selector: 'app-context-form-row',
  imports: [TranslocoPipe, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0', '[class.sm:col-span-2]': "span() === 'full'" },
  template: `
    <app-form-field
      [label]="label()"
      [inputId]="inputId()"
      [required]="required()"
      [hint]="hintKey() ? (hintKey()! | transloco) : ''"
    >
      @if (help()) {
        <app-field-help
          label-suffix
          scope="context"
          [page]="page()"
          [field]="help()!"
          [label]="label()"
        />
      }
      <ng-content />
    </app-form-field>
  `,
})
export class FormRow {
  private readonly language = inject(LanguageService);

  readonly labelKey = input.required<string>();
  readonly inputId = input.required<string>();
  /** Guidance page key (e.g. `policies-form`). */
  readonly page = input('');
  /** Field key in the guidance page; no help when unset. */
  readonly help = input<string | null>(null);
  /** Show the required marker. */
  readonly required = input(false);
  /** A short hint under the control (the longer help is behind "?"). */
  readonly hintKey = input<string | null>(null);
  /** `full` spans both columns of an `app-form-section` grid. */
  readonly span = input<FormFieldSpan>('half');

  protected readonly label = computed(() => this.language.translate(this.labelKey()));
}
