import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Labelled field wrapper.
 * `[label-suffix]` content (e.g. `<app-field-help label-suffix …>`) sits inline after
 * the label, so labels in neighbouring columns stay aligned. `required` adds a "*"
 * (set `required` / `aria-required` on the control too). Projects a native control (input/select) into a slot
 * styled to the design system — surface background, border, and an accent focus
 * ring applied to the projected control via `:focus-within`.
 */
@Component({
  selector: 'app-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .cf-field ::ng-deep input,
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
    <div class="cf-field flex flex-col gap-1.5">
      @if (label()) {
        <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <label [attr.for]="inputId() || null" class="text-ui font-semibold text-fg-muted">
            {{ label() }}
            @if (required()) {
              <span class="text-fail-ink" aria-hidden="true">*</span>
            }
          </label>
          <ng-content select="[label-suffix]" />
        </div>
      }
      <ng-content />
    </div>
  `,
})
export class FormField {
  readonly label = input('');
  /** id of the projected control — set the same id on the input to associate the label. */
  readonly inputId = input('');
  /** Mark the label as required ("*"). */
  readonly required = input(false);
}
