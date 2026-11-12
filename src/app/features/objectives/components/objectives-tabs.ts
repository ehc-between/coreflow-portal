import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Switches between the module's two registers: objectives and KPIs. */
@Component({
  selector: 'app-objectives-tabs',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav
      class="flex gap-1 border-b border-border"
      [attr.aria-label]="'objectives.tabs.label' | transloco"
    >
      @for (tab of tabs; track tab.path) {
        <a
          [routerLink]="tab.path"
          routerLinkActive="!border-accent !text-fg"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          class="-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          {{ tab.key | transloco }}
        </a>
      }
    </nav>
  `,
})
export class ObjectivesTabs {
  protected readonly tabs = [
    { path: '/objectives', key: 'objectives.tabs.objectives' },
    { path: '/objectives/kpis', key: 'objectives.tabs.kpis' },
  ];
}
