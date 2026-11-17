import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NO_ORG_ACCESS_PATH, ORG_QUERY_PARAM } from './org-link';
import { SelectedOrgService } from './selected-org.service';

/**
 * Shell guard for org-aware deep links. When the target URL carries `?org=`:
 *
 * - the user is a member of that org: switch `SelectedOrgService` to it and
 *   redirect to the same URL without the parameter, so the page (and the
 *   module / permission guards below the shell) run in the right org and a
 *   later reload doesn't force the switch again;
 * - the user is not a member (or the value is malformed): send them to the
 *   explicit no-access page. The selected org is left untouched, and nothing
 *   about the target is shown.
 *
 * Without the parameter it allows navigation. It waits for the silent session
 * restore on a hard reload; when there is no session at all it allows the
 * navigation so the shell's `authGuard` sends the user to login with the full
 * `returnUrl` (including `org`), which comes back here after sign-in.
 */
export const orgDeepLinkGuard: CanActivateFn = (route, state) => {
  const orgId = route.queryParamMap.get(ORG_QUERY_PARAM);
  if (orgId === null) {
    return true;
  }
  const auth = inject(AuthService);
  const selectedOrg = inject(SelectedOrgService);
  const router = inject(Router);

  const decide = (): true | RedirectCommand => {
    if (!auth.isAuthenticated()) {
      return true;
    }
    if (!selectedOrg.orgs().some((org) => org.id === orgId)) {
      return new RedirectCommand(router.parseUrl(NO_ORG_ACCESS_PATH), { replaceUrl: true });
    }
    selectedOrg.setCurrentOrg(orgId);
    return new RedirectCommand(withoutOrg(router.parseUrl(state.url)), { replaceUrl: true });
  };

  if (auth.isAuthenticated()) {
    return decide();
  }
  const restored: Observable<true | RedirectCommand> = auth
    .restoreSession()
    .pipe(map(() => decide()));
  return restored;
};

function withoutOrg(tree: UrlTree): UrlTree {
  const rest = { ...tree.queryParams };
  delete rest[ORG_QUERY_PARAM];
  tree.queryParams = rest;
  return tree;
}
