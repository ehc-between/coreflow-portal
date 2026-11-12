import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../../core/org/selected-org.service';

interface NavLink {
  readonly path: string;
  readonly labelKey: string;
}

/** Section links of the recruitment module (requisitions, candidates, applications, settings). */
@Component({
  selector: 'app-recruitment-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav
      class="mb-5 flex gap-1 overflow-x-auto border-b border-border"
      [attr.aria-label]="'recruitment.nav.label' | transloco"
    >
      @for (link of links(); track link.path) {
        <a
          [routerLink]="link.path"
          routerLinkActive="border-accent text-fg"
          [routerLinkActiveOptions]="{ exact: false }"
          #rla="routerLinkActive"
          [attr.aria-current]="rla.isActive ? 'page' : null"
          class="-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        >
          {{ link.labelKey | transloco }}
        </a>
      }
    </nav>
  `,
})
export class RecruitmentNav {
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly links = computed<readonly NavLink[]>(() => {
    const perms = this.selectedOrg.currentOrg()?.permissions ?? [];
    const links: NavLink[] = [
      { path: '/recruitment/requisitions', labelKey: 'recruitment.nav.requisitions' },
      { path: '/recruitment/candidates', labelKey: 'recruitment.nav.candidates' },
      { path: '/recruitment/applications', labelKey: 'recruitment.nav.applications' },
    ];
    if (perms.includes('recruitment:manage')) {
      links.push({ path: '/recruitment/settings', labelKey: 'recruitment.nav.settings' });
    }
    return links;
  });
}
