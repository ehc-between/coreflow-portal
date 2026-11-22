import { Routes } from '@angular/router';

/**
 * The old dashboard is Oversikt now (IA v2 §7: `/dashboard` → `/home`). Kept as a
 * redirect so any route still loading this file lands on the new page; query
 * strings are not used by the home page.
 */
const routes: Routes = [{ path: '', pathMatch: 'full', redirectTo: '/home' }];

export default routes;
