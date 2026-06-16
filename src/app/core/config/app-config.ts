import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AppEnvironment } from '../../../environments/environment.model';

/**
 * Injectable handle on the active environment configuration.
 *
 * Inject this instead of importing `environment` directly so that components
 * and services stay decoupled from the build-time module and can be supplied a
 * fake config in unit tests:
 *
 *   { provide: APP_CONFIG, useValue: { ...environment, apiBaseUrl: '/test' } }
 */
export const APP_CONFIG = new InjectionToken<AppEnvironment>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => environment,
});
