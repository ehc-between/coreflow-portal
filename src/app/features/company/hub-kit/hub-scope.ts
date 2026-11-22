import { Provider } from '@angular/core';
import { provideSharedScope } from '../../../core/i18n/shared-scope';

/** The hubs' own copy (`hubs`) plus `home` (next-action buttons, standard names). */
export const HUBS_SCOPE = 'hubs';

/** For `viewProviders` of every hub page (Bedriften, Folk, Dokumenter and their sub-pages). */
export function provideHubsScope(...extra: string[]): Provider {
  return provideSharedScope(HUBS_SCOPE, 'home', ...extra);
}
