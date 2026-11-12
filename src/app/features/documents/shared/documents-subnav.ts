import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { DocumentControlPermissions } from './document-control-permissions';

interface SubnavItem {
  readonly key: string;
  readonly link: string;
  readonly exact: boolean;
  /** Needs `documents:distribute` (campaigns) on top of `documents:read`. */
  readonly distribute?: boolean;
}

export const DOCUMENTS_SUBNAV: readonly SubnavItem[] = [
  { key: 'documents', link: '/documents', exact: true },
  { key: 'register', link: '/documents/register', exact: false },
  { key: 'campaigns', link: '/documents/campaigns', exact: false, distribute: true },
  { key: 'external', link: '/documents/external', exact: false },
  { key: 'types', link: '/documents/types', exact: false },
  { key: 'templates', link: '/documents/templates', exact: false },
  { key: 'retention', link: '/documents/retention', exact: false },
];

/** Section navigation of the documents module (documents, master list, campaigns, setup). */
@Component({
  selector: 'app-documents-subnav',
  imports: [TourStepDirective, RouterLink, RouterLinkActive, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="mx-auto max-w-[1180px] px-4 pt-4 sm:px-8"
      [attr.aria-label]="'documents.control.nav.label' | transloco"
    >
      <ul class="flex gap-1 overflow-x-auto border-b border-border">
        @for (item of items(); track item.key) {
          <li>
            <a
              [routerLink]="item.link"
              routerLinkActive="!border-accent !text-fg"
              [routerLinkActiveOptions]="{ exact: item.exact }"
              ariaCurrentWhenActive="page"
              class="-mb-px block border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              [appTourStep]="'documents-nav-' + item.key"
              [attr.data-testid]="'documents-nav-' + item.key"
            >
              {{ 'documents.control.nav.' + item.key | transloco }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class DocumentsSubnav {
  private readonly perms = inject(DocumentControlPermissions);

  protected readonly items = computed(() =>
    DOCUMENTS_SUBNAV.filter((item) => !item.distribute || this.perms.canDistribute()),
  );
}
