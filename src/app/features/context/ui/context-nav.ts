import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

interface NavLink {
  readonly path: string;
  readonly labelKey: string;
  readonly exact: boolean;
}

const LINKS: readonly NavLink[] = [
  { path: '/context', labelKey: 'context.nav.overview', exact: true },
  { path: '/context/analyses', labelKey: 'context.nav.analyses', exact: false },
  { path: '/context/interested-parties', labelKey: 'context.nav.parties', exact: false },
  { path: '/context/scopes', labelKey: 'context.nav.scopes', exact: false },
  { path: '/context/policies', labelKey: 'context.nav.policies', exact: false },
  { path: '/context/responsibilities', labelKey: 'context.nav.responsibilities', exact: false },
];

/** The module's section links (overview and the five registers), scrollable on small screens. */
@Component({
  selector: 'app-context-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav
      [attr.aria-label]="'context.nav.label' | transloco"
      class="mt-3 -mb-1 flex gap-1 overflow-x-auto"
      data-testid="context-nav"
    >
      @for (link of links; track link.path) {
        <a
          [routerLink]="link.path"
          routerLinkActive="bg-accent-soft text-accent"
          [routerLinkActiveOptions]="{ exact: link.exact }"
          ariaCurrentWhenActive="page"
          class="rounded-full px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        >
          {{ link.labelKey | transloco }}
        </a>
      }
    </nav>
  `,
})
export class ContextNav {
  protected readonly links = LINKS;
}
