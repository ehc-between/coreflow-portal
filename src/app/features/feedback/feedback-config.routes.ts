import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * `/settings/modules/feedback` (U10): response times and the privacy notice for feedback, the module's configuration.
 * `module-config.routes` gates the area on the module and its read permission.
 * The old `/feedback/settings` URL redirects here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('feedback')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./settings/feedback-settings').then((m) => m.FeedbackSettingsPage),
      },
    ],
  },
] satisfies Routes;
