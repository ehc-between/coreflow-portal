import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Switches between the module's two registers: management reviews and meetings. */
@Component({
  selector: 'app-mr-tabs',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav
      class="flex gap-1 overflow-x-auto border-b border-border"
      [attr.aria-label]="'managementReview.tabs.label' | transloco"
    >
      @for (tab of tabs; track tab.path) {
        <a
          [routerLink]="tab.path"
          routerLinkActive="!border-accent !text-fg"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          class="-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted hover:text-fg"
        >
          {{ tab.key | transloco }}
        </a>
      }
    </nav>
  `,
})
export class MrTabs {
  protected readonly tabs = [
    { path: '/management-review/reviews', key: 'managementReview.tabs.reviews' },
    { path: '/management-review/meetings', key: 'managementReview.tabs.meetings' },
  ];
}
