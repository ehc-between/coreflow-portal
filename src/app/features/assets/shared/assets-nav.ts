import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';

/** Section links of the assets module: inventory, calibration, access reviews, changes. */
@Component({
  selector: 'app-assets-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, TourStepDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mt-3 flex flex-wrap gap-1"
      [attr.aria-label]="'assets.nav.label' | transloco"
      appTourStep="assets-sections"
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
export class AssetsNav {
  protected readonly links = [
    { path: '/assets', labelKey: 'assets.nav.inventory', exact: true },
    { path: '/assets/calibration', labelKey: 'assets.nav.calibration', exact: true },
    { path: '/assets/access-reviews', labelKey: 'assets.nav.accessReviews', exact: false },
    { path: '/assets/changes', labelKey: 'assets.nav.changes', exact: false },
  ] as const;
}
