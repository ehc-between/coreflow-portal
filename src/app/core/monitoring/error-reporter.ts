import * as Sentry from '@sentry/angular';
import { isSentryEnabled } from './sentry';

/**
 * Forward a handled error to the reporting backend (Sentry) together with
 * optional structured context. Safe to call anywhere: it's a no-op when
 * reporting is disabled, so feature code never needs to know whether Sentry is
 * configured. Use for errors you catch and handle but still want visibility on
 * (e.g. failed background requests).
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!isSentryEnabled()) {
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
