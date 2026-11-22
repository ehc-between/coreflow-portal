import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Årshjul `/annual-cycle` (IA v2 §5.3; lazy-loaded from app.routes, no guard): every
 * recurring or due duty across the modules in one year view. Each source is
 * permission-filtered by the backend. The dropdown sub-pages (Revisjoner,
 * Inspeksjoner og vernerunder, Ledelsens gjennomgang, Gjentakende oppgaver) are the
 * existing module pages; `/reports/calendar` redirects here.
 */
const routes: Routes = [
  {
    path: '',
    providers: [provideTranslocoScope('annual')],
    children: [
      {
        path: '',
        loadComponent: () => import('./annual-cycle-page').then((m) => m.AnnualCyclePage),
      },
    ],
  },
];

export default routes;
