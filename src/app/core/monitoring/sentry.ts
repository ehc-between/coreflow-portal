import {
  EnvironmentProviders,
  ErrorHandler,
  Provider,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { Router } from '@angular/router';
import * as Sentry from '@sentry/angular';
import { environment } from '../../../environments/environment';

let sentryEnabled = false;

/** Whether Sentry was initialised (i.e. a DSN was configured). */
export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

/**
 * Initialise error reporting. Call once, before bootstrap (see main.ts).
 * No-op when `sentry.dsn` is empty, so non-configured environments send nothing
 * and pull in no tracing/replay machinery.
 */
export function initSentry(): void {
  const {
    dsn,
    environment: envName,
    tracesSampleRate,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
  } = environment.sentry;

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: envName,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
  });

  sentryEnabled = true;
}

/**
 * Providers that wire Sentry into Angular's error handling and router tracing.
 * Returns an empty list when reporting is disabled, leaving Angular's default
 * ErrorHandler in place.
 */
export function provideSentry(): (Provider | EnvironmentProviders)[] {
  if (!environment.sentry.dsn) {
    return [];
  }

  return [
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
    { provide: Sentry.TraceService, deps: [Router] },
    provideAppInitializer(() => {
      inject(Sentry.TraceService);
    }),
  ];
}
