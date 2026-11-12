import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';

export const AUDIT_SECTIONS = [
  { key: 'overview', path: '/audits', exact: true },
  { key: 'plans', path: '/audits/plans', exact: false },
  { key: 'programmes', path: '/audits/programmes', exact: false },
  { key: 'findings', path: '/audits/findings', exact: false },
  { key: 'certifications', path: '/audits/certifications', exact: false },
  { key: 'auditors', path: '/audits/auditors', exact: false },
] as const;

/** Section links of the audit module (overview, audits, programmes, findings, …). */
@Component({
  selector: 'app-audits-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, TourStepDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav
      [attr.aria-label]="'audits.nav.label' | transloco"
      class="mt-3 flex gap-1 overflow-x-auto border-b border-border"
      [appTourStep]="'audits-nav'"
    >
      @for (s of sections; track s.key) {
        <a
          [routerLink]="s.path"
          routerLinkActive="border-accent text-fg"
          [routerLinkActiveOptions]="{ exact: s.exact }"
          #rla="routerLinkActive"
          [attr.aria-current]="rla.isActive ? 'page' : null"
          class="-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.data-testid]="'audits-nav-' + s.key"
        >
          {{ 'audits.nav.' + s.key | transloco }}
        </a>
      }
    </nav>
  `,
})
export class AuditsNav {
  protected readonly sections = AUDIT_SECTIONS;
}
