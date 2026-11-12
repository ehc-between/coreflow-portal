import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

interface NavLink {
  readonly path: string;
  readonly labelKey: string;
  readonly exact: boolean;
}

/** Section navigation of the AI governance module (overview, inventory, assessments, …). */
@Component({
  selector: 'app-ai-gov-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav
      class="mb-5 flex gap-1 overflow-x-auto border-b border-border"
      [attr.aria-label]="'aiGovernance.nav.label' | transloco"
      data-testid="ai-gov-nav"
    >
      @for (link of links; track link.path) {
        <a
          [routerLink]="link.path"
          routerLinkActive="!border-accent !text-fg"
          [routerLinkActiveOptions]="{ exact: link.exact }"
          ariaCurrentWhenActive="page"
          class="-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        >
          {{ link.labelKey | transloco }}
        </a>
      }
    </nav>
  `,
})
export class AiGovNav {
  protected readonly links: readonly NavLink[] = [
    { path: '/ai-governance', labelKey: 'aiGovernance.nav.overview', exact: true },
    { path: '/ai-governance/systems', labelKey: 'aiGovernance.nav.systems', exact: false },
    { path: '/ai-governance/assessments', labelKey: 'aiGovernance.nav.assessments', exact: false },
    { path: '/ai-governance/literacy', labelKey: 'aiGovernance.nav.literacy', exact: false },
    { path: '/ai-governance/settings', labelKey: 'aiGovernance.nav.settings', exact: false },
  ];
}
