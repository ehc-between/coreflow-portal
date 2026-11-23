import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FormField, FormFieldSpan } from '../../../shared/ui/form-field/form-field';

/**
 * One recruitment form field, rendered through the shared form anatomy
 * (`app-form-field`, docs/ux-guide.md §2.4): the label on top with the required
 * marker, the `?` help toggletip and the "ask" icon in the label row, the control,
 * one muted hint line and the error under it.
 *
 *   <app-recruitment-field labelKey="recruitment.fields.title" inputId="req-title"
 *       page="requisitionForm" help="title" [required]="true" [error]="errors().title">
 *     <input id="req-title" … />
 *   </app-recruitment-field>
 *
 * Inside an `app-form-section` grid, `span="full"` takes both columns.
 */
@Component({
  selector: 'app-recruitment-field',
  imports: [TranslocoPipe, AskAbout, FieldHelp, FormField],
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
      [hint]="!error() && hintKey() ? (hintKey()! | transloco: hintParams()) : ''"
      [error]="error() ? (error()! | transloco) : ''"
    >
      @if (help()) {
        <app-field-help
          label-suffix
          scope="recruitment"
          [page]="page()"
          [field]="help()!"
          [label]="labelKey() | transloco"
          [requirements]="requirements()"
        />
      }
      @if (ask()) {
        <app-ask-about
          label-suffix
          [prompt]="ask()"
          [field]="help() ?? inputId()"
          [fieldLabel]="labelKey() | transloco"
          [requirements]="requirements()"
        />
      }
      <span label-suffix class="ml-auto empty:hidden"><ng-content select="[label-extra]" /></span>
      <ng-content />
    </app-form-field>
  `,
})
export class RecruitmentField {
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
  /** Grid span inside an `app-form-section` (`full` takes both columns). */
  readonly span = input<FormFieldSpan>('half');
}
