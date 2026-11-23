import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterEveryRender,
  computed,
  inject,
  input,
} from '@angular/core';

/** Grid span inside an `app-form-section` (2-column grid from 640 px). */
export type FormFieldSpan = 'half' | 'full';

/**
 * The one form-field anatomy (docs/ux-guide.md, "Form anatomy"):
 *
 *   label row   Label [*] [?]     always the same height (24 px), so labels and controls
 *                                 in neighbouring grid columns line up
 *   control     full width, 40 px high (input / select / date / pickers)
 *   hint        optional one muted line under the control
 *   error       optional, replaces nothing, shown under the hint
 *
 *   <app-form-field [label]="'x.fields.owner' | transloco" inputId="x-owner"
 *                   [hint]="'x.form.ownerHint' | transloco" [error]="ownerError()">
 *     <app-field-help label-suffix scope="x" page="form" field="owner" />
 *     <select id="x-owner">…</select>
 *   </app-form-field>
 *
 * `span="full"` makes the field take both columns of the section grid (textareas,
 * multi-selects, pickers with chips). When `hint` / `error` are set, their ids
 * (`<inputId>-hint`, `<inputId>-error`) are added to the control's
 * `aria-describedby`, and `error` sets `aria-invalid`.
 *
 * Native controls get the design-system look from a low-priority (`@layer components`)
 * style, so a Tailwind class on a control still wins. Checkboxes, radios and inner
 * inputs of composite pickers marked `.cf-bare` are left alone.
 */
@Component({
  selector: 'app-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '[class.sm:col-span-2]': "span() === 'full'",
  },
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
        .cf-field ::ng-deep input:not(.cf-bare)::placeholder,
        .cf-field ::ng-deep textarea:not(.cf-bare)::placeholder {
          color: var(--fg-placeholder, #8b94a4);
        }
        .cf-field ::ng-deep input:not(.cf-bare):focus,
        .cf-field ::ng-deep select:not(.cf-bare):focus,
        .cf-field ::ng-deep textarea:not(.cf-bare):focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
        .cf-field ::ng-deep [aria-invalid='true']:not(.cf-bare) {
          border-color: var(--fail);
        }
        .cf-field ::ng-deep input:disabled:not(.cf-bare),
        .cf-field ::ng-deep select:disabled:not(.cf-bare),
        .cf-field ::ng-deep textarea:disabled:not(.cf-bare) {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }
      /* Composite controls keep their own look but match the 40 px control height. */
      .cf-field ::ng-deep app-date-input > input[type='text'] {
        height: 40px;
      }
    `,
  ],
  template: `
    <div class="cf-field flex flex-col gap-1.5">
      @if (label()) {
        <div class="flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1">
          <label
            [attr.for]="inputId() || null"
            class="text-ui leading-6 font-semibold text-fg-muted"
            data-testid="form-field-label"
          >
            {{ label() }}
            @if (required()) {
              <span class="text-fail-ink" aria-hidden="true">*</span>
            }
          </label>
          <ng-content select="[label-suffix]" />
        </div>
      }
      <ng-content />
      @if (hint()) {
        <p
          [id]="hintId()"
          class="text-meta leading-snug text-fg-subtle"
          data-testid="form-field-hint"
        >
          {{ hint() }}
        </p>
      }
      <ng-content select="[hint]" />
      @if (error()) {
        <p
          [id]="errorId()"
          class="text-meta leading-snug font-medium text-fail-ink"
          data-testid="form-field-error"
        >
          {{ error() }}
        </p>
      }
    </div>
  `,
})
export class FormField {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly label = input('');
  /** id of the projected control — set the same id on the input to associate the label. */
  readonly inputId = input('');
  /** Mark the label as required ("*"). */
  readonly required = input(false);
  /** One muted line under the control (already translated). */
  readonly hint = input<string | null | undefined>('');
  /** Validation message under the control (already translated); sets `aria-invalid`. */
  readonly error = input<string | null | undefined>('');
  /** `full` spans both columns of an `app-form-section` grid. */
  readonly span = input<FormFieldSpan>('half');

  protected readonly hintId = computed(() => (this.inputId() ? `${this.inputId()}-hint` : null));
  protected readonly errorId = computed(() => (this.inputId() ? `${this.inputId()}-error` : null));

  /** Whether this field set `aria-invalid` (so it only clears its own). */
  private ownsInvalid = false;

  constructor() {
    afterEveryRender(() => this.describeControl());
  }

  /** Point the control's `aria-describedby` at the hint / error and mark it invalid. */
  private describeControl(): void {
    const id = this.inputId();
    if (!id) {
      return;
    }
    const control = this.host.nativeElement.querySelector<HTMLElement>(`[id="${id}"]`);
    if (!control) {
      return;
    }
    const managed = [`${id}-hint`, `${id}-error`];
    const wanted = [this.hint() ? managed[0] : '', this.error() ? managed[1] : ''].filter(Boolean);
    const current = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    const next = [...current.filter((token) => !managed.includes(token)), ...wanted];
    if (next.join(' ') !== current.join(' ')) {
      if (next.length) {
        control.setAttribute('aria-describedby', next.join(' '));
      } else {
        control.removeAttribute('aria-describedby');
      }
    }
    if (this.error()) {
      if (control.getAttribute('aria-invalid') !== 'true') {
        control.setAttribute('aria-invalid', 'true');
        this.ownsInvalid = true;
      }
    } else if (this.ownsInvalid) {
      control.removeAttribute('aria-invalid');
      this.ownsInvalid = false;
    }
  }
}
