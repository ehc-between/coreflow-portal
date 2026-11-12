import { DestroyRef, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/** The Transloco scope of the assistant and global search (`assets/i18n/search/`). */
export const SEARCH_SCOPE = 'search';

/**
 * Load the `search` scope for the active language (and again on every language
 * switch) without providing it as the element's scope.
 *
 * Shared pieces that sit inside module pages (`<app-ask-about>`,
 * `<app-ai-assist-button>`) or around the router outlet (the main layout) must not
 * provide a scope of their own: a component-level `provideTranslocoScope` would
 * shadow the module's route scope for everything beneath it. They call this in
 * their constructor instead and read their own strings through the
 * signal-tracked `LanguageService.translate('search.…')`, which refreshes once
 * the file has loaded.
 */
export function loadSearchScope(): void {
  const subscription = inject(TranslocoService).selectTranslation(SEARCH_SCOPE).subscribe();
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
}
