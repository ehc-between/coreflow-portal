import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One labelled form control of the M01 forms:
 *
 *   label (+ "*" when required) · "?" help (guidance `pages.<page>.fields.<help>`)
 *   one-line hint (optional, always visible)
 *   the control (`app-form-field` styling)
 *
 * The help sits next to the label, so it is read before typing, and its button
 * is named after the field ("Hjelp: Tittel").
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
  host: { class: 'block' },
  template: `
    <div class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <label [attr.for]="inputId()" class="text-ui font-semibold text-fg-muted">
        {{ label() }}
        @if (required()) {
          <span class="text-fail-ink" aria-hidden="true">*</span>
          <span class="sr-only">({{ 'context.form.requiredSr' | transloco }})</span>
        }
      </label>
      @if (help()) {
        <app-field-help scope="context" [page]="page()" [field]="help()!" [fieldLabel]="label()" />
      }
    </div>
    @if (hintKey()) {
      <p [id]="inputId() + '-hint'" class="mb-1.5 text-meta text-fg-muted">
        {{ hintKey()! | transloco }}
      </p>
    }
    <app-form-field [inputId]="inputId()">
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
  /** A short always-visible hint under the label (the longer help is behind "?"). */
  readonly hintKey = input<string | null>(null);

  protected readonly label = computed(() => this.language.translate(this.labelKey()));
}
