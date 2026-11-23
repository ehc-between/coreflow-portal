import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

/**
 * Shown when a deep link (`?org=<id>`, from an email, digest or calendar feed)
 * points at an organisation the signed-in user is not a member of. It names
 * nothing about the target: the user only learns they have no access, and can
 * carry on in their current organisation.
 */
@Component({
  selector: 'app-no-org-access',
  imports: [EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header titleKey="orgAccess.title" />
      <div data-testid="no-org-access">
        <app-empty-state
          icon="lock"
          titleKey="orgAccess.heading"
          bodyKey="orgAccess.body"
          ctaKey="orgAccess.cta"
          ctaLink="/"
        />
      </div>
    </div>
  `,
})
export class NoOrgAccess {}
