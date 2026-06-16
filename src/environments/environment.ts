import { AppEnvironment } from './environment.model';

/**
 * PRODUCTION environment (default build).
 * Values here are safe placeholders — fill them in (or inject at deploy time)
 * before going live. Empty `sentry.dsn` keeps error reporting inert so nothing
 * talks to an external service by accident.
 */
export const environment: AppEnvironment = {
  production: true,
  apiBaseUrl: '/api',
  sentry: {
    dsn: '',
    environment: 'production',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  },
  i18n: {
    defaultLanguage: 'en',
    availableLanguages: ['en', 'nb'],
  },
};
