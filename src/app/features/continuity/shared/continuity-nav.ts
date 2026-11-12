import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';

/** Section links of the continuity module. */
@Component({
  selector: 'app-continuity-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, TourStepDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mt-3 flex flex-wrap gap-1"
      [attr.aria-label]="'continuity.nav.label' | transloco"
      appTourStep="continuity-sections"
    >
      @for (link of links; track link.path) {
        <a
          [routerLink]="link.path"
          routerLinkActive="bg-accent-soft text-accent"
          [routerLinkActiveOptions]="{ exact: link.exact }"
          ariaCurrentWhenActive="page"
          class="rounded-tile px-3 py-1.5 text-[13px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          {{ link.labelKey | transloco }}
        </a>
      }
    </nav>
  `,
})
export class ContinuityNav {
  protected readonly links = [
    { path: '/continuity', labelKey: 'continuity.nav.overview', exact: true },
    { path: '/continuity/bias', labelKey: 'continuity.nav.bias', exact: false },
    { path: '/continuity/plans', labelKey: 'continuity.nav.plans', exact: false },
    { path: '/continuity/exercises', labelKey: 'continuity.nav.exercises', exact: false },
    { path: '/continuity/ict-systems', labelKey: 'continuity.nav.ict', exact: false },
    { path: '/continuity/contacts', labelKey: 'continuity.nav.contacts', exact: false },
  ] as const;
}
