import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The action bar at the bottom of a form (docs/ux-guide.md, "Form anatomy"). It sticks
 * to the bottom of the scroll area, so Save is always in reach on long forms.
 *
 *   <app-form-actions [message]="attempted() && hasErrors() ? ('x.form.errors.fix' | transloco) : ''">
 *     <app-button variant="secondary" (click)="cancel()">{{ 'common.cancel' | transloco }}</app-button>
 *     <app-button type="submit" [loading]="busy()">{{ 'common.save' | transloco }}</app-button>
 *   </app-form-actions>
 *
 * The right padding keeps the buttons clear of the floating "Spør CoreFlow" button
 * (phones and narrow desktops). Buttons sit on the right in reading order: Cancel (secondary) then the one primary
 * Save. `[start]` holds a rare left-hand extra (e.g. "Lagre som utkast"); `message`
 * shows a one-line error summary (`role="alert"`) on the left.
 *
 * With a single button and nothing on the left (a settings page's lone "Lagre") the bar
 * drops its card chrome and shows just the button on the right (src/styles.scss), so it
 * does not look like an empty card; it still sticks to the bottom.
 */
@Component({
  selector: 'app-form-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The shell's <main> has `pb-20` (room for the floating button); a negative offset of
  // that size pins the bar to the real bottom edge (phones) or 16 px above it (desktop).
  host: { class: 'sticky -bottom-20 z-20 block sm:-bottom-16' },
  template: `
    <div
      class="-mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-bg/95 py-3 pr-[76px] pl-4 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:bg-surface/95 sm:px-5 sm:shadow-card sm:max-[1180px]:pr-[176px]"
      data-testid="form-actions"
    >
      <div class="cf-actions-start flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <ng-content select="[start]" />
        @if (message()) {
          <p
            class="text-meta font-medium text-fail-ink"
            role="alert"
            data-testid="form-actions-message"
          >
            {{ message() }}
          </p>
        }
      </div>
      <div class="cf-actions-end ml-auto flex flex-wrap items-center justify-end gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class FormActions {
  /** One-line summary under/left of the buttons, e.g. "Fix the marked fields" (translated). */
  readonly message = input<string | null | undefined>('');
}
