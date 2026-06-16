import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initSentry } from './app/core/monitoring/sentry';

// Initialise error reporting before bootstrap so early errors are captured.
// No-op unless a Sentry DSN is configured for the active environment.
initSentry();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
