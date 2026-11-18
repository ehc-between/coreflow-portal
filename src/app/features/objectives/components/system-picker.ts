import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MANAGEMENT_SYSTEMS, ManagementSystem } from '../data/objectives.models';
import { managementSystemKey } from '../objectives-display';

/**
 * Pick the management systems an objective serves (an integrated system shares
 * objectives across ISO 9001, 14001 and 45001). A group of toggle chips with real
 * checkboxes; the first one picked is the primary system. Each picked system makes
 * the objective evidence for that standard's clause 6.2.
 */
@Component({
  selector: 'app-objectives-system-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="group"
      class="flex flex-wrap gap-2"
      [attr.aria-labelledby]="labelledBy() || null"
      [attr.aria-describedby]="describedBy() || null"
    >
      @for (system of systems; track system) {
        @let on = value().includes(system);
        <label
          class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-ui font-semibold transition-colors focus-within:ring-2 focus-within:ring-accent"
          [class]="
            on
              ? 'border-accent bg-accent-soft text-fg'
              : 'border-border bg-bg text-fg-muted hover:text-fg'
          "
        >
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="on"
            (change)="toggle(system, $any($event.target).checked)"
            [attr.data-testid]="'system-' + system"
          />
          {{ systemKey(system) | transloco }}
          @if (on && value()[0] === system && value().length > 1) {
            <span class="text-micro font-semibold text-fg-subtle">
              {{ 'objectives.form.primarySystem' | transloco }}
            </span>
          }
        </label>
      }
    </div>
  `,
})
export class SystemPicker {
  readonly value = input<readonly ManagementSystem[]>([]);
  readonly labelledBy = input('');
  readonly describedBy = input('');
  readonly valueChange = output<readonly ManagementSystem[]>();

  protected readonly systems = MANAGEMENT_SYSTEMS;
  protected readonly systemKey = managementSystemKey;

  protected toggle(system: ManagementSystem, checked: boolean): void {
    const current = this.value().filter((s) => s !== system);
    this.valueChange.emit(checked ? [...current, system] : current);
  }
}
