import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../../shared/ui/overflow-menu/overflow-menu';
import { actionView, splitUrl } from '../data/home-format';
import { NextAction } from '../data/home.models';

/** A dismissal the parent sends to the API: hide for `days`, or for good. */
export interface DismissRequest {
  readonly key: string;
  readonly days?: number;
}

/** Days "Hide for a week" hides an action. */
export const SNOOZE_DAYS = 7;

/**
 * "Do this now": the caller's next actions, most urgent first. Each row says what to
 * do, why it is on the list, and has one button. The ⋯ menu hides an action for a
 * week or for good (the backend stores it per user).
 */
@Component({
  selector: 'app-next-actions',
  imports: [RouterLink, TranslocoPipe, Icon, OverflowMenu, MenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="flex flex-col gap-2" data-testid="next-actions">
      @for (a of rows(); track a.view.key; let i = $index) {
        <li
          class="flex flex-col gap-3 rounded-tile border bg-surface p-4 sm:flex-row sm:items-center"
          [class.border-warn]="a.view.urgent"
          [class.border-border]="!a.view.urgent"
          data-testid="next-action"
        >
          <div class="flex min-w-0 flex-1 items-start gap-3">
            <span
              class="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full"
              [class.bg-warn-soft]="a.view.urgent"
              [class.text-warn-ink]="a.view.urgent"
              [class.bg-accent-soft]="!a.view.urgent"
              [class.text-accent]="!a.view.urgent"
              aria-hidden="true"
            >
              <app-icon [name]="a.view.icon" [size]="16" />
            </span>
            <div class="min-w-0">
              <p class="text-body font-semibold text-fg [overflow-wrap:anywhere]">
                {{ a.view.title }}
              </p>
              <p class="mt-0.5 text-ui text-fg-muted">{{ a.view.why }}</p>
              @if (a.view.moduleName) {
                <p class="mt-1 text-meta text-fg-subtle">{{ a.view.moduleName }}</p>
              }
            </div>
          </div>
          <div class="flex flex-none items-center gap-2 self-end sm:self-center">
            <a
              [routerLink]="a.link.path"
              [queryParams]="a.link.query"
              class="inline-flex h-9 items-center rounded-tile px-3.5 text-ui font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
              [class]="
                i === 0
                  ? 'bg-accent text-white hover:bg-accent-2'
                  : 'border border-border bg-surface text-fg hover:bg-surface-2'
              "
              [attr.data-testid]="'next-action-cta'"
            >
              {{ a.view.ctaKey | transloco }}
              <span class="sr-only">: {{ a.view.title }}</span>
            </a>
            <app-overflow-menu
              [iconOnly]="true"
              labelKey="home.next.menu.label"
              data-testid="next-action-menu"
            >
              <button
                appMenuItem
                type="button"
                (click)="dismissed.emit({ key: a.view.key, days: snoozeDays })"
              >
                <app-icon name="clock" [size]="15" />
                {{ 'home.next.menu.snooze' | transloco: { days: snoozeDays } }}
              </button>
              <button appMenuItem type="button" (click)="dismissed.emit({ key: a.view.key })">
                <app-icon name="x" [size]="15" />
                {{ 'home.next.menu.hide' | transloco }}
              </button>
            </app-overflow-menu>
          </div>
        </li>
      }
    </ol>
  `,
})
export class NextActions {
  private readonly language = inject(LanguageService);

  readonly actions = input.required<readonly NextAction[]>();
  readonly dismissed = output<DismissRequest>();

  protected readonly snoozeDays = SNOOZE_DAYS;

  protected readonly rows = computed(() => {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return this.actions().map((action) => ({
      view: actionView(action, t),
      link: splitUrl(action.url),
    }));
  });
}
