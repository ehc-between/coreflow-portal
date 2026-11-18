import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldHelp } from '../../../shared/guidance/field-help';

/**
 * One labelled control of the deviations forms:
 *
 *   label (+ "*" when required) · "?" help (guidance `pages.<page>.fields.<help>`) · [ask]
 *   one-line hint (optional, always visible)
 *   the control (`app-form-field` styling; `plain` leaves custom controls unstyled)
 *   the error ("what to fix"), announced to screen readers
 *
 *   <app-deviation-form-row labelKey="deviations.create.fields.title" inputId="dev-title"
 *       page="new" help="title" [required]="true" [errorKey]="titleError()">
 *     <input id="dev-title" … />
 *   </app-deviation-form-row>
 */
@Component({
  selector: 'app-deviation-form-row',
  imports: [TranslocoPipe, FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  // The same control styling as `app-form-field`, switchable for custom controls.
  styles: [
    `
      .cf-field ::ng-deep input:not([type='checkbox']):not([type='radio']),
      .cf-field ::ng-deep select,
      .cf-field ::ng-deep textarea {
        width: 100%;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-family: inherit;
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .cf-field ::ng-deep textarea {
        height: auto;
        padding: 10px 12px;
      }
      .cf-field ::ng-deep input:focus,
      .cf-field ::ng-deep select:focus,
      .cf-field ::ng-deep textarea:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
  template: `
    <div class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <label [attr.for]="inputId()" class="text-ui font-semibold text-fg-muted">
        {{ label() }}
        @if (required()) {
          <span class="text-fail-ink" aria-hidden="true">*</span>
          <span class="sr-only">({{ 'deviations.form.requiredSr' | transloco }})</span>
        }
      </label>
      @if (help()) {
        <app-field-help
          scope="deviations"
          [page]="page()"
          [field]="help()!"
          [requirements]="requirements()"
        />
      }
      <ng-content select="[ask]" />
    </div>
    @if (hintKey()) {
      <p [id]="inputId() + '-hint'" class="mb-1.5 text-meta text-fg-muted">
        {{ hintKey()! | transloco }}
      </p>
    }
    <div [class.cf-field]="!plain()">
      <ng-content />
    </div>
    @if (errorKey(); as key) {
      <p class="mt-1 text-meta font-medium text-fail-ink" role="alert">{{ key | transloco }}</p>
    }
  `,
})
export class DeviationFormRow {
  private readonly language = inject(LanguageService);

  readonly labelKey = input.required<string>();
  readonly inputId = input.required<string>();
  /** Guidance page key (`new`, `detail`, `types` …). */
  readonly page = input('new');
  /** Field key in the guidance page; no help when unset. */
  readonly help = input<string | null>(null);
  /** Requirements the field documents ("Dokumenterer: …" under the help). */
  readonly requirements = input<readonly string[] | null>(null);
  readonly required = input(false);
  /** A short, always visible hint under the label. */
  readonly hintKey = input<string | null>(null);
  /** What to fix, shown under the control. */
  readonly errorKey = input<string | null>(null);
  /** Do not wrap the control in `app-form-field` (pickers, checkbox groups). */
  readonly plain = input(false);

  protected readonly label = computed(() => this.language.translate(this.labelKey()));
}
