import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField } from '../../../shared/ui/form-field/form-field';

/**
 * One recruitment form field: the label (with a required marker), the `?` help and
 * the "ask" icon on the same row as the label (beginners see the help as text under
 * the control instead), the control (projected into `app-form-field` for the shared
 * styling), a short always-visible hint and the error message.
 *
 *   <app-recruitment-field labelKey="recruitment.fields.title" inputId="req-title"
 *       page="requisitionForm" help="title" [required]="true" [error]="errors().title">
 *     <input id="req-title" … />
 *   </app-recruitment-field>
 */
@Component({
  selector: 'app-recruitment-field',
  imports: [TranslocoPipe, AskAbout, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mb-1.5 flex min-h-6 flex-wrap items-center gap-1.5">
      <label [attr.for]="inputId()" class="text-ui font-semibold text-fg-muted">
        {{ labelKey() | transloco }}
        @if (required()) {
          <span class="text-fail" aria-hidden="true">*</span>
          <span class="sr-only">{{ 'recruitment.form.required' | transloco }}</span>
        }
      </label>
      @if (help() && !beginner()) {
        <app-field-help
          scope="recruitment"
          [page]="page()"
          [field]="help()!"
          [requirements]="requirements()"
        />
      }
      @if (ask()) {
        <app-ask-about
          [prompt]="ask()"
          [field]="help() ?? inputId()"
          [fieldLabel]="labelKey() | transloco"
          [requirements]="requirements()"
        />
      }
      <span class="ml-auto"><ng-content select="[label-extra]" /></span>
    </div>
    <app-form-field [inputId]="inputId()"><ng-content /></app-form-field>
    @if (error()) {
      <p class="mt-1 text-meta text-fail" [id]="inputId() + '-err'" role="alert">
        {{ error()! | transloco }}
      </p>
    } @else if (hintKey()) {
      <p class="mt-1 text-meta text-fg-muted" [id]="inputId() + '-hint'">
        {{ hintKey()! | transloco: hintParams() }}
      </p>
    }
    @if (help() && beginner()) {
      <app-field-help
        class="mt-1 block"
        scope="recruitment"
        [page]="page()"
        [field]="help()!"
        [requirements]="requirements()"
      />
    }
  `,
})
export class RecruitmentField {
  private readonly guidance = inject(GuidanceService);

  readonly labelKey = input.required<string>();
  readonly inputId = input.required<string>();
  /** Guidance page of the help (`pages.<page>.fields.<help>`). */
  readonly page = input('requisitionForm');
  readonly help = input<string | null>(null);
  readonly hintKey = input<string | null>(null);
  readonly hintParams = input<Record<string, unknown> | undefined>(undefined);
  readonly required = input(false);
  /** i18n key of the error to show instead of the hint. */
  readonly error = input<string | null | undefined>(null);
  /** Translated question for the assistant (shows the "ask" icon). */
  readonly ask = input<string | null>(null);
  /** Canonical refs the field documents (shown in the help, passed to the assistant). */
  readonly requirements = input<readonly string[] | null>(null);

  protected readonly beginner = this.guidance.isBeginner;
}
