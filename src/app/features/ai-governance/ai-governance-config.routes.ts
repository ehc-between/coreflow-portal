import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * `/settings/modules/ai-governance` (U10): the AI governance settings, the module's configuration.
 * `module-config.routes` gates the area on the module and its read permission.
 * The old `/ai-governance/settings` URL redirects here.
 */
export default [
  {
    path: '',
    providers: [provideTranslocoScope('ai-governance')],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./settings/ai-governance-settings').then((m) => m.AiGovernanceSettingsPage),
      },
    ],
  },
] satisfies Routes;
