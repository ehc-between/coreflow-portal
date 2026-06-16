/**
 * Shape of the application environment. Both environment.ts (production) and
 * environment.development.ts implement this so the two stay in lockstep.
 */
export interface AppEnvironment {
  /** True in the production build. */
  readonly production: boolean;

  /** Base URL of the coreflow-core backend API (no trailing slash). */
  readonly apiBaseUrl: string;

  /**
   * Sentry settings. Reporting is OFF whenever `dsn` is empty — nothing is sent
   * and the SDK is never initialised. Fill `dsn` per environment to enable.
   */
  readonly sentry: {
    readonly dsn: string;
    readonly environment: string;
    readonly tracesSampleRate: number;
    readonly replaysSessionSampleRate: number;
    readonly replaysOnErrorSampleRate: number;
  };

  /** i18n: default language and the full set of supported languages. */
  readonly i18n: {
    readonly defaultLanguage: string;
    readonly availableLanguages: readonly string[];
  };
}
