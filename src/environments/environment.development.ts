import { AppEnvironment } from './environment.model';

/**
 * DEVELOPMENT environment (swapped in via angular.json fileReplacements for the
 * `development` configuration). Point these at your local backend / IdP.
 */
export const environment: AppEnvironment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000/api',
  sentry: {
    dsn: '',
    environment: 'development',
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  },
  i18n: {
    defaultLanguage: 'en',
    availableLanguages: ['en', 'nb'],
  },
};
