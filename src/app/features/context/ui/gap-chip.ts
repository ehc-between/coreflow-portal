import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * A chip naming a gap (a framework without a scope, a missing policy kind). With
 * `link` it is a "create it" shortcut; without (no write access) plain text.
 */
@Component({
  selector: 'app-context-gap-chip',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link(); as target) {
      <a
        [routerLink]="target"
        [queryParams]="queryParams()"
        [attr.aria-label]="ariaLabel() || null"
        class="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[12.5px] font-semibold text-accent outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent"
      >
        <app-icon name="plus" [size]="12" />
        {{ label() }}
      </a>
    } @else {
      <span
        class="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[12.5px] font-semibold text-fg-muted"
      >
        {{ label() }}
      </span>
    }
  `,
})
export class GapChip {
  readonly label = input.required<string>();
  readonly link = input<string | null>(null);
  readonly queryParams = input<Params | null>(null);
  readonly ariaLabel = input<string | null>(null);
}
