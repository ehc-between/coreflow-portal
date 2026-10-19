import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ControlContainer, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { PASSWORD_MIN_LENGTH } from '../../core/auth/auth-errors';
import { FormField } from '../ui/form-field/form-field';

/**
 * "New password" + "Confirm new password" inputs with the password-policy hint
 * and inline validation messages. Binds to the `newPassword` and
 * `confirmPassword` controls of the enclosing `[formGroup]` (pair it with
 * `passwordsMatchValidator` on that group).
 */
@Component({
  selector: 'app-new-password-fields',
  imports: [ReactiveFormsModule, TranslocoPipe, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    {
      provide: ControlContainer,
      useFactory: () => inject(ControlContainer, { skipSelf: true }),
    },
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    <div class="flex flex-col gap-1.5">
      <app-form-field [inputId]="idPrefix() + '-new'" [label]="'auth.password.new' | transloco">
        <input
          [id]="idPrefix() + '-new'"
          type="password"
          formControlName="newPassword"
          autocomplete="new-password"
          [attr.aria-describedby]="idPrefix() + '-hint'"
        />
      </app-form-field>
      <p [id]="idPrefix() + '-hint'" class="text-[12.5px] text-fg-subtle">
        {{ 'auth.password.policy' | transloco }}
      </p>
      @if (showTooShort()) {
        <p class="text-[12.5px] font-medium text-fail">
          {{ 'auth.password.tooShort' | transloco: { min: minLength } }}
        </p>
      }
    </div>

    <div class="flex flex-col gap-1.5">
      <app-form-field
        [inputId]="idPrefix() + '-confirm'"
        [label]="'auth.password.confirm' | transloco"
      >
        <input
          [id]="idPrefix() + '-confirm'"
          type="password"
          formControlName="confirmPassword"
          autocomplete="new-password"
        />
      </app-form-field>
      @if (showMismatch()) {
        <p class="text-[12.5px] font-medium text-fail">
          {{ 'auth.password.mismatch' | transloco }}
        </p>
      }
    </div>
  `,
})
export class NewPasswordFields {
  /** Prefix for the input ids (must be unique on the page). */
  readonly idPrefix = input('new-password');

  protected readonly minLength = PASSWORD_MIN_LENGTH;
  private readonly container = inject(ControlContainer);

  private get group(): FormGroup {
    return this.container.control as FormGroup;
  }

  protected showTooShort(): boolean {
    const control = this.group.get('newPassword');
    return !!control?.touched && !!control.errors?.['minlength'];
  }

  protected showMismatch(): boolean {
    const control = this.group.get('confirmPassword');
    return !!control?.touched && !!this.group.errors?.['passwordMismatch'];
  }
}
