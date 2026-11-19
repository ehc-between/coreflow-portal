import { Router } from '@angular/router';

/**
 * Open the Details tab and scroll to a section of an audit page (a "Oppfølging"
 * line such as "Lag sjekklisten" points at the checklist on the same page).
 */
export function showSection(router: Router, id: string): void {
  void router
    .navigate([], { queryParams: { tab: null }, queryParamsHandling: 'merge', replaceUrl: true })
    .then(() =>
      setTimeout(() => {
        const el = document.getElementById(id);
        if (!el) {
          return;
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.focus({ preventScroll: true });
      }),
    );
}
