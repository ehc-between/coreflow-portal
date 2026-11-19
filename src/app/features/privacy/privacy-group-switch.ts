import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { REGISTERS, RegisterKey } from './data/privacy-registers';
import { PRIVACY_TAB_GROUPS, privacyPermissions } from './privacy-nav';

/**
 * U32: on a list that shares a work tab with another register (processors and transfers,
 * breaches and requests), a two-way switch between the two. Renders nothing for the other
 * registers, or when the user may read only one of the pair.
 */
@Component({
  selector: 'app-privacy-group-switch',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
  template: `
    @if (options().length > 1) {
      <div
        role="group"
        [attr.aria-label]="'privacy.nav.groups.' + group() | transloco"
        class="mb-4 inline-flex rounded-tile border border-border bg-surface p-0.5"
        data-testid="privacy-group-switch"
      >
        @for (key of options(); track key) {
          <a
            [routerLink]="['/privacy', segment(key)]"
            [attr.aria-current]="key === register() ? 'page' : null"
            class="rounded-[6px] px-3 py-1 text-ui font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
            [class]="key === register() ? 'bg-accent-soft text-fg' : 'text-fg-muted hover:text-fg'"
            [attr.data-testid]="'privacy-group-' + key"
            >{{ 'privacy.registers.' + key + '.plural' | transloco }}</a
          >
        }
      </div>
    }
  `,
})
export class PrivacyGroupSwitch {
  readonly register = input.required<RegisterKey>();
  private readonly perms = privacyPermissions();

  private readonly found = computed(() =>
    PRIVACY_TAB_GROUPS.find((g) => g.registers.includes(this.register())),
  );
  protected readonly group = computed(() => this.found()?.key ?? '');
  protected readonly options = computed(() =>
    (this.found()?.registers ?? []).filter((k) => this.perms().has(REGISTERS[k].readPermission)),
  );

  protected segment(key: RegisterKey): string {
    return REGISTERS[key].segment;
  }
}
