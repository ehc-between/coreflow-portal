import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Kontakter (IA v2 §5.7, area `contacts`): the company list and the company card.
 * Not module-guarded (IA v2 D15): the page shows only the roles whose module is on and
 * that the user may read, and an empty state otherwise. `app.routes.ts` (SHELL) mounts
 * this file at `/contacts` with the title `nav.areas.contacts.label`.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('contacts')],
    children: [
      {
        path: '',
        loadComponent: () => import('./contacts-page').then((m) => m.ContactsPage),
      },
      {
        path: ':key',
        loadComponent: () => import('./contact-card').then((m) => m.ContactCard),
      },
    ],
  },
] satisfies Routes;
