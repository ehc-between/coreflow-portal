import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { RelativeTimePipe } from '../../shared/relative-time/relative-time';
import { Icon } from '../../shared/ui/icon/icon';
import { RegisterRow } from './register-groups';
import { RegisterPinState } from './register-pins';

/**
 * A list of hub rows. Each row opens the register (the whole row is the link, so the
 * count is a door too) and has a pin toggle beside it (pins show in the menu too). Under the title: the module the
 * register lives in (where it sat in the old menu) and when it last changed.
 */
@Component({
  selector: 'app-register-list',
  imports: [RouterLink, TranslocoPipe, RelativeTimePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="divide-y divide-border" role="list">
      @for (row of rows(); track row.key) {
        <li class="flex items-stretch" data-testid="register-row" [attr.data-key]="row.key">
          <a
            [routerLink]="row.route"
            [queryParams]="row.query"
            class="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            data-testid="register-link"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-body font-semibold text-fg sm:truncate">{{ row.title }}</span>
              <span class="block text-meta text-fg-muted sm:truncate">
                @if (row.area) {
                  {{ row.area }}
                }
                @if (row.area && row.lastUpdatedAt) {
                  ·
                }
                @if (row.lastUpdatedAt) {
                  {{
                    'registers.row.updated'
                      | transloco: { when: row.lastUpdatedAt | relativeTime: lang() }
                  }}
                }
              </span>
            </span>
            @if (row.count !== null) {
              <span
                class="flex-none text-right text-meta tabular-nums"
                [class.text-fg]="row.count > 0"
                [class.font-semibold]="row.count > 0"
                [class.text-fg-subtle]="row.count === 0"
                data-testid="register-count"
              >
                @if (row.count === 0) {
                  {{ 'registers.row.empty' | transloco }}
                } @else if (row.count === 1) {
                  {{ 'registers.row.countOne' | transloco }}
                } @else {
                  {{ 'registers.row.count' | transloco: { count: row.count } }}
                }
              </span>
            }
            <app-icon name="chevron" [size]="14" class="flex-none -rotate-90 text-fg-subtle" />
          </a>
          @let pinned = pins.isPinned(row.pinKey);
          <button
            type="button"
            class="flex w-11 flex-none items-center justify-center hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            [class]="pinned ? 'text-accent' : 'text-fg-subtle hover:text-fg'"
            [attr.aria-pressed]="pinned"
            [disabled]="!pins.editable() || (!pinned && pins.full())"
            [attr.aria-label]="
              (pinned ? 'registers.pin.remove' : 'registers.pin.add')
                | transloco: { name: row.title }
            "
            [attr.title]="
              !pinned && pins.full()
                ? ('registers.pin.full' | transloco: { max: pins.max })
                : ((pinned ? 'registers.pin.remove' : 'registers.pin.add')
                  | transloco: { name: row.title })
            "
            (click)="pins.toggle(row.pinKey)"
            data-testid="register-pin"
          >
            <app-icon name="pin" [size]="16" />
          </button>
        </li>
      }
    </ul>
  `,
})
export class RegisterList {
  readonly rows = input.required<readonly RegisterRow[]>();

  protected readonly pins = inject(RegisterPinState);
  protected readonly lang = inject(LanguageService).active;
}
