import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { FieldHelp } from '../../../shared/guidance/field-help';

/**
 * One labelled control of the deviations forms, laid out exactly like `app-form-field`
 * (docs/ux-guide.md §2.4):
 *
 *   label row (24 px)   Label [*] [?] [ask]   ("?" = guidance `pages.<page>.fields.<help>`)
 *   control             40 px (`plain` leaves custom controls unstyled)
 *   hint                one muted line under the control (optional)
 *   error               "what to fix", announced to screen readers
 *
 *   <app-deviation-form-row labelKey="deviations.create.fields.title" inputId="dev-title"
 *       page="new" help="title" [required]="true" [errorKey]="titleError()" span="full">
 *     <input id="dev-title" … />
 *   </app-deviation-form-row>
 *
 * `span="full"` takes both columns of an `app-form-section` grid.
 */
@Component({
  selector: 'app-deviation-form-row',
  imports: [TranslocoPipe, FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '[class.sm:col-span-2]': "span() === 'full'",
  },
  // The same control styling as `app-form-field`, switchable for custom controls.
  styles: [
    `
      @layer components {
        .cf-field
          ::ng-deep
          input:not(
            [type='checkbox'],
            [type='radio'],
            [type='hidden'],
            [type='range'],
            [type='file'],
            .cf-bare
          ),
        .cf-field ::ng-deep select:not(.cf-bare),
        .cf-field ::ng-deep textarea:not(.cf-bare) {
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
        .cf-field ::ng-deep textarea:not(.cf-bare) {
          height: auto;
          min-height: 80px;
          padding: 10px 12px;
          line-height: 1.5;
          resize: vertical;
        }
        .cf-field ::ng-deep input:not(.cf-bare):focus,
        .cf-field ::ng-deep select:not(.cf-bare):focus,
        .cf-field ::ng-deep textarea:not(.cf-bare):focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
      }
    `,
  ],
  template: `
    <div class="flex flex-col gap-1.5">
      <div class="flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1">
        <label [attr.for]="inputId()" class="text-ui leading-6 font-semibold text-fg-muted">
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
            [label]="label()"
            [requirements]="requirements()"
          />
        }
        <ng-content select="[ask]" />
      </div>
      <div [class.cf-field]="!plain()">
        <ng-content />
      </div>
      @if (hintKey()) {
        <p [id]="inputId() + '-hint'" class="text-meta leading-snug text-fg-subtle">
          {{ hintKey()! | transloco }}
        </p>
      }
      @if (errorKey(); as key) {
        <p class="text-meta leading-snug font-medium text-fail-ink" role="alert">
          {{ key | transloco }}
        </p>
      }
    </div>
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
  /** `full` spans both columns of an `app-form-section` grid. */
  readonly span = input<'half' | 'full'>('half');

  protected readonly label = computed(() => this.language.translate(this.labelKey()));
}
