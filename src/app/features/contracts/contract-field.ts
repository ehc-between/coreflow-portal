import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { FormField } from '../../shared/ui/form-field/form-field';

/**
 * A contract form field whose help sits where people look for it: the `?` toggle
 * and the "ask" icon inline after the label (beginners read the help as text under
 * the control instead). Wraps `app-form-field`, so the projected control gets the
 * shared styling.
 *
 *   <app-contract-field [label]="…" inputId="cf-c-notice" helpField="notice_period_days"
 *                       [ask]="'contracts.ask.noticePeriod' | transloco">
 *     <input id="cf-c-notice" … />
 *   </app-contract-field>
 */
@Component({
  selector: 'app-contract-field',
  imports: [AskAbout, FieldHelp, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-1.5">
      <div class="flex min-h-[20px] flex-wrap items-center gap-1.5">
        <label [attr.for]="inputId() || null" class="text-ui font-semibold text-fg-muted">
          {{ label() }}
        </label>
        @if (helpField() && !beginner()) {
          <app-field-help scope="contracts" [page]="page()" [field]="helpField()!" />
        }
        @if (ask()) {
          <app-ask-about
            [prompt]="ask()"
            [field]="helpField() ?? inputId()"
            [fieldLabel]="label()"
            [requirements]="requirements()"
          />
        }
      </div>
      <app-form-field [inputId]="inputId()"><ng-content /></app-form-field>
      @if (helpField() && beginner()) {
        <app-field-help scope="contracts" [page]="page()" [field]="helpField()!" />
      }
    </div>
  `,
})
export class ContractField {
  private readonly guidance = inject(GuidanceService);

  readonly label = input('');
  readonly inputId = input('');
  /** Guidance key (`pages.<page>.fields.<field>`) of the help text. */
  readonly helpField = input<string | null>(null);
  readonly page = input('form');
  /** Translated question for the assistant (shows the "ask" icon). */
  readonly ask = input<string | null>(null);
  readonly requirements = input<readonly string[] | null>(null);

  protected readonly beginner = this.guidance.isBeginner;
}
