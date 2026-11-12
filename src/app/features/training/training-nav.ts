import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TrainingAccess } from './data/training-display';

interface NavLink {
  readonly path: string;
  readonly labelKey: string;
  readonly exact: boolean;
}

/** Section links of the training module (My training, courses, assignments, records, matrix). */
@Component({
  selector: 'app-training-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mx-auto flex max-w-[1180px] gap-1 overflow-x-auto border-b border-border px-4 pt-4 sm:px-8"
      [attr.aria-label]="'training.nav.label' | transloco"
      data-testid="training-nav"
    >
      @for (link of links(); track link.path) {
        <a
          [routerLink]="link.path"
          routerLinkActive
          #rla="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: link.exact }"
          ariaCurrentWhenActive="page"
          class="-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold whitespace-nowrap outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
          [class.border-accent]="rla.isActive"
          [class.text-fg]="rla.isActive"
          [class.border-transparent]="!rla.isActive"
          [class.text-fg-muted]="!rla.isActive"
        >
          {{ link.labelKey | transloco }}
        </a>
      }
    </nav>
  `,
})
export class TrainingNav {
  private readonly access = inject(TrainingAccess);

  protected readonly links = computed<readonly NavLink[]>(() => {
    const links: NavLink[] = [
      { path: '/training', labelKey: 'training.nav.mine', exact: true },
      { path: '/training/courses', labelKey: 'training.nav.courses', exact: false },
      { path: '/training/assignments', labelKey: 'training.nav.assignments', exact: false },
      { path: '/training/records', labelKey: 'training.nav.records', exact: false },
    ];
    if (this.access.canOversee()) {
      links.push({ path: '/training/matrix', labelKey: 'training.nav.matrix', exact: false });
    }
    return links;
  });
}
