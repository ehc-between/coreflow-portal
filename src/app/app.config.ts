import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { errorInterceptor } from './core/http/error.interceptor';
import { provideI18n } from './core/i18n/i18n.providers';
import { LanguageService } from './core/i18n/language.service';
import { provideSentry } from './core/monitoring/sentry';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // authInterceptor attaches the in-memory bearer token and transparently
    // refreshes on 401; errorInterceptor centralises reporting + user messages.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Restore any existing session (httpOnly refresh cookie) on startup. Never
    // block bootstrap on failure — restoreSession swallows a 401 internally.
    provideAppInitializer(() => {
      inject(AuthService).restoreSession().subscribe();
    }),
    // Instantiate ThemeService at startup so the `data-theme` attribute is set
    // (from localStorage / system preference) before the first paint.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    ...provideI18n(),
    // Instantiate LanguageService at startup: it registers the locale data and
    // keeps <html lang> in step with the active language.
    provideAppInitializer(() => {
      inject(LanguageService);
    }),
    ...provideSentry(),
  ],
};
