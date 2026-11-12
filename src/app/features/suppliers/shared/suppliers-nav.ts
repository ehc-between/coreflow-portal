import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';

/** Section links of the suppliers module: register, evaluations, questionnaires. */
@Component({
  selector: 'app-suppliers-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, TourStepDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mt-3 flex flex-wrap gap-1"
      [attr.aria-label]="'suppliers.nav.label' | transloco"
      appTourStep="suppliers-sections"
    >
      @for (link of links; track link.path) {
        <a
          [routerLink]="link.path"
          routerLinkActive="bg-accent-soft text-accent"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          class="rounded-tile px-3 py-1.5 text-[13px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          {{ link.labelKey | transloco }}
        </a>
      }
    </nav>
  `,
})
export class SuppliersNav {
  protected readonly links = [
    { path: '/suppliers', labelKey: 'suppliers.nav.register' },
    { path: '/suppliers/evaluations', labelKey: 'suppliers.nav.evaluations' },
    { path: '/suppliers/questionnaires', labelKey: 'suppliers.nav.questionnaires' },
  ] as const;
}
