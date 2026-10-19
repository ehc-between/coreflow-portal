import {
  DestroyRef,
  EnvironmentProviders,
  ErrorHandler,
  Provider,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import * as Sentry from '@sentry/angular';
import { environment } from '../../../environments/environment';
import { hasSecrets, scrubBreadcrumb, scrubEvent, scrubRecordingEvent } from './scrub';

let sentryEnabled = false;

/**
 * Replay integration held back because the app was opened on a URL carrying a
 * secret (e.g. `/reset-password?token=…`). The recorder's initial snapshot
 * stores `location.href` verbatim and cannot be scrubbed by hooks, so recording
 * only starts once the page has removed the secret from the address bar.
 */
let pendingReplay: ReturnType<typeof Sentry.replayIntegration> | null = null;

/**
 * Last-line scrubber that runs on every event the client prepares, including
 * replay events (whose `urls` list never passes through `beforeSend`).
 */
const scrubSecretsIntegration = {
  name: 'ScrubSecrets',
  processEvent<T extends object>(event: T): T {
    return scrubEvent(event);
  },
};

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

  const replay = Sentry.replayIntegration({
    // Navigation / network frames added by Replay itself (URLs as descriptions).
    beforeAddRecordingEvent: (event) => scrubRecordingEvent(event),
  });
  const deferReplay = hasSecrets(window.location.href);
  pendingReplay = deferReplay ? replay : null;

  Sentry.init({
    dsn,
    environment: envName,
    integrations: [
      Sentry.browserTracingIntegration(),
      ...(deferReplay ? [] : [replay]),
      scrubSecretsIntegration,
    ],
    tracesSampleRate,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
    // Secret query params (token, code, secret, password) and invitation
    // tokens in API paths are replaced with `[Filtered]` everywhere a URL can
    // leak: breadcrumbs (navigation from/to, fetch/xhr url), error events
    // (request url/query string/Referer, messages) and transactions/spans.
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
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
      startDeferredReplay(inject(Router), inject(DestroyRef));
    }),
  ];
}

/** Start the held-back Replay once a navigation leaves a secret-free URL. */
function startDeferredReplay(router: Router, destroyRef: DestroyRef): void {
  if (!pendingReplay) {
    return;
  }
  const subscription = router.events.subscribe((navEvent) => {
    if (!(navEvent instanceof NavigationEnd) || !pendingReplay) {
      return;
    }
    // The browser URL may lag the router; check what the recorder would see.
    if (hasSecrets(window.location.href)) {
      return;
    }
    Sentry.addIntegration(pendingReplay);
    pendingReplay = null;
    subscription.unsubscribe();
  });
  destroyRef.onDestroy(() => subscription.unsubscribe());
}
