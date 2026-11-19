import { Location } from '@angular/common';
import { Router } from '@angular/router';

/**
 * Cancel goes back to where the user came from (U08): the previous page when the
 * user navigated here inside the app, else `fallback` (a direct visit or a new tab,
 * where "back" would leave the app).
 */
export function goBack(router: Router, location: Location, fallback: readonly unknown[]): void {
  if (router.lastSuccessfulNavigation()?.previousNavigation) {
    location.back();
    return;
  }
  void router.navigate([...fallback]);
}
