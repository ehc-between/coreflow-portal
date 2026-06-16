import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { SelectedOrgService } from '../org/selected-org.service';
import { AuthService } from './auth.service';

/**
 * Structural directive that renders its template only when the current user
 * holds the given permission. Reacts to auth-state changes (login/logout/
 * refresh) via the AuthService signals.
 *
 *   <a *appHasPermission="'users:invite'" ...>Invite</a>
 *   <a *appHasPermission="'users:invite'; org: orgId" ...>Invite</a>
 */
@Directive({
  selector: '[appHasPermission]',
})
export class HasPermissionDirective {
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);

  readonly appHasPermission = input.required<string>();
  readonly appHasPermissionOrg = input<string | undefined>(undefined);

  private rendered = false;

  constructor() {
    effect(() => {
      const orgId = this.appHasPermissionOrg();
      const permission = this.appHasPermission();
      const allowed =
        orgId === undefined
          ? (this.selectedOrg.currentOrg()?.permissions ?? []).includes(permission)
          : (this.auth.orgs()[orgId]?.permissions ?? []).includes(permission);
      this.render(allowed);
    });
  }

  private render(allowed: boolean): void {
    if (allowed && !this.rendered) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.rendered = true;
    } else if (!allowed && this.rendered) {
      this.viewContainer.clear();
      this.rendered = false;
    }
  }
}
